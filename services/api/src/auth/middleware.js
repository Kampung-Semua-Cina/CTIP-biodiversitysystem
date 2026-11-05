import { errors } from 'jose';

export const STAFF_ROLES = ['botanist', 'officer', 'admin'];

// 401 unless the request carries a valid, unexpired Supabase access token.
// The role comes from the user_role claim, which the Supabase access token
// hook copies from public.profiles. Never read the role from the request body.
export function requireAuth(verify) {
  return async (req, res, next) => {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required. Provide a valid access token using the Authorization: Bearer <token> header.' });
    }
    try {
      const claims = await verify(token);
      req.user = { id: claims.sub, email: claims.email, role: claims.user_role ?? null, aal: claims.aal ?? 'aal1', token };
      next();
    } catch (err) {
      if (err instanceof errors.JWTExpired) {
        return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Access token expired. Refresh the session and retry.' });
      }
      return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Access token is not valid.' });
    }
  };
}

// 403 unless the signed-in user's role is one of `roles`.
export function allow(...roles) {
  return (req, res, next) => {
    if (!STAFF_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ code: 'ACCOUNT_NOT_ACTIVE', message: 'Your account has no active role yet. Ask an Admin to approve it.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Your role is not allowed to do this!' });
    }
    next();
  };
}

// 403 unless an officer or admin finished the second sign-in step (VA-70): their
// token must say aal2. `roles` are the roles that need it; `setupRoute` lets the
// two MFA routes through so the step can be done at all.
export function requireMfa(roles, setupRoute = false) {
  return (req, res, next) => {
    if (setupRoute || !roles.includes(req.user?.role) || req.user.aal === 'aal2') return next();
    return res.status(403).json({ code: 'MFA_REQUIRED', message: 'Sign in again and enter the 6-digit code from your authenticator app.' });
  };
}
