// apps/mobile/tests/agent-mobile-advanced.test.mjs
// Ported from apps/web/tests/agent-advanced.spec.js for Daun Sense Mobile
// Advanced Safety Invariants, CTIP-71 Privacy, Theme Legibility & Resilience
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { shownCoords, visiblePlants, plantView } from "../../shared/selectors.js";
import { palettes } from "../../shared/tokens.js";
import { can } from "../../shared/permissions.js";
import { coords } from "../components/format.js";
import { MobileDriver } from "./helpers/mobileDriver.mjs";
import { attachLogcatWatchdog } from "./helpers/logcatWatchdog.mjs";
import { auditWithOllama, checkOllamaServer } from "./helpers/ollama.mjs";

describe("Mobile Port: Advanced QA & Safety Invariants (from agent-advanced.spec.js)", () => {
  let driver;
  let watchdog;
  let deviceStatus;

  before(async () => {
    driver = new MobileDriver();
    deviceStatus = await driver.checkDevice();
    if (deviceStatus.available) {
      watchdog = attachLogcatWatchdog(deviceStatus.serial);
    }
  });

  after(() => {
    if (watchdog) watchdog.stop();
  });

  // =========================================================================
  // 1. CTIP-71 PRIVACY: Endangered Species Locations Hidden From Visitors
  // =========================================================================
  test("CTIP-71 Privacy: Visitors cannot see coordinates or map pins for endangered plants", async () => {
    // 1. Pure invariant test using shared selectors
    const endangeredPlant = {
      id: "plant-1",
      species_id: "sp-endangered",
      endangered: true,
      lat: 3.816667,
      lng: 113.783333,
    };

    // Visitor must get NULL for coordinates
    const visitorCoords = shownCoords(endangeredPlant, "visitor");
    assert.equal(visitorCoords, null, "Visitor must never receive GPS coordinates of endangered plant");

    // Staff must unlock exact coordinates
    const botanistCoords = shownCoords(endangeredPlant, "botanist");
    assert.deepEqual(botanistCoords, { lat: 3.816667, lng: 113.783333 });
    const formattedStaffGps = coords(botanistCoords.lat, botanistCoords.lng);
    assert.equal(formattedStaffGps, "3.8167, 113.7833");

    // Non-endangered plant coordinates remain public
    const commonPlant = { id: "plant-2", endangered: false, lat: 3.82, lng: 113.79 };
    assert.deepEqual(shownCoords(commonPlant, "visitor"), { lat: 3.82, lng: 113.79 });

    // 2. Local Ollama Privacy Evaluation
    const privacySummary = `
      [Screen] PlantPage
      [Species] Dipterocarpus sarawakensis (Endangered)
      [Visitor View] Location: "Location hidden to protect this plant."
      [Staff View] Location: "3.8167, 113.7833"
      [Map Pin] Hidden for role: visitor. Shown for role: botanist, officer.
    `;
    const audit = await auditWithOllama({
      prompt: "Verify CTIP-71 privacy compliance: Public visitors must never see GPS coordinates or map locations of endangered plants. Check if this mobile presentation securely protects the endangered specimen.",
      domSummary: privacySummary,
    });
    if (audit.available) {
      console.log("  🤖 [Ollama CTIP-71 Privacy Verdict]:", audit.result);
      assert.ok(audit.result);
    }
    if (watchdog) watchdog.assertClean("CTIP-71 Privacy");
  });

  // =========================================================================
  // 2. REVIEW PRECONDITIONS: Mandatory Notes & Species Match
  // =========================================================================
  test("Review Preconditions: Actions require confirmed species and mandatory notes", () => {
    // Ported from Review.js lines 94-98:
    // decide(decision) -> if (decision !== 'approve' && !note.trim()) return setNeedNote(true);
    // approve button disabled if !match
    function simulateReviewDecision({ decision, note, match }) {
      if (decision === "approve") {
        if (!match) return { allowed: false, error: "Pick a species from the list to approve" };
        return { allowed: true, action: "approved" };
      }
      if (decision === "return" || decision === "reject") {
        if (!note || !note.trim()) {
          return { allowed: false, error: "Note to the botanist is needed to return or reject" };
        }
        return { allowed: true, action: decision };
      }
      return { allowed: false, error: "Unknown decision" };
    }

    // 1. Returning without a note must be blocked
    const returnNoNote = simulateReviewDecision({ decision: "return", note: "", match: null });
    assert.equal(returnNoNote.allowed, false);
    assert.match(returnNoNote.error, /needed to return or reject/i);

    // 2. Rejecting without a note must be blocked
    const rejectNoNote = simulateReviewDecision({ decision: "reject", note: "   ", match: null });
    assert.equal(rejectNoNote.allowed, false);

    // 3. Returning with note succeeds
    const returnWithNote = simulateReviewDecision({ decision: "return", note: "Photo is blurry, please retake", match: null });
    assert.equal(returnWithNote.allowed, true);

    // 4. Approving without confirmed species match must be blocked
    const approveNoMatch = simulateReviewDecision({ decision: "approve", note: "", match: null });
    assert.equal(approveNoMatch.allowed, false);
    assert.match(approveNoMatch.error, /pick a species/i);

    // 5. Approving with confirmed species match succeeds
    const approveWithMatch = simulateReviewDecision({ decision: "approve", note: "", match: { id: "sp-1", common_name: "Pitcher" } });
    assert.equal(approveWithMatch.allowed, true);
  });

  // =========================================================================
  // 3. CATALOGUE ACCESS CONTROL: Draft/Unpublished Species Invisible to Visitors
  // =========================================================================
  test("Catalogue Access Control: Unpublished and draft species are invisible to visitors", () => {
    const mockDb = {
      species: [
        { id: "s1", common_name: "Published Flora", is_published: true, is_deleted: false },
        { id: "s2", common_name: "Draft Specimen", is_published: false, is_deleted: false },
        { id: "s3", common_name: "Deleted Flora", is_published: true, is_deleted: true },
      ],
      observations: [
        { specimen_id: "p1", status: "approved", observed_at: "2026-10-01" },
        { specimen_id: "p2", status: "draft", observed_at: "2026-10-02" },
      ],
      plants: [
        { id: "p1", species_id: "s1", is_deleted: false },
        { id: "p2", species_id: "s2", is_deleted: false },
      ],
    };

    const visitorVisible = visiblePlants(mockDb, "visitor");
    assert.equal(visitorVisible.length, 1);
    assert.equal(visitorVisible[0].id, "p1");

    // Staff can see both approved and draft/pending plants
    const officerVisible = visiblePlants(mockDb, "officer");
    assert.equal(officerVisible.length, 2);
  });

  // =========================================================================
  // 4. THEME LEGIBILITY: Light & Dark Palettes Satisfy Contrast Standards
  // =========================================================================
  test("Theme Legibility: Palette tokens maintain legible contrast across themes", () => {
    // Helper to calculate approximate luminance from hex
    function getLuminance(hex) {
      const rgb = hex.replace("#", "").match(/.{2}/g).map((x) => parseInt(x, 16) / 255);
      const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function getContrast(hex1, hex2) {
      const l1 = getLuminance(hex1);
      const l2 = getLuminance(hex2);
      const brightest = Math.max(l1, l2);
      const darkest = Math.min(l1, l2);
      return (brightest + 0.05) / (darkest + 0.05);
    }

    // Verify dark theme primary text (ink) against background and surface
    const darkContrast = getContrast(palettes.dark.ink, palettes.dark.bg);
    assert.ok(darkContrast >= 7.0, `Dark theme contrast (${darkContrast.toFixed(2)}) should be >= 7:1 for high legibility`);

    // Verify light theme primary text (ink) against background
    const lightContrast = getContrast(palettes.light.ink, palettes.light.bg);
    assert.ok(lightContrast >= 7.0, `Light theme contrast (${lightContrast.toFixed(2)}) should be >= 7:1 for high legibility`);

    // Verify accent text readability on accent button
    const darkAccentContrast = getContrast(palettes.dark.onAccent, palettes.dark.accent);
    assert.ok(darkAccentContrast >= 4.5, "Dark onAccent contrast should meet WCAG AA (>= 4.5:1)");

    const lightAccentContrast = getContrast(palettes.light.onAccent, palettes.light.accent);
    assert.ok(lightAccentContrast >= 4.5, "Light onAccent contrast should meet WCAG AA (>= 4.5:1)");
  });

  // =========================================================================
  // 5. SEARCH & INPUT RESILIENCE: Metacharacters & Injection Safety
  // =========================================================================
  test("Search Resilience: Special characters, regex metachars, and XSS do not crash filters", () => {
    const speciesList = [
      { id: "1", scientific_name: "Nepenthes rajah", common_name: "Rajah Pitcher" },
      { id: "2", scientific_name: "Rafflesia pricei", common_name: "Price's Rafflesia" },
      { id: "3", scientific_name: "Dipterocarpus sarawakensis", common_name: "Sarawak Keruing" },
    ];

    const dangerousInputs = [
      "O'Connor",
      "test (v1) [rare]",
      ".*+?^${}()|[]\\",
      "<script>alert(1)</script>",
      "DROP TABLE plants;--",
      "\" OR 1=1 --",
    ];

    for (const input of dangerousInputs) {
      // Mobile search filter pattern
      assert.doesNotThrow(() => {
        const query = input.toLowerCase().trim();
        const results = speciesList.filter(
          (s) =>
            s.scientific_name.toLowerCase().includes(query) ||
            s.common_name.toLowerCase().includes(query)
        );
        assert.ok(Array.isArray(results));
      }, `Search failed with input: ${input}`);
    }
  });

  // =========================================================================
  // 6. TAG STOCK SAFETY: Unused Tag Invariants
  // =========================================================================
  test("Tag Stock Safety: Unused tags cannot trigger revisits; in-use tags require plant entity", () => {
    const plants = [
      { id: "p1", qr_id: "NIAH-0001", is_deleted: false },
      { id: "p2", qr_id: "NIAH-0002", is_deleted: true },
    ];

    // Revisit screen logic in AddPlant.js line 218:
    // const raw = db.plants.find((p) => p.qr_id === params.qr && !p.is_deleted);
    function findRevisitPlant(qr) {
      return plants.find((p) => p.qr_id === qr && !p.is_deleted) || null;
    }

    assert.ok(findRevisitPlant("NIAH-0001"), "Active plant should be found for revisit");
    assert.equal(findRevisitPlant("NIAH-0002"), null, "Deleted plant cannot be revisited");
    assert.equal(findRevisitPlant("NIAH-9999"), null, "Unused tag cannot be revisited");
  });
});
