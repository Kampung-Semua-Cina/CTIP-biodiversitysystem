import { z } from 'zod';
import { parseBody, fail } from './validate.js';
import { tooMany as overLimit } from './rateLimit.js';
import { ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS, toSession } from './session.js';

// Two-step sign-in with an authenticator app (VA-70, lecturer feedback; CTIP-50).
// Every signed-in role (botanist, officer, admin) must use it: an access token
// only works for the rest of the API once it says aal2 ("signed in with
// password AND a 6-digit code"). Visitors do not sign in. The apps never call Supabase Auth themselves:
// these routes call its MFA endpoints with the person's own access token.
//
// Flow, after POST /auth/sign-in (which answers mfa: "none" | "verify" | "setup"):
//   setup:  POST /auth/mfa/enroll  -> QR code and set-up key for the authenticator app
//           POST /auth/mfa/verify  -> { code } -> new session (aal2)
//   verify: POST /auth/mfa/verify  -> { code } -> new session (aal2)

// The roles that must use a second step (Tan, 5 Nov 2026: every staff account).
export const MFA_ROLES = ['botanist', 'officer', 'admin'];

// Routes an officer or admin may call before the second step: only the two below.
export const MFA_SETUP_ROUTES = new Set(['post /auth/mfa/enroll', 'post /auth/mfa/verify']);

const Verify = z.strictObject({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app') });

// Supabase Auth's REST API, called with the signed-in person's own token.
async function authRequest(path, { method = 'POST', token, body } = {}) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Logged on the server only, so a failed set-up can be traced (no codes or keys).
  if (!res.ok) console.warn(`MFA: ${method} ${path} -> ${res.status} ${data.error_code ?? data.code ?? ''} ${data.msg ?? data.message ?? ''}`.trim());
  return { ok: res.ok, status: res.status, data };
}

// The person's authenticator-app factors, from GET /auth/v1/user.
async function totpFactors(token) {
  const r = await authRequest('/user', { method: 'GET', token });
  if (!r.ok) return null;
  return (r.data.factors ?? []).filter((f) => f.factor_type === 'totp');
}

// What the person has to do after a correct password. `user` is the Supabase
// user from the sign-in answer (it lists the factors); `role` is the user_role claim.
export function mfaStep(user, role) {
  const verified = (user?.factors ?? []).some((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (verified) return 'verify';
  return MFA_ROLES.includes(role) ? 'setup' : 'none';
}

const tooMany = (req) => overLimit(req, 'mfa-verify', { limit: ATTEMPT_LIMIT, windowMs: ATTEMPT_WINDOW_MS });

export const mfaHandlers = {
  // A new authenticator-app factor, waiting for its first code. Refused when one
  // is already set up: a lost phone is reset by an admin in Supabase, not here,
  // so a stolen password cannot replace the owner's app.
  'post /auth/mfa/enroll': async (req, res) => {
    const factors = await totpFactors(req.user.token);
    if (!factors) return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    if (factors.some((f) => f.status === 'verified')) {
      return fail(res, 409, 'MFA_ALREADY_SET_UP', 'Two-step sign-in is already set up. Ask an admin to reset it if you lost your phone.');
    }
    // Earlier set-ups that were never finished: removed, so the new one can use the same name.
    for (const f of factors) await authRequest(`/factors/${f.id}`, { method: 'DELETE', token: req.user.token }).catch(() => {});
    const r = await authRequest('/factors', {
      token: req.user.token,
      body: { factor_type: 'totp', friendly_name: 'Daun Sense', issuer: 'Daun Sense' },
    });
    if (!r.ok || !r.data?.totp) return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    res.status(201).json({ factor_id: r.data.id, qr_code: r.data.totp.qr_code, secret: r.data.totp.secret, uri: r.data.totp.uri });
  },

  // Checks the 6-digit code and answers with a new session that says aal2.
  // Uses the verified factor, or else the one just enrolled.
  'post /auth/mfa/verify': async (req, res) => {
    if (tooMany(req)) return fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many codes tried. Wait a few minutes and try again.');
    const body = parseBody(Verify, req, res);
    if (!body) return;
    const factors = await totpFactors(req.user.token);
    if (!factors) return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    const factor = factors.find((f) => f.status === 'verified') ?? factors.at(-1);
    if (!factor) return fail(res, 409, 'MFA_NOT_SET_UP', 'Set up two-step sign-in first.');
    const challenge = await authRequest(`/factors/${factor.id}/challenge`, { token: req.user.token });
    if (!challenge.ok || !challenge.data?.id) return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    const checked = await authRequest(`/factors/${factor.id}/verify`, {
      token: req.user.token,
      body: { challenge_id: challenge.data.id, code: body.code },
    });
    if (!checked.ok || !checked.data?.access_token) {
      if (checked.status === 400 || checked.status === 422) return fail(res, 401, 'WRONG_CODE', 'That code is not right. Check the time on your phone and try the newest code.');
      return fail(res, 502, 'AUTH_ERROR', 'Two-step sign-in is not working right now. Please try again.');
    }
    res.json(toSession(checked.data));
  },
};
