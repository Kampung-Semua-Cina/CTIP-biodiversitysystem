import { test } from "node:test";
import assert from "node:assert/strict";
import { tagUrl } from "../selectors.js";
import { PUBLIC_SITE_URL } from "../site.js";

// A QR tag holds a link to the plant's page on the website (CTIP-27). On the phone
// there is no browser address to build it from, so it must use the live site.

test("tagUrl without a browser points at the plant page on the live site", () => {
  assert.equal(PUBLIC_SITE_URL, "https://ctip-biodiversitysystem.pages.dev");
  assert.equal(tagUrl("NIAH-0042"), "https://ctip-biodiversitysystem.pages.dev/#/dashboard/NIAH-0042");
});

test("the tag ID can be read back from the link the way the scanner does", () => {
  assert.equal(tagUrl("NIAH-0042").toUpperCase().match(/NIAH-\d{4}/)[0], "NIAH-0042");
});
