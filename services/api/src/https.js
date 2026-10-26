// HTTPS only (CTIP-35). In production every request must arrive over HTTPS;
// a plain-HTTP request is rejected, not redirected, because by the time it
// arrives its token and body have already crossed the network unencrypted.
// Behind a hosting proxy that ends TLS (Render, Railway, Nginx...), set
// TRUST_PROXY so Express believes the proxy's X-Forwarded-Proto header.
const ONE_YEAR = 60 * 60 * 24 * 365;

export function requireHttps() {
  return (req, res, next) => {
    if (!req.secure) {
      return res.status(403).json({ code: 'HTTPS_REQUIRED', message: 'Use https:// to call this API' });
    }
    // Tell browsers to use HTTPS for this host from now on (HSTS).
    res.set('Strict-Transport-Security', `max-age=${ONE_YEAR}; includeSubDomains`);
    next();
  };
}

// Fails at start-up rather than running half-secure in production.
export function checkSecureConfig(env) {
  if (env.REQUIRE_HTTPS !== 'true') return;
  if (!env.SUPABASE_URL?.startsWith('https://')) {
    throw new Error('REQUIRE_HTTPS is on, so SUPABASE_URL must start with https://');
  }
  for (const origin of (env.CORS_ORIGINS ?? '').split(',').filter(Boolean)) {
    if (!origin.startsWith('https://')) throw new Error(`REQUIRE_HTTPS is on, so CORS origin ${origin} must use https://`);
  }
}
