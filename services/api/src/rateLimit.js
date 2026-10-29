// Per caller address limits: sign-in and password reset (session.js), and the
// visitor tag lookup (CTIP-33, against scraping every tag in turn). Needs
// TRUST_PROXY on the host so req.ip is the caller, not the proxy. In memory:
// it resets when the API restarts, which is fine for one instance.
const hits = new Map(); // "bucket:address" -> timestamps of recent requests

export function resetRateLimits() { hits.clear(); }

// Counts this request and says whether the caller is now over `limit`
// requests in the last `windowMs`.
export function tooMany(req, bucket, { limit, windowMs }) {
  const key = `${bucket}:${req.ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > limit;
}
