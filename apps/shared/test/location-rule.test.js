// apps/shared/test/location-rule.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { hideLocationRule, isThreatened, THREATENED } from "../data.js";
import { isExactProtected, tileServerZoom, TILE_LAYERS } from "../mapConfig.js";
import { generateMapHtml } from "../mapHtml.js";
import { plantView, shownCoords } from "../selectors.js";

test("isThreatened normalizes status and matches case-insensitively", () => {
  assert.equal(isThreatened("endangered"), true);
  assert.equal(isThreatened("Endangered"), true);
  assert.equal(isThreatened("  ENDANGERED  "), true);
  assert.equal(isThreatened("critically endangered"), true);
  assert.equal(isThreatened("Critically Endangered"), true);
  assert.equal(isThreatened("CRITICALLY ENDANGERED"), true);

  assert.equal(isThreatened("vulnerable"), false);
  assert.equal(isThreatened("Vulnerable"), false);
  assert.equal(isThreatened("least concern"), false);
  assert.equal(isThreatened("Least Concern"), false);
  assert.equal(isThreatened("near threatened"), false);
  assert.equal(isThreatened(""), false);
  assert.equal(isThreatened(null), false);
  assert.equal(isThreatened(undefined), false);
});

test("endangered species have exact coordinates locked to hidden", () => {
  for (const status of ["endangered", "critically endangered", "Endangered", "Critically Endangered"]) {
    const rule = hideLocationRule(status, false, false);
    assert.equal(rule.locked, true);
    assert.equal(rule.on, true);
    assert.match(rule.hint, /Always on for endangered species/);
  }
});

test("vulnerable species are hidden by default but can be published by officer choice", () => {
  // on by default
  assert.equal(hideLocationRule("vulnerable", false).on, true);
  assert.equal(hideLocationRule("vulnerable", false).locked, false);
  assert.equal(hideLocationRule("Vulnerable", false).on, true);
  assert.equal(hideLocationRule("Vulnerable", false).locked, false);
  assert.match(hideLocationRule("vulnerable", false).hint, /On by default for vulnerable species/);

  // officer can untick to publish location
  assert.equal(hideLocationRule("vulnerable", false, false).on, false);
});

test("plantView and shownCoords protect endangered species from public visitors while staff see exact spots", () => {
  const db = {
    species: [
      { id: "s1", scientific_name: "Nepenthes rajah", common_name: "Rajah Pitcher", conservation_status: "Endangered", is_published: true },
      { id: "s2", scientific_name: "Hevea brasiliensis", common_name: "Rubber Tree", conservation_status: "Least Concern", is_published: true },
    ],
    plants: [
      { id: "p1", species_id: "s1", qr_id: "TAG-001", lat: 3.8, lng: 113.7, is_deleted: false },
      { id: "p2", species_id: "s2", qr_id: "TAG-002", lat: 3.8, lng: 113.7, is_deleted: false },
    ],
    observations: [
      { id: "o1", specimen_id: "p1", status: "approved", observed_at: "2026-01-01" },
      { id: "o2", specimen_id: "p2", status: "approved", observed_at: "2026-01-01" },
    ],
    profiles: [],
  };

  const v1 = plantView(db, db.plants[0]);
  assert.equal(v1.endangered, true);
  assert.equal(shownCoords(v1, "visitor"), null);
  assert.deepEqual(shownCoords(v1, "botanist"), { lat: 3.8, lng: 113.7 });
  assert.deepEqual(shownCoords(v1, "officer"), { lat: 3.8, lng: 113.7 });

  const v2 = plantView(db, db.plants[1]);
  assert.equal(v2.endangered, false);
  assert.deepEqual(shownCoords(v2, "visitor"), { lat: 3.8, lng: 113.7 });
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
