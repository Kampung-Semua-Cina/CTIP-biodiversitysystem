import { z } from 'zod';
import { supabaseFresh } from './supabase.js';
import { parseBody } from './validate.js';

// Sign-in, session refresh and passwords (CTIP-114). The web and mobile apps
// never talk to Supabase directly: they send these requests to the API, and
// the API calls Supabase Auth for them with the publishable key. The apps keep
// the access and refresh tokens they get back and send the access token on
// every other request, exactly as before.

const fail = (res, status, code, message) => res.status(status).json({ code, message });

const email = z.string().trim().toLowerCase().pipe(z.email());
const SignIn = z.strictObject({ email, password: z.string().min(1).max(200) });
const Refresh = z.strictObject({ refresh_token: z.string().min(1).max(2000) });
const Reset = z.strictObject({ email });
const NewPassword = z.strictObject({
  // Required from the account page. Left out after a password-reset link, where
  // the person signed in with the link instead of their old password.
  current_password: z.string().min(1).max(200).optional(),
  new_password: z.string().min(8, 'Use at least 8 characters').max(200),
});

// What the apps store. expires_at is in seconds since 1970, as Supabase sends it.
const toSession = (s) => ({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  expires_at: s.expires_at,
  expires_in: s.expires_in,
  token_type: s.token_type ?? 'bearer',
  user: { id: s.user?.id, email: s.user?.email },
});

// Every sign-in now reaches Supabase from the API's address, so Supabase's own
// per-address limit no longer tells callers apart. This limit does, per caller
// address (needs TRUST_PROXY on the host so req.ip is the caller, not the proxy).
// In memory: it resets when the API restarts, which is fine for one instance.
export const ATTEMPT_LIMIT = 10;
export const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const attempts = new Map(); // key -> timestamps of recent attempts
export function resetAttemptLimits() { attempts.clear(); }
function tooMany(req, bucket) {
  const key = `${bucket}:${req.ip}`;
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < ATTEMPT_WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > ATTEMPT_LIMIT;
}

// Calls Supabase Auth's REST API with the caller's own access token, for the
// two actions supabase-js only does on a client holding a session.
async function authRequest(path, { method = 'POST', token, body } = {}) {
  return fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const bearer = (req) => /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1];

export const sessionHandlers = {
  'post /auth/sign-in': async (req, res) => {
    if (tooMany(req, 'sign-in')) return fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many sign-in attempts. Wait a few minutes and try again.');
    const body = parseBody(SignIn, req, res);
    if (!body) return;
    const { data, error } = await supabaseFresh().auth.signInWithPassword(body);
    if (error) {
      if (error.code === 'email_not_confirmed') return fail(res, 403, 'EMAIL_NOT_CONFIRMED', 'Confirm your email address first, using the link we sent you.');
      if (error.status === 400 || error.code === 'invalid_credentials') return fail(res, 401, 'INVALID_CREDENTIALS', 'Wrong email or password');
      if (error.status === 429) return fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many sign-in attempts. Wait a few minutes and try again.');
      return fail(res, 502, 'AUTH_ERROR', 'Signing in is not working right now. Please try again.');
    }
    res.json(toSession(data.session));
  },

  'post /auth/refresh': async (req, res) => {
    const body = parseBody(Refresh, req, res);
    if (!body) return;
    const { data, error } = await supabaseFresh().auth.refreshSession({ refresh_token: body.refresh_token });
    if (error || !data?.session) return fail(res, 401, 'SESSION_ENDED', 'Your session has ended. Please sign in again.');
    res.json(toSession(data.session));
  },

  // Ends this session in Supabase, so its refresh token stops working. The
  // access token itself stays valid until it expires (up to about an hour);
  // the app deletes it straight away. Always 204: signing out cannot fail for the user.
  'post /auth/sign-out': async (req, res) => {
    const token = bearer(req);
    if (token) await authRequest('/logout?scope=local', { token }).catch(() => {});
    res.status(204).end();
  },

  // Always 202, whether or not the address has an account, so the form cannot
  // be used to find out who has one. The email links back to the website
  // (PASSWORD_RESET_REDIRECT_URL, else the Site URL set in Supabase).
  'post /auth/password-reset': async (req, res) => {
    if (tooMany(req, 'password-reset')) return fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many requests. Wait a few minutes and try again.');
    const body = parseBody(Reset, req, res);
    if (!body) return;
    const redirectTo = process.env.PASSWORD_RESET_REDIRECT_URL || undefined;
    const { error } = await supabaseFresh().auth.resetPasswordForEmail(body.email, { redirectTo });
    if (error) console.warn('password reset email not sent:', error.message);
    res.status(202).json({ sent: true });
  },

  'post /me/password': async (req, res) => {
    const body = parseBody(NewPassword, req, res);
    if (!body) return;
    if (body.current_password) {
      if (body.current_password === body.new_password) {
        return fail(res, 422, 'SAME_PASSWORD', 'Choose a password different from your current one');
      }
      const check = await supabaseFresh().auth.signInWithPassword({ email: req.user.email, password: body.current_password });
      if (check.error) return fail(res, 403, 'WRONG_PASSWORD', 'Your current password is incorrect');
      // The check opened a session of its own; close it again.
      await authRequest('/logout?scope=local', { token: check.data.session.access_token }).catch(() => {});
    }
    const updated = await authRequest('/user', { method: 'PUT', token: req.user.token, body: { password: body.new_password } });
    if (updated.ok) return res.status(204).end();
    const err = await updated.json().catch(() => ({}));
    if (err.error_code === 'same_password') return fail(res, 422, 'SAME_PASSWORD', 'Choose a password different from your current one');
    if (err.error_code === 'weak_password') return fail(res, 422, 'WEAK_PASSWORD', err.msg || 'Choose a stronger password');
    if (err.error_code === 'reauthentication_needed') return fail(res, 403, 'SIGN_IN_AGAIN', 'Sign in again, then change your password');
    return fail(res, 502, 'AUTH_ERROR', 'Changing the password is not working right now. Please try again.');
  },
};
