// apps/shared/test/location-rule.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { hideLocationRule } from "../data.js";
import { isExactProtected, tileServerZoom, TILE_LAYERS } from "../mapConfig.js";
import { generateMapHtml } from "../mapHtml.js";

test("red status species (endangered and vulnerable) automatically disable GPS metadata and location sharing", () => {
  for (const status of ["endangered", "critically endangered", "vulnerable"]) {
    const rule = hideLocationRule(status, false, false);
    assert.equal(rule.locked, true);
    assert.equal(rule.on, true);
    assert.match(rule.hint, /Automatically disabled for red status species/);
  }
});

test("vulnerable species have GPS metadata automatically disabled", () => {
  assert.equal(hideLocationRule("vulnerable", false).on, true);
  assert.equal(hideLocationRule("vulnerable", false).locked, true);
  assert.equal(hideLocationRule("vulnerable", false, false).on, true);
  assert.match(hideLocationRule("vulnerable", false).hint, /Automatically disabled/);
});

test("other species are the officer's choice and start from what is saved", () => {
  assert.equal(hideLocationRule("least concern", false).on, false);
  assert.equal(hideLocationRule("least concern", true).on, true);
  assert.equal(hideLocationRule("least concern", false, true).on, true);
  assert.equal(hideLocationRule(undefined, false).locked, false);
});

test("every wording says that details and photos stay visible", () => {
  for (const status of ["endangered", "vulnerable", "least concern"]) {
    assert.match(hideLocationRule(status).hint, /Plant details and photos stay visible/);
  }
});

test("only an exact protected spot limits the map tiles", () => {
  assert.equal(isExactProtected({ endangered: true }), true);
  assert.equal(isExactProtected({ endangered: true, location_reduced: true }), false, "the 1.1 km area reveals nothing new");
  assert.equal(isExactProtected({ endangered: false }), false);
  assert.equal(tileServerZoom(TILE_LAYERS.osm), 19);
  assert.equal(tileServerZoom(TILE_LAYERS.satellite), 18);
});

test("the mobile map page's script is valid JavaScript", () => {
  const html = generateMapHtml({ points: [{ id: "a", qr_id: "NIAH-0001", name: "x", lat: 3.8, lng: 113.7, protect: true }] });
  const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(script));
});
