import { createApp } from './app.js';
import { createVerifier } from './auth/verifyToken.js';
import { checkSecureConfig } from './https.js';
import { MFA_ROLES } from './mfa.js';

checkSecureConfig(process.env);

// TRUST_PROXY: how many proxies sit in front of the API (usually 1 when hosted).
const trustProxy = /^\d+$/.test(process.env.TRUST_PROXY ?? '') ? Number(process.env.TRUST_PROXY) : false;

const app = createApp({
  verify: createVerifier({ supabaseUrl: process.env.SUPABASE_URL }),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
  requireHttps: process.env.REQUIRE_HTTPS === 'true',
  trustProxy,
  // VA-70: every staff member needs the 6-digit code. MFA_OFF=true only for a
  // local test database where nobody can set it up; never on Render.
  mfaRoles: process.env.MFA_OFF === 'true' ? [] : MFA_ROLES,
});

const port = process.env.PORT ?? 8000;
app.listen(port, () => console.log(`API running on http://localhost:${port}/v1`));
