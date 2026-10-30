// apps/shared/fuzzy.js
// Lightweight fuzzy search utility with subsequence, token-based, and typo tolerance matching.
// Zero dependencies, runs in web, mobile (React Native), and Node.js.

/**
 * Compute the Levenshtein distance between two strings.
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/**
 * Returns true if needle matches haystack using fuzzy rules:
 * 1. Exact substring match
 * 2. Multi-word query (all words must match)
 * 3. Character subsequence match (needle chars appear in order)
 * 4. Typo tolerance on word tokens (Levenshtein distance <= 1 or 2 depending on length)
 */
export function fuzzyMatch(haystack, needle) {
  if (!needle) return true;
  if (!haystack) return false;

  const h = String(haystack).toLowerCase();
  const n = String(needle).trim().toLowerCase();
  if (!n) return true;

  // 1. Exact substring
  if (h.includes(n)) return true;

  // 2. Multi-word: every word in the search query must match
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words.every((w) => fuzzyMatch(h, w));
  }

  // 3. Subsequence match (in-order characters)
  let hIdx = 0;
  let nIdx = 0;
  while (hIdx < h.length && nIdx < n.length) {
    if (h[hIdx] === n[nIdx]) {
      nIdx++;
    }
    hIdx++;
  }
  if (nIdx === n.length) return true;

  // 4. Word-token typo tolerance
  const tokens = h.split(/[\s,._\-/()]+/).filter(Boolean);
  const maxDist = n.length >= 7 ? 2 : n.length >= 4 ? 1 : 0;
  if (maxDist > 0) {
    for (const tok of tokens) {
      if (Math.abs(tok.length - n.length) <= maxDist) {
        if (levenshteinDistance(tok, n) <= maxDist) return true;
      }
      if (tok.length > n.length) {
        for (let i = 0; i <= tok.length - n.length; i++) {
          const sub = tok.slice(i, i + n.length);
          if (levenshteinDistance(sub, n) <= maxDist) return true;
        }
      }
    }
  }

  return false;
}
