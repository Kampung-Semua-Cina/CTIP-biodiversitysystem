import { z } from 'zod';
import { supabaseFresh } from './supabase.js';
import { parseBody, fail } from './validate.js';
import { tooMany as overLimit, resetRateLimits } from './rateLimit.js';
import { recordEmailSent, isEmailRateLimit, emailLimitInfo, emailLimitMessage } from './emailLimit.js';
import { mfaStep } from './mfa.js';

// Sign-in, session refresh and passwords (CTIP-114). The web and mobile apps
// never talk to Supabase directly: they send these requests to the API, and
// the API calls Supabase Auth for them with the publishable key. The apps keep
// the access and refresh tokens they get back and send the access token on
// every other request, exactly as before.

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

// What the apps store. expires_at is in seconds since 1970, as Supabase sends it
// (the MFA verify answer has only expires_in, so it is worked out from that).
export const toSession = (s) => ({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  expires_at: s.expires_at ?? (s.expires_in ? Math.floor(Date.now() / 1000) + s.expires_in : undefined),
  expires_in: s.expires_in,
  token_type: s.token_type ?? 'bearer',
  user: { id: s.user?.id, email: s.user?.email },
});

// The user_role claim of a token Supabase has just issued to us. Read without
// checking the signature: it came straight from Supabase, not from the caller.
function roleIn(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).user_role ?? null;
  } catch {
    return null;
  }
}

// Every sign-in now reaches Supabase from the API's address, so Supabase's own
// per-address limit no longer tells callers apart. This limit does, per caller
// address (see rateLimit.js).
export const ATTEMPT_LIMIT = 10;
export const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
export const resetAttemptLimits = resetRateLimits;
const tooMany = (req, bucket) => overLimit(req, bucket, { limit: ATTEMPT_LIMIT, windowMs: ATTEMPT_WINDOW_MS });

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
    // mfa: what comes next. "verify": type the 6-digit code (POST /auth/mfa/verify).
    // "setup": officers and admins must set up an authenticator app first
    // (POST /auth/mfa/enroll). "none": signed in. Until then the session only
    // reaches the two MFA routes (VA-70).
    res.json({ ...toSession(data.session), mfa: mfaStep(data.user ?? data.session.user, roleIn(data.session.access_token)) });
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
    // The limit is for the whole project, so saying so tells nobody whether this address has an account.
    if (isEmailRateLimit(error)) {
      const info = emailLimitInfo();
      return res.status(429).json({ code: 'EMAIL_RATE_LIMIT', message: `${emailLimitMessage(info)} No reset email was sent.`, details: info });
    }
    if (!error) recordEmailSent();
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
