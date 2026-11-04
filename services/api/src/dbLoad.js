// How busy the database is, measured from the API's own Supabase calls, and
// how long the apps should wait before their next poll.
//
// Every query through supabase.js goes through timedFetch(), which keeps a
// moving average of how long Supabase takes to answer and how many calls are
// waiting. The apps poll every 5 seconds while that stays low and slow down
// (up to a minute) while it is high, so a busy database gets room to recover
// instead of a pile of requests that all time out.

export const BASE_POLL_MS = 5000;
export const MAX_POLL_MS = 60000;
const SMOOTHING = 0.1; // weight of the newest call in the moving average
const STALE_MS = 60000; // no calls for a minute: nothing to judge, so assume free

let averageMs = null;
let inFlight = 0;
let lastAt = 0;

// Slower answers or a long queue mean a longer wait. Each step is one level.
const LEVELS = [
  { state: 'free', underMs: 400, pollMs: BASE_POLL_MS },
  { state: 'normal', underMs: 1000, pollMs: 10000 },
  { state: 'busy', underMs: 2500, pollMs: 20000 },
  { state: 'very busy', underMs: 5000, pollMs: 40000 },
  { state: 'overloaded', underMs: Infinity, pollMs: MAX_POLL_MS },
];

export function record(ms, now = Date.now()) {
  averageMs = averageMs === null ? ms : averageMs + SMOOTHING * (ms - averageMs);
  lastAt = now;
}

export function dbLoad(now = Date.now()) {
  const known = averageMs !== null && now - lastAt < STALE_MS;
  let level = known ? LEVELS.findIndex((l) => averageMs < l.underMs) : 0;
  if (inFlight > 40) level = Math.max(level, 3); // a long queue is busy whatever the average says
  else if (inFlight > 20) level = Math.max(level, 2);
  const { state, pollMs } = LEVELS[level];
  return { state, latency_ms: known ? Math.round(averageMs) : null, in_flight: inFlight, poll_after_ms: pollMs };
}

// For tests.
export function resetDbLoad() {
  averageMs = null;
  inFlight = 0;
  lastAt = 0;
}

// fetch for the Supabase clients. Looks up globalThis.fetch on every call so
// the tests' fake Supabase still answers. Only database (REST) calls count:
// Storage and Auth have their own servers.
export async function timedFetch(input, init) {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (!url.includes('/rest/v1/')) return globalThis.fetch(input, init);
  const started = Date.now();
  inFlight += 1;
  try {
    return await globalThis.fetch(input, init);
  } finally {
    inFlight -= 1;
    record(Date.now() - started);
  }
}
