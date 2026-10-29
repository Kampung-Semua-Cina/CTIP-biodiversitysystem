// apps/shared/speciesSearch.js
// Species search through GET /v1/public/species (CTIP-26): what to send, and how
// pages of results are put together while someone types. Plain functions with no
// imports, so they run in both apps and in `node --test`.

export const PAGE_SIZE = 20; // the API's default `limit`
const MIN_LENGTH = 2; // one letter matches almost everything
const MAX_LENGTH = 100; // the API's limit for a search term

// Keeps only what the API accepts in a search term (letters, digits, spaces and
// . ' - ×, see services/api/src/species.js), so typing "%" or "(" never turns
// into an error the user cannot fix.
export function cleanTerm(raw) {
  return String(raw ?? "")
    .replace(/[^\p{L}\p{N} .'\-×]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LENGTH);
}

// The query for one page, or null when there is nothing worth searching yet.
// "all" is the family pill that means no family filter.
export function buildSpeciesQuery({ q, family, page = 1, limit = PAGE_SIZE } = {}) {
  const term = cleanTerm(q);
  const fam = family && family !== "all" ? cleanTerm(family) : "";
  if (term.length < MIN_LENGTH && !fam) return null;
  const query = {};
  if (term.length >= MIN_LENGTH) query.q = term;
  if (fam) query.family = fam;
  return { ...query, page, limit };
}

// `key` names one search (the query without its page). Responses are matched
// against it, so an answer to an older search that arrives late is dropped.
export function initialSearchState(key) {
  return { key, items: [], page: 0, total: null, loading: true, error: null };
}

export function nextSearchState(prev, { key, data, meta }) {
  if (key !== prev.key) return prev;
  const page = meta?.page ?? 1;
  const items = page > 1 ? [...prev.items, ...data] : data;
  return { ...prev, items, page, total: meta?.total ?? items.length, loading: false, error: null };
}

// A failed page keeps whatever was already shown.
export function failSearchState(prev, { key, error }) {
  if (key !== prev.key) return prev;
  return { ...prev, loading: false, error: searchErrorMessage(error) };
}

export function hasMore(state) {
  return state.total !== null && state.items.length < state.total;
}

// One line for a result row: the first sentence, or a cut at a word boundary.
export function summarize(text, max = 90) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentence = clean.match(/^.+?[.!?](?=\s|$)/)?.[0];
  if (sentence && sentence.length <= max) return sentence;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, "") + "…";
}

// What to tell the botanist when a search fails. Without a connection they can
// still type the name themselves, so say so.
export function searchErrorMessage(err) {
  if (err?.code === "NETWORK_ERROR") {
    return "No connection. Species search needs the internet. You can still type the species name yourself.";
  }
  return err?.userMessage ?? "Species search failed. Please try again.";
}
