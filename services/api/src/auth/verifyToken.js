import { createRemoteJWKSet, jwtVerify } from 'jose';

// Checks a Supabase access token: signature, expiry, issuer and audience.
// Supabase publishes its public signing keys at /auth/v1/.well-known/jwks.json,
// so the API never needs a JWT secret. Tests pass their own keySet.
export function createVerifier({ supabaseUrl, keySet }) {
  const keys = keySet ?? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  const issuer = `${supabaseUrl}/auth/v1`;

  return async function verify(token) {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    });
    return payload;
  };
}
