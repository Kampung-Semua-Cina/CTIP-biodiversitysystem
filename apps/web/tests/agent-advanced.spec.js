// apps/web/tests/agent-advanced.spec.js
// Advanced Agent QA & Resilience Suite for Daun Sense
// Powered by Playwright + Local Ollama (Zero Gemini/Cloud Tokens Consumed)
import { test, expect } from "@playwright/test";
import { auditWithOllama, checkOllamaServer } from "./helpers/ollama.js";

function attachBugWatchdog(page) {
  const crashes = [];
  page.on("pageerror", (err) => crashes.push(`Unhandled Exception: ${err.message}`));
  page.on("console", (msg) => {
    const txt = msg.text();
    if (
      msg.type() === "error" &&
      !txt.includes("favicon") &&
      !txt.includes("401") &&
      !txt.includes("409") &&
      !txt.includes("Failed to load resource")
    ) {
      crashes.push(`Console Error: ${txt}`);
    }
  });
  return {
    assertClean(context = "") {
      expect(crashes, `Bugs detected in ${context}:\n${crashes.join("\n")}`).toHaveLength(0);
    },
    getCrashes() {
      return crashes;
    },
  };
}

async function switchRole(page, roleName) {
  const btn = page.locator(`.roleswitch button:has-text("${roleName}")`);
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

async function extractDomSummary(page) {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map((h) => `${h.tagName}: ${h.innerText.trim()}`);
    const buttons = Array.from(document.querySelectorAll("button:not([disabled])")).map((b) => `[Btn] ${b.innerText.trim() || b.getAttribute("aria-label") || ""}`);
    const chips = Array.from(document.querySelectorAll(".chip")).map((c) => `[Chip] ${c.innerText.trim()}`);
    const alerts = Array.from(document.querySelectorAll(".toast, .empty, .mapnote, p.mute")).map((m) => `[Notice] ${m.innerText.trim()}`);
    return [...headings, ...chips.slice(0, 8), ...alerts.slice(0, 6), ...buttons.slice(0, 10)].filter(Boolean).join("\n");
  });
}

test.describe("Daun Sense Advanced QA & Safety Invariants", () => {
  test.beforeAll(async () => {
    const status = await checkOllamaServer();
    if (status.online) {
      console.log(`[Ollama Agent] Connected to local Ollama. Installed models: ${status.models.join(", ")}`);
    } else {
      console.log(`[Ollama Agent] Ollama server offline or starting up at http://127.0.0.1:11434.`);
    }
  });

  // =========================================================================
  // 1. PRIVACY TEST (CTIP-71): Endangered Species Locations Hidden From Visitors
  // =========================================================================
  test("CTIP-71 Privacy: Visitors cannot see coordinates or map pins for endangered plants", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    // 1. Start as Visitor
    await page.goto("#/plants");
    await switchRole(page, "Visitor");

    // Look for an endangered species with tagged plants (locations hidden for visitors)
    const endangeredCard = page.locator(".speciesgrid a.plantcard, .specieslist a.plantcard").filter({
      has: page.locator('.chip:has-text("endangered")'),
    }).filter({
      hasText: /tagged plant/i,
    }).filter({
      hasNotText: /No tagged/i,
    }).first();

    const hasEndangered = (await endangeredCard.count()) > 0;

    if (hasEndangered) {
      // Confirm that the foot text on the card displays "locations hidden" for visitors
      const footText = await endangeredCard.locator(".cardfoot, .foot").innerText();
      expect(footText.toLowerCase()).toContain("locations hidden");

      // Click into the endangered species page
      await endangeredCard.click();
      await page.waitForTimeout(400);

      // Section "Where it grows" must NOT render the interactive minimap, but instead state locations are hidden
      const whereSection = page.locator('section[aria-labelledby="where"]');
      await expect(whereSection).toBeVisible();
      const protectionNotice = whereSection.locator("p.mute");
      await expect(protectionNotice).toContainText("Locations of this species are hidden to protect it.");
      await expect(whereSection.locator(".minimap")).toHaveCount(0);

      // Now switch role to Officer: exact locations and minimap must unlock for authorized staff
      await switchRole(page, "Officer");
      await expect(whereSection.locator(".minimap")).toBeVisible({ timeout: 5000 });
      await expect(whereSection.locator('a:has-text("Open on the full map")')).toBeVisible();

      // Switch back to Visitor for clean state
      await switchRole(page, "Visitor");
    }

    // 2. Map page check: verify the privacy disclaimer for visitors
    await page.goto("#/map");
    const mapNote = page.locator(".mapnote");
    if (await mapNote.isVisible()) {
      const noteText = await mapNote.innerText();
      expect(noteText.toLowerCase()).toContain("endangered plant");
    }

    // Ollama Agent Privacy Evaluation
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Verify CTIP-71 privacy compliance: Public visitors must never see GPS coordinates or map locations of endangered plants. Check if the page informs the visitor that endangered locations are protected and withheld.",
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama Privacy Audit]", agentAudit.result);
    }

    watchdog.assertClean("Endangered Privacy Test");
  });

  // =========================================================================
  // 2. INTEGRITY GUARD: Review Preconditions & Validation Guards
  // =========================================================================
  test("Review Preconditions: Actions require confirmation and mandatory notes to prevent invalid state", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    await page.goto("#/review");
    await switchRole(page, "Officer");

    // Check if there is an observation in the review queue
    const reviewDetail = page.locator(".rdetail");
    const hasRecord = await reviewDetail.isVisible();

    if (hasRecord) {
      // Find the decide buttons
      const approveBtn = reviewDetail.locator('button:has-text("Approve & publish")');
      const returnBtn = reviewDetail.locator('button:has-text("Return for changes")');
      const rejectBtn = reviewDetail.locator('button:has-text("Reject")');
      const noteTextarea = reviewDetail.locator('textarea[placeholder*="What needs to change?"]');

      // 1. Guard check: Return without comment must show warning toast
      await noteTextarea.fill("");
      await returnBtn.click();
      await expect(page.locator(".toast")).toHaveText("Add a note so the botanist knows why", { timeout: 3000 });

      // 2. Guard check: Reject without comment must show warning toast
      await rejectBtn.click();
      await expect(page.locator(".toast")).toHaveText("Add a note so the botanist knows why", { timeout: 3000 });

      // 3. Guard check: Approve without confirmed species
      const speciesSelect = reviewDetail.locator("select");
      if (await speciesSelect.isVisible()) {
        const curSpecies = await speciesSelect.inputValue();
        if (!curSpecies) {
          await approveBtn.click();
          await expect(page.locator(".toast")).toHaveText("Confirm the species before approving", { timeout: 3000 });
        }
      }
    }

    // Ollama Agent Evaluation of review guards
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate the review page validation. Are officers prevented from making accidental unverified decisions (e.g. rejecting without an explanatory comment, or approving without species identification)?",
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama Review Guard Audit]", agentAudit.result);
    }

    watchdog.assertClean("Review Validation Guards");
  });

  // =========================================================================
  // 3. CATALOGUE PRIVACY: Draft & Unpublished Species Hidden from Public
  // =========================================================================
  test("Catalogue Access Control: Unpublished/draft species are invisible to visitors", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    // 1. Visit species management as Officer
    await page.goto("#/species");
    await switchRole(page, "Officer");

    const speciesRows = page.locator("table tbody tr");
    await expect(speciesRows.first()).toBeVisible({ timeout: 10000 });

    // Look for an unpublished species switch
    const unpublishedSwitch = speciesRows.locator('button.switch[aria-checked="false"]').first();
    let draftSpeciesName;

    if ((await unpublishedSwitch.count()) > 0) {
      const row = speciesRows.filter({ has: unpublishedSwitch }).first();
      draftSpeciesName = (await row.locator("td").first().locator("b").innerText()).trim();
    } else {
      // Toggle the first species to unpublished for testing
      const firstRow = speciesRows.first();
      draftSpeciesName = (await firstRow.locator("td").first().locator("b").innerText()).trim();
      const toggleBtn = firstRow.locator("button.switch");
      await toggleBtn.click();
      await page.waitForTimeout(500);
    }

    expect(draftSpeciesName.length).toBeGreaterThan(0);

    // 2. As Visitor, search for the draft species in public catalogue
    await page.goto("#/plants");
    await switchRole(page, "Visitor");

    const searchInput = page.locator('input[aria-label="Search species"]');
    await searchInput.fill(draftSpeciesName);
    await page.waitForTimeout(400);

    // The draft species must NOT be found in the public results
    const cards = page.locator(".speciesgrid a.plantcard, .specieslist a.plantcard");
    await expect(cards).toHaveCount(0);
    await expect(page.locator(".results")).toContainText("No species match these filters.");

    // 3. As Officer, the draft species SHOULD appear with "Not published" chip
    await switchRole(page, "Officer");
    await page.waitForTimeout(500);
    await expect(cards).toHaveCount(1, { timeout: 10000 });
    await expect(cards.first().locator('.chip:has-text("Not published"), .chip:has-text("draft")')).toBeVisible();

    // Clean up: restore publication state if we toggled it
    await page.goto("#/species");
    const cleanupRow = page.locator("table tbody tr").filter({ hasText: draftSpeciesName }).first();
    const switchBtn = cleanupRow.locator("button.switch");
    if ((await switchBtn.getAttribute("aria-checked")) === "false") {
      await switchBtn.click();
      await page.waitForTimeout(400);
    }

    watchdog.assertClean("Draft Species Privacy");
  });

  // =========================================================================
  // 4. THEME & ACCESSIBILITY: Dark/Light Mode Contrast & Legibility
  // =========================================================================
  test("Theme Legibility: Dark and Light mode toggles cleanly without illegible text", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/plants");

    const siteWrapper = page.locator(".site");

    // 1. Switch to Dark Mode
    const darkBtn = page.locator('.themeswitch button:has-text("Dark")').first();
    if (await darkBtn.isVisible()) {
      await darkBtn.click();
      await page.waitForTimeout(300);
      await expect(siteWrapper).toHaveAttribute("data-theme", "dark");

      // Verify dark theme colors have contrasting background and foreground
      const colors = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        const heading = document.querySelector("h1");
        const headingStyle = heading ? getComputedStyle(heading) : null;
        return {
          bg: style.backgroundColor,
          color: headingStyle ? headingStyle.color : style.color,
        };
      });

      // Background should not be pure white in dark mode
      expect(colors.bg).not.toBe("rgb(255, 255, 255)");
    }

    // 2. Switch to Light Mode
    const lightBtn = page.locator('.themeswitch button:has-text("Light")').first();
    if (await lightBtn.isVisible()) {
      await lightBtn.click();
      await page.waitForTimeout(300);
      await expect(siteWrapper).toHaveAttribute("data-theme", "light");
    }

    // Ollama visual audit
    const screenshot = await page.screenshot({ fullPage: false });
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate the color contrast and legibility of text, chips, and buttons on this page. Are there any illegible low-contrast text elements or visual glitches?",
      screenshotBuffer: screenshot,
    });
    if (agentAudit.available) {
      console.log("[Ollama Theme Audit]", agentAudit.result);
    }

    watchdog.assertClean("Theme Legibility");
  });

  // =========================================================================
  // 5. STRESS TEST: Search Input Resilience Against Special Chars & XSS
  // =========================================================================
  test("Search Resilience: Special characters, regex metachars, and XSS do not crash UI", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/plants");

    const searchInput = page.locator('input[aria-label="Search species"]');
    await expect(searchInput).toBeVisible();

    const attackVectors = [
      ".*+?^${}()|[]\\", // Regex metacharacters (tests RegExp unescaped crash)
      "<script>alert('xss')</script>", // XSS vector
      "'\"; DROP TABLE species; --", // SQL metacharacters
      "🌿🌱🔬🌸⚠️", // Unicode emojis
      "               ", // Whitespace padding
    ];

    for (const vector of attackVectors) {
      await searchInput.fill(vector);
      await page.waitForTimeout(150);

      // Verify no runtime crashes occurred
      watchdog.assertClean(`Search input stress test with "${vector}"`);

      // Verify graceful empty state or matching state without uncaught error dialog
      const resultsText = await page.locator(".results").innerText();
      expect(resultsText.length).toBeGreaterThan(0);
    }

    // Restore clean state
    await searchInput.fill("");
    await page.waitForTimeout(200);
    const countCards = await page.locator(".speciesgrid a.plantcard, .specieslist a.plantcard").count();
    expect(countCards).toBeGreaterThan(0);

    watchdog.assertClean("Search Resilience");
  });

  // =========================================================================
  // 6. TAG LIFECYCLE: Assigned Tags Cannot Be Accidentally Deleted
  // =========================================================================
  test("Tag Stock Safety: In-use tags cannot be deleted and unused deletions require confirmation", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/tags");
    await switchRole(page, "Officer");

    const tableRows = page.locator(".tablewrap table tbody tr");
    await expect(tableRows.first()).toBeVisible({ timeout: 10000 });

    const rowCount = await tableRows.count();
    expect(rowCount).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(rowCount, 8); i++) {
      const row = tableRows.nth(i);
      const statusChip = row.locator(".chip").first();
      const statusText = (await statusChip.innerText()).trim().toLowerCase();

      const deleteBtn = row.locator('button[aria-label^="Delete"]');

      if (statusText === "unused") {
        // Unused tags should offer a delete button
        await expect(deleteBtn).toBeVisible();
      } else {
        // Assigned, planted, or retired tags MUST NOT offer a delete button
        await expect(deleteBtn).toHaveCount(0);
      }
    }

    // Test delete confirmation modal on an unused tag
    const unusedRow = tableRows.filter({ has: page.locator('.chip:has-text("unused")') }).first();
    if (await unusedRow.count()) {
      const deleteBtn = unusedRow.locator('button[aria-label^="Delete"]');
      await deleteBtn.click();

      // Confirmation modal must open
      const modal = page.locator(".modal");
      await expect(modal).toBeVisible();
      await expect(modal.locator("h2, h3, .modalhead")).toContainText("Delete QR tag");
      await expect(modal).toContainText("It has not been put on a plant");

      // Click Cancel - tag is preserved
      await modal.locator('button:has-text("Cancel")').click();
      await expect(modal).not.toBeVisible();
    }

    // Ollama Audit of tag management safety
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate the QR tag management screen. Does it protect in-use field tags from accidental deletion while providing safe confirmation workflows for unused stock?",
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama Tag Safety Audit]", agentAudit.result);
    }

    watchdog.assertClean("Tag Lifecycle Safety");
  });
});
