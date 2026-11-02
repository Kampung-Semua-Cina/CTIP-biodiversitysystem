// apps/shared/test/reports-book.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookEntries, bookLetters, countPlants } from "../selectors.js";
import { keepPhotoUrl, safeImageUrl } from "../utils.js";

const plants = (family, n) => Array.from({ length: n }, () => ({ family }));

test("countPlants sorts most first and leaves out plants with no value", () => {
  const rows = countPlants([...plants("B", 1), ...plants("A", 3), ...plants(null, 2)], (p) => p.family);
  assert.deepEqual(rows.map((r) => [r.label, r.n]), [["A", 3], ["B", 1]]);
  assert.equal(rows[0].plants.length, 3);
});

test("countPlants folds the smallest groups into Other, which cannot be picked", () => {
  const rows = countPlants(["a", "b", "c", "d"].flatMap((f, i) => plants(f, 4 - i)), (p) => p.family, 2);
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.n]), [["a", "a", 4], ["b", "b", 3], [null, "Other", 3]]);
});

test("the plant book holds published species only, and no plant locations", () => {
  const entries = bookEntries([
    { id: "1", common_name: "Zebra", scientific_name: "Z z", is_published: true, lat: 3.8, lng: 113.7, plants: [{ lat: 3.8 }] },
    { id: "2", common_name: null, scientific_name: "Alpha a", is_published: true },
    { id: "3", common_name: "Draft", scientific_name: "D d", is_published: false },
    { id: "4", common_name: "Gone", scientific_name: "G g", is_published: true, is_deleted: true },
  ]);
  assert.deepEqual(entries.map((e) => e.id), ["2", "1"]);
  assert.doesNotMatch(JSON.stringify(entries), /lat|lng|plants/);
  assert.deepEqual(bookLetters(entries).map((g) => g.letter), ["A", "Z"]);
});

test("old http image links are upgraded, and development addresses are left alone", () => {
  assert.equal(safeImageUrl("http://example.org/a.jpg"), "https://example.org/a.jpg");
  assert.equal(safeImageUrl("https://example.org/a.jpg"), "https://example.org/a.jpg");
  assert.equal(safeImageUrl("http://localhost:3000/a.jpg"), "http://localhost:3000/a.jpg");
  assert.equal(safeImageUrl("http://192.168.1.5/a.jpg"), "http://192.168.1.5/a.jpg");
  assert.equal(safeImageUrl("data:image/gif;base64,AA"), "data:image/gif;base64,AA");
  assert.equal(safeImageUrl(null), null);
});

test("a photo link is kept between refreshes, then swapped before it expires", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const cache = new Map();
  assert.equal(keepPhotoUrl(cache, "p1", "https://x/a?token=1"), "https://x/a?token=1");
  t.mock.timers.tick(11 * 60 * 60 * 1000);
  assert.equal(keepPhotoUrl(cache, "p1", "https://x/a?token=2"), "https://x/a?token=1");
  assert.equal(keepPhotoUrl(cache, "p1", null), "https://x/a?token=1");
  t.mock.timers.tick(2 * 60 * 60 * 1000);
  assert.equal(keepPhotoUrl(cache, "p1", "https://x/a?token=3"), "https://x/a?token=3");
});
