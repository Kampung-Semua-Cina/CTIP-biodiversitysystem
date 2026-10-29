import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanTerm, buildSpeciesQuery, initialSearchState, nextSearchState, failSearchState,
  hasMore, summarize, searchErrorMessage,
} from "../speciesSearch.js";

// Species search on the phone (CTIP-26): what is sent to GET /public/species,
// and how pages of results are put together while the botanist types.

test("cleanTerm drops characters the API would reject", () => {
  assert.equal(cleanTerm("  nep%en(thes)  "), "nepenthes");
  assert.equal(cleanTerm('a,b"c*d_e'), "abcde");
  assert.equal(cleanTerm("pitcher   plant"), "pitcher plant");
});

test("cleanTerm keeps hybrid signs, apostrophes, dots and hyphens", () => {
  assert.equal(cleanTerm("Nepenthes × hookeriana"), "Nepenthes × hookeriana");
  assert.equal(cleanTerm("Keith's rafflesia"), "Keith's rafflesia");
  assert.equal(cleanTerm("N. rafflesiana-x"), "N. rafflesiana-x");
});

test("cleanTerm keeps at most 100 characters", () => {
  assert.equal(cleanTerm("a".repeat(150)).length, 100);
});

test("buildSpeciesQuery sends nothing until there is something to search", () => {
  assert.equal(buildSpeciesQuery({ q: "%" }), null);
  assert.equal(buildSpeciesQuery({ q: "n" }), null);
  assert.equal(buildSpeciesQuery({}), null);
});

test("buildSpeciesQuery leaves empty values out and defaults the page size", () => {
  assert.deepEqual(buildSpeciesQuery({ q: " nep ", page: 2 }), { q: "nep", page: 2, limit: 20 });
  assert.deepEqual(buildSpeciesQuery({ q: "", family: "Nepenthaceae" }), { family: "Nepenthaceae", page: 1, limit: 20 });
  assert.deepEqual(buildSpeciesQuery({ q: "nep", family: "all" }), { q: "nep", page: 1, limit: 20 });
});

test("a response for an older search is ignored", () => {
  const s0 = initialSearchState("nepenthes");
  const stale = nextSearchState(s0, { key: "nep", data: [{ id: "old" }], meta: { page: 1, total: 9 } });
  assert.equal(stale, s0);
  assert.equal(failSearchState(s0, { key: "nep", error: { code: "NETWORK_ERROR" } }), s0);
});

test("pages are added in order and the end is known", () => {
  const s0 = initialSearchState("nepenthes");
  assert.deepEqual(s0, { key: "nepenthes", items: [], page: 0, total: null, loading: true, error: null });
  const s1 = nextSearchState(s0, { key: "nepenthes", data: [{ id: "a" }], meta: { page: 1, total: 2 } });
  assert.equal(hasMore(s1), true);
  assert.equal(s1.loading, false);
  const s2 = nextSearchState({ ...s1, loading: true }, { key: "nepenthes", data: [{ id: "b" }], meta: { page: 2, total: 2 } });
  assert.deepEqual(s2.items.map((x) => x.id), ["a", "b"]);
  assert.equal(s2.page, 2);
  assert.equal(hasMore(s2), false);
});

test("page 1 replaces what was shown, and a failure keeps the results so far", () => {
  const shown = { key: "nep", items: [{ id: "x" }], page: 1, total: 5, loading: true, error: null };
  assert.deepEqual(nextSearchState(shown, { key: "nep", data: [{ id: "y" }], meta: { page: 1, total: 1 } }).items, [{ id: "y" }]);
  const failed = failSearchState(shown, { key: "nep", error: { code: "NETWORK_ERROR" } });
  assert.deepEqual(failed.items, [{ id: "x" }]);
  assert.equal(failed.loading, false);
  assert.match(failed.error, /^No connection\./);
});

test("summarize gives the first sentence, or a short cut at a word", () => {
  assert.equal(summarize(null), "");
  assert.equal(summarize("   "), "");
  assert.equal(summarize("Largest pitcher plant. Grows on ultramafic soil."), "Largest pitcher plant.");
  const cut = summarize("word ".repeat(40));
  assert.ok(cut.endsWith("…"));
  assert.ok(cut.length <= 91);
  assert.ok(!cut.includes("wor…"), "cut at a word boundary");
});

test("searchErrorMessage explains a missing connection and passes other messages on", () => {
  assert.equal(searchErrorMessage({ code: "NETWORK_ERROR" }),
    "No connection. Species search needs the internet. You can still type the species name yourself.");
  assert.equal(searchErrorMessage({ code: "FORBIDDEN", userMessage: "Your role is not allowed to do this." }),
    "Your role is not allowed to do this.");
  assert.equal(searchErrorMessage(new Error("boom")), "Species search failed. Please try again.");
});
