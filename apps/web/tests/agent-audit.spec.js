// apps/web/tests/agent-audit.spec.js
// Automated Agent Testing Suite for Daun Sense
// Powered by Playwright + Local Ollama (Zero Gemini/Cloud Tokens Consumed)
import { test, expect } from "@playwright/test";
import { auditWithOllama, checkOllamaServer } from "./helpers/ollama.js";

// Watchdog helper to catch runtime errors, crashes, and unhandled rejections
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

// Switch the prototype role in the top RoleSwitch bar
async function switchRole(page, roleName) {
  const btn = page.locator(`.roleswitch button:has-text("${roleName}")`);
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

// Extract accessible interactive tree summary for LLM context
async function extractDomSummary(page) {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map((h) => `${h.tagName}: ${h.innerText.trim()}`);
    const buttons = Array.from(document.querySelectorAll("button:not([disabled])")).map((b) => `[Btn] ${b.innerText.trim() || b.getAttribute("aria-label") || ""}`);
    const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((i) => {
      const label = i.getAttribute("aria-label") || i.placeholder || i.name || "";
      const val = i.value ? `(value: ${i.value})` : "(empty)";
      return `[Field ${i.tagName}] ${label} ${val}`;
    });
    return [...headings, ...buttons.slice(0, 15), ...inputs.slice(0, 10)].filter(Boolean).join("\n");
  });
}

test.describe("Daun Sense Agent-Based QA & UX Testing", () => {
  test.beforeAll(async () => {
    const status = await checkOllamaServer();
    if (status.online) {
      console.log(`[Ollama Agent] Connected to local Ollama. Installed models: ${status.models.join(", ")}`);
    } else {
      console.log(`[Ollama Agent] Notice: Ollama server is offline or starting up at http://127.0.0.1:11434. Local heuristic assertions will still run.`);
    }
  });

  // =========================================================================
  // 1. UI TEST: Map Stacking & Navbar / Footer Collision
  // =========================================================================
  test("UI Layering: Leaflet map must not overlay sticky navbars or footer on scroll", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/map");
    await page.waitForSelector(".leaflet-map-wrapper", { state: "visible", timeout: 15000 });

    // Scroll down so the map passes under the sticky header
    await page.mouse.wheel(0, 280);
    await page.waitForTimeout(400);

    // Bounding-box elementFromPoint geometric probe
    const collisionCheck = await page.evaluate(() => {
      const topBar = document.querySelector(".top");
      if (!topBar) return { passed: true };

      const rect = topBar.getBoundingClientRect();
      const points = [
        { x: rect.left + rect.width / 2, y: rect.top + rect.height - 4 },
        { x: rect.left + rect.width * 0.75, y: rect.top + rect.height - 4 },
      ];

      for (const pt of points) {
        const el = document.elementFromPoint(pt.x, pt.y);
        if (el && (el.closest(".leaflet-map-wrapper") || el.closest(".map-tools") || el.closest(".leaflet-container"))) {
          return { passed: false, collidedElement: el.className || el.tagName };
        }
      }
      return { passed: true };
    });

    expect(collisionCheck.passed, `Map element '${collisionCheck.collidedElement}' collided with top navbar!`).toBe(true);

    // Query Local Ollama Agent on the state
    const domSummary = await extractDomSummary(page);
    const screenshot = await page.screenshot({ fullPage: false });

    const agentAudit = await auditWithOllama({
      prompt: "Inspect this Plant Map page. Are navigation bars and controls clearly visible without being obscured by the map canvas?",
      domSummary,
      screenshotBuffer: screenshot,
    });

    if (agentAudit.available) {
      console.log("[Ollama Map Layering Audit]", agentAudit.result);
    }
    watchdog.assertClean("Map Page");
  });

  // =========================================================================
  // 2. UX INCONVENIENCE TEST: QR Code Auto-Assignment
  // =========================================================================
  test("UX Workflow: Generate new QR must auto-assign and display the tag immediately", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/add");
    await switchRole(page, "Botanist");

    const selectEl = page.locator('select[aria-label="Pick an unused tag"]');
    await expect(selectEl).toBeVisible();

    const initialVal = await selectEl.inputValue();

    // Click "Generate new QR"
    const genBtn = page.locator('button:has-text("Generate new QR")');
    await genBtn.click();

    // Verify tag auto-assigns within 3 seconds
    await expect(selectEl).not.toHaveValue(initialVal, { timeout: 3500 });
    const generatedTag = await selectEl.inputValue();
    expect(generatedTag).toMatch(/^NIAH-\d+$/);

    // Verify the preview box displays the new tag code
    await expect(page.locator(".qrbox .tagid")).toHaveText(generatedTag);

    // Query Local Ollama Agent on the workflow feedback
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: `The user clicked 'Generate new QR'. Tag generated is ${generatedTag}. Evaluate whether the form successfully auto-assigned the tag and whether the user receives clear visual feedback.`,
      domSummary,
    });

    if (agentAudit.available) {
      console.log("[Ollama QR Auto-Assign Audit]", agentAudit.result);
    }
    watchdog.assertClean("Add Plant Workflow");
  });

  // =========================================================================
  // 3. OFFICER REVIEW ON TAG PAGE
  // =========================================================================
  test("Officer Role: Must be able to review, approve, return, or reject from the tag page itself", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/dashboard");
    await switchRole(page, "Officer");

    // Open first plant tag (switch to all plants tab if review queue is empty)
    const allPlantsBtn = page.locator('nav[aria-label="Saved views"] button:has-text("All tagged plants")');
    if (await allPlantsBtn.isVisible()) {
      await allPlantsBtn.click();
    }
    const firstPlantLink = page.locator('a[href*="#/tag/"]:not([href="#/tag/null"])').first();
    await expect(firstPlantLink).toBeVisible({ timeout: 10000 });
    await firstPlantLink.click();
    await page.waitForSelector(".tagheader");

    // Verify review controls exist on this tag page
    const reviewBtn = page.locator('button:has-text("Review tag"), button:has-text("Review record")');
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    // Assert the three review decisions are present
    const approveBtn = page.locator('button:has-text("Approve & publish")');
    const returnBtn = page.locator('button:has-text("Return for changes")');
    const rejectBtn = page.locator('button:has-text("Reject")');

    await expect(approveBtn).toBeVisible();
    await expect(returnBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();

    // Verify species confirmation selector is available
    const speciesSelect = page.locator('select:has-text("Not confirmed")');
    await expect(speciesSelect).toBeVisible();

    // Query Local Ollama Agent to critique review decision affordance
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate the officer review options available directly on this plant tag page. Are Approve, Return, and Reject decisions readily accessible?",
      domSummary,
    });

    if (agentAudit.available) {
      console.log("[Ollama Officer Review Audit]", agentAudit.result);
    }
    watchdog.assertClean("Tag Review Page");
  });

  // =========================================================================
  // 4. SPECIES EDIT: Observation Photos Picker
  // =========================================================================
  test("Species Media: Editor allows selecting from observation photos", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/species");
    await switchRole(page, "Officer");
    await page.waitForSelector(".tablewrap table");

    // Open photo editor for first species
    const cameraBtn = page.locator('button[title*="photos"]').first();
    await expect(cameraBtn).toBeVisible();
    await cameraBtn.click();

    // Verify PhotoEditor modal is open
    const modal = page.locator(".modal .editor");
    await expect(modal).toBeVisible();

    // Check if "From observations" button exists (when observation photos exist for species)
    const obsBtn = modal.locator('button:has-text("From observations")');
    if (await obsBtn.isVisible()) {
      await obsBtn.click();
      // Verify observation picker grid appears
      await expect(modal.locator(".obs-picker")).toBeVisible();
    }

    // Close editor
    await modal.locator('button[aria-label="Close"]').click();
    await expect(modal).not.toBeVisible();

    watchdog.assertClean("Species Photo Editor");
  });

  // =========================================================================
  // 5. AUTONOMOUS DEAD-END & CRASH CRAWLER
  // =========================================================================
  test("Autonomous Scanner: Crawl core routes to guarantee zero crashes or navigation dead-ends", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    const testRoutes = ["#/", "#/plants", "#/map", "#/about", "#/contact"];

    for (const route of testRoutes) {
      await page.goto(route);
      await page.waitForTimeout(400);

      // Verify at least 3 interactive navigation links exist (no trap pages)
      const linkCount = await page.locator("nav a, .foot a").count();
      expect(linkCount, `Dead end detected at route ${route}`).toBeGreaterThan(3);
    }

    watchdog.assertClean("Autonomous Route Crawl");
  });
});
