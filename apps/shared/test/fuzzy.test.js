// apps/shared/test/fuzzy.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { fuzzyMatch, levenshteinDistance } from "../fuzzy.js";

test("levenshteinDistance computes correct edit distances", () => {
  assert.equal(levenshteinDistance("", ""), 0);
  assert.equal(levenshteinDistance("a", ""), 1);
  assert.equal(levenshteinDistance("", "b"), 1);
  assert.equal(levenshteinDistance("pitcher", "pitcher"), 0);
  assert.equal(levenshteinDistance("pitcher", "pithcer"), 2);
  assert.equal(levenshteinDistance("rajah", "raja"), 1);
});

test("fuzzyMatch matches exact, subsequence, multi-token, and typo variants", () => {
  const target = "Nepenthes rajah (Giant Pitcher Plant) - Nepenthaceae";

  // Exact & case insensitive
  assert.equal(fuzzyMatch(target, "nepenthes"), true);
  assert.equal(fuzzyMatch(target, "RAJAH"), true);
  assert.equal(fuzzyMatch(target, "pitcher"), true);

  // Subsequence
  assert.equal(fuzzyMatch(target, "npnth"), true);

  // Multi-word / reordered
  assert.equal(fuzzyMatch(target, "pitcher nepenthes"), true);
  assert.equal(fuzzyMatch(target, "giant rajah"), true);

  // Typo tolerance
  assert.equal(fuzzyMatch(target, "pithcer"), true); // typo in pitcher
  assert.equal(fuzzyMatch(target, "nephenthes"), true); // typo in nepenthes

  // Non-matches
  assert.equal(fuzzyMatch(target, "orchid"), false);
  assert.equal(fuzzyMatch(target, "bamboo"), false);
});
