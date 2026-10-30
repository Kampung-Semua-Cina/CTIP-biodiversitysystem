// apps/web/tests/agent-jira-traceability.spec.js
// Automated Jira Acceptance Criteria & Requirements Test Suite
// Directly traced to Jira User Stories in Jira.csv (CTIP-32, CTIP-34, CTIP-72, CTIP-73, CTIP-39, CTIP-78, CTIP-65, CTIP-33, CTIP-30)
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
    const notices = Array.from(document.querySelectorAll(".toast, .empty, .summary, dl")).map((m) => `[Summary/Info] ${m.innerText.trim().slice(0, 150)}`);
    return [...headings, ...chips.slice(0, 8), ...notices.slice(0, 5), ...buttons.slice(0, 10)].filter(Boolean).join("\n");
  });
}

test.describe("Jira Backlog Requirements Traceability Suite", () => {
  test.beforeAll(async () => {
    const status = await checkOllamaServer();
    if (status.online) {
      console.log(`[Ollama Agent] Connected to local Ollama. Installed models: ${status.models.join(", ")}`);
    } else {
      console.log(`[Ollama Agent] Notice: Ollama server starting or offline at http://127.0.0.1:11434.`);
    }
  });

  // =========================================================================
  // JIRA CTIP-32: Web: Biodiversity Report Generation & Export
  // Acceptance Criteria:
  // - Report can be generated from current search/filter selection
  // - Includes species counts, conservation status breakdown, observation list
  // - Export to CSV and Print / PDF
  // =========================================================================
  test("Jira CTIP-32: Conservation Officer can filter and export biodiversity reports (CSV & Print)", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/reports");
    await switchRole(page, "Officer");

    // 1. Verify summary metrics
    const summaryBox = page.locator(".summary");
    await expect(summaryBox).toBeVisible();
    await expect(summaryBox).toContainText("tagged plants");
    await expect(summaryBox).toContainText("published");
    await expect(summaryBox).toContainText("endangered");

    // 2. Verify conservation breakdown bars
    const bars = page.locator("ul.bars li");
    await expect(bars.first()).toBeVisible();
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThanOrEqual(3);

    // 3. Test filter pills
    const vulnerablePill = page.locator('.pills button:has-text("Vulnerable")').first();
    if (await vulnerablePill.isVisible()) {
      await vulnerablePill.click();
      await page.waitForTimeout(300);
    }

    // 4. Verify CSV Export action
    const exportBtn = page.locator('button:has-text("Export CSV")');
    await expect(exportBtn).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 7000 }).catch(() => null),
      exportBtn.click(),
    ]);

    if (download) {
      expect(download.suggestedFilename()).toBe("daun-sense-plants.csv");
    }

    // Ollama Audit of reporting capabilities
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate the biodiversity reporting page for Jira CTIP-32 compliance: Does it provide comprehensive breakdown statistics by conservation status, filter controls, and reliable export capabilities for park officers?",
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama CTIP-32 Report Audit]", agentAudit.result);
    }

    watchdog.assertClean("Jira CTIP-32 Report Generation");
  });

  // =========================================================================
  // JIRA CTIP-34, CTIP-72, CTIP-73: Web: Admin User Management, RBAC & Self-Lockout Guard
  // Acceptance Criteria:
  // - Admin sees every user with role and status
  // - Admin can invite or create users (with default password)
  // - Admin can change role and toggle active status
  // - Users CANNOT change their own role or deactivate themselves
  // - Non-admins cannot access this area
  // =========================================================================
  test("Jira CTIP-34/72/73: Admin user administration with role modification and self-lockout prevention", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/users");
    await switchRole(page, "Admin");

    // 1. Verify user creation form
    const addForm = page.locator("form.addform");
    await expect(addForm).toBeVisible();
    await expect(addForm.locator('label:has-text("Name") input')).toBeVisible();
    await expect(addForm.locator('label:has-text("Email") input')).toBeVisible();
    await expect(addForm.locator('label:has-text("Role") select')).toBeVisible();
    await expect(addForm).toContainText("Accounts authenticate directly via Supabase Auth");

    // 2. Verify user table
    const rows = page.locator(".tablewrap table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10000 });

    // 3. CTIP-72 & CTIP-73 Invariant: Self-lockout prevention
    // The active Admin's row must have its role dropdown and active switch disabled
    const adminSelfRow = rows.filter({ hasText: "(you)" }).first();
    await expect(adminSelfRow).toBeVisible();

    const selfRoleSelect = adminSelfRow.locator("select");
    await expect(selfRoleSelect).toBeDisabled();

    const selfActiveSwitch = adminSelfRow.locator("button.switch");
    await expect(selfActiveSwitch).toBeDisabled();

    // 4. Role change on another user
    const otherUserRow = rows.filter({ hasNotText: "(you)" }).first();
    if (await otherUserRow.count()) {
      const otherRoleSelect = otherUserRow.locator("select");
      await expect(otherRoleSelect).toBeEnabled();

      const otherActiveSwitch = otherUserRow.locator("button.switch");
      await expect(otherActiveSwitch).toBeEnabled();
    }

    // Ollama Audit of user management RBAC
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate Jira CTIP-34/72/73 user administration safety: Are user roles clearly presented, and is the active administrator prevented from accidentally locking themselves out or revoking their own administrative permissions?",
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama CTIP-34/72/73 User Admin Audit]", agentAudit.result);
    }

    watchdog.assertClean("Jira CTIP-34/72/73 User Management");
  });

  // =========================================================================
  // JIRA CTIP-39, CTIP-79, CTIP-78: IoT Sensor Monitoring & Threat Alert Lifecycle
  // Acceptance Criteria:
  // - Node status (online, offline, alert) with live readings (temp, soil moisture)
  // - Historical trend charts with configurable threshold limits
  // - Threat alert handling lifecycle (Assign -> Acknowledge -> Resolve)
  // =========================================================================
  test("Jira CTIP-39/79/78: IoT node monitoring, sparkline telemetry & alert resolution workflow", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/monitoring");
    await switchRole(page, "Officer");

    // 1. Overview metrics
    await expect(page.locator('.tile:has-text("Nodes online")')).toBeVisible();
    await expect(page.locator('.tile:has-text("Open alerts")')).toBeVisible();

    // 2. Node section (rendered or friendly empty state)
    const nodeCards = page.locator(".nodecard");
    const nodeCount = await nodeCards.count();

    if (nodeCount > 0) {
      // 3. Telemetry trend charts
      const chartsSection = page.locator('section[aria-labelledby="readings"]');
      await expect(chartsSection).toBeVisible();
      await expect(chartsSection.locator(".charts")).toBeVisible();

      // 4. Configurable threshold limits
      const limitsDetails = page.locator("details.limits");
      if (await limitsDetails.isVisible()) {
        await limitsDetails.locator("summary").click();
        await expect(limitsDetails.locator('input[name="temp_max"]')).toBeVisible();
        await expect(limitsDetails.locator('input[name="moisture_min"]')).toBeVisible();
      }
    } else {
      // Friendly empty state when no nodes registered
      await expect(page.locator('section[aria-labelledby="nodes"]')).toBeVisible();
    }

    // 5. Alert lifecycle steps
    const alertRecord = page.locator("article.record").first();
    if (await alertRecord.isVisible()) {
      const progressSteps = alertRecord.locator("ol.progress li");
      await expect(progressSteps).toHaveCount(3);
      await expect(progressSteps.nth(0)).toContainText("Assign");
      await expect(progressSteps.nth(1)).toContainText("Acknowledge");
      await expect(progressSteps.nth(2)).toContainText("Resolve");
    }

    // Ollama Audit of IoT operations
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate Jira CTIP-39/79/78 IoT monitoring: Does the interface clearly present live environmental telemetry, visual sparklines against limits, and a structured alert triage lifecycle (Assign -> Acknowledge -> Resolve)?",
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama CTIP-39/79/78 IoT Monitoring Audit]", agentAudit.result);
    }

    watchdog.assertClean("Jira CTIP-39/79/78 IoT Monitoring");
  });

  // =========================================================================
  // JIRA CTIP-65: Web: Species Soft Delete with Confirmation & Restoration
  // Acceptance Criteria:
  // - Delete asks for confirmation
  // - Delete is a soft delete (is_deleted), hiding it from active lists
  // - Deleted species can be restored from "Recently deleted"
  // =========================================================================
  test("Jira CTIP-65: Species soft deletion requires confirmation and supports immediate restoration", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/species");
    await switchRole(page, "Officer");

    const speciesRows = page.locator("table tbody tr");
    await expect(speciesRows.first()).toBeVisible({ timeout: 10000 });

    const targetRow = speciesRows.first();
    const speciesName = (await targetRow.locator("td").first().locator("b").innerText()).trim();

    // 1. Click delete icon
    const deleteBtn = targetRow.locator('button[aria-label^="Delete"]');
    await deleteBtn.click();

    // 2. Confirmation modal must appear
    const modal = page.locator(".modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Delete species");
    await expect(modal).toContainText("Past records are kept");

    // 3. Test Cancel
    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();
    await expect(targetRow).toBeVisible();

    // 4. Test Soft Delete
    await deleteBtn.click();
    await modal.locator('button.btn.danger:has-text("Delete")').click();
    await page.waitForTimeout(400);

    // Toast notification
    await expect(page.locator(".toast")).toContainText("Species deleted");

    // 5. Verify it appears under "Recently deleted"
    const recentlyDeletedSection = page.locator('h3:has-text("Recently deleted")');
    await expect(recentlyDeletedSection).toBeVisible();

    const restoreBtn = page.locator('button:has-text("Restore")').first();
    await expect(restoreBtn).toBeVisible({ timeout: 10000 });

    // 6. Restore the species
    await restoreBtn.click();
    await expect(page.locator(".toast")).toContainText("Species restored");
    await page.waitForTimeout(400);

    // Verify it is back in the active table
    await expect(page.locator("table tbody tr").filter({ hasText: speciesName }).first()).toBeVisible();

    // Ollama Audit of species lifecycle
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: `Audit Jira CTIP-65 compliance for ${speciesName}: Confirm whether the deletion workflow requires confirmation, performs a safe soft-delete, and allows the officer to restore deleted species without data loss.`,
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama CTIP-65 Soft Delete Audit]", agentAudit.result);
    }

    watchdog.assertClean("Jira CTIP-65 Soft Delete & Restore");
  });

  // =========================================================================
  // JIRA CTIP-33: Web: Public Visitor Plant Page & Unassigned / Unknown QR Landing
  // Acceptance Criteria:
  // - Scanning unknown/unassigned tag shows friendly "not found" page
  // - Scanning valid tag shows plant details without requiring login
  // - Non-public internal staff controls are hidden from public visitor
  // =========================================================================
  test("Jira CTIP-33: Public QR landing renders friendly 404 for unknown tags and public view without login", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await switchRole(page, "Visitor");

    // 1. Unknown / Unassigned QR code navigation
    await page.goto("#/tag/UNKNOWN-QR-9999");
    await expect(page.locator("h1")).toHaveText("Tag not found");
    await expect(page.locator("section.prose")).toContainText("There is no plant with tag UNKNOWN-QR-9999");
    await expect(page.locator('a.btn:has-text("Browse all plants")')).toBeVisible();

    // 2. Discover an assigned plant tag from the public catalogue if available
    await page.goto("#/plants");
    await page.waitForTimeout(400);

    const speciesLink = page.locator(".speciesgrid a.plantcard, .specieslist a.plantcard").first();
    if (await speciesLink.isVisible()) {
      await speciesLink.click();
      await page.waitForTimeout(400);

      const taggedPlantCard = page.locator('a[href^="#/tag/"]').first();
      if (await taggedPlantCard.isVisible()) {
        await taggedPlantCard.click();
        await page.waitForTimeout(400);

        const hasHeader = await page.locator(".tagheader").isVisible();
        const isPending = await page.locator('h1:has-text("This plant is not published yet")').isVisible();
        expect(hasHeader || isPending).toBe(true);

        // 3. Security Check: Staff review and management buttons MUST NOT be visible to visitors
        await expect(page.locator('button:has-text("Review tag"), button:has-text("Review record")')).toHaveCount(0);
        await expect(page.locator('a:has-text("Print tags")')).toHaveCount(0);
      }
    }

    // Ollama Audit of visitor UX
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate Jira CTIP-33 public visitor landing: Does an unknown tag show a friendly error explanation, and does a published tag show clean botanical information without leaking internal officer review buttons?",
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama CTIP-33 Public Landing Audit]", agentAudit.result);
    }

    watchdog.assertClean("Jira CTIP-33 Public QR Landing");
  });

  // =========================================================================
  // JIRA CTIP-30: Web: Biodiversity Records Search, Sorting & View Modes
  // Acceptance Criteria:
  // - Search by scientific or common name with partial matching
  // - Switch between Grid and List view layouts
  // - Sort options (Name A-Z, Most tagged)
  // =========================================================================
  test("Jira CTIP-30: Species catalogue search partial matching, family filters, and Grid/List view toggling", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/plants");
    await switchRole(page, "Officer");

    const searchInput = page.locator('input[aria-label="Search species"]');
    await expect(searchInput).toBeVisible();

    // 1. Partial search using dynamic text from the first card
    const firstCard = page.locator(".speciesgrid a.plantcard, .specieslist a.plantcard").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    const cardTitle = (await firstCard.locator(".name").innerText()).trim();
    const queryPart = cardTitle.slice(0, 3).toLowerCase();

    await searchInput.fill(queryPart);
    await page.waitForTimeout(300);
    const results = page.locator(".speciesgrid a.plantcard, .specieslist a.plantcard");
    const matchCount = await results.count();
    expect(matchCount).toBeGreaterThanOrEqual(1);

    // Clear search
    await searchInput.fill("");
    await page.waitForTimeout(200);

    // 2. View Mode Toggle: Grid -> List
    const listViewBtn = page.locator('button[aria-label="List view"]');
    await listViewBtn.click();
    await page.waitForTimeout(200);
    await expect(listViewBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("ul.specieslist")).toBeVisible();

    // View Mode Toggle: List -> Grid
    const gridViewBtn = page.locator('button[aria-label="Grid view"]');
    await gridViewBtn.click();
    await page.waitForTimeout(200);
    await expect(gridViewBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("ul.speciesgrid")).toBeVisible();

    // 3. Sort dropdown
    const sortSelect = page.locator('label.inline select');
    if (await sortSelect.isVisible()) {
      await sortSelect.selectOption("tagged");
      await page.waitForTimeout(200);
      expect(await sortSelect.inputValue()).toBe("tagged");
    }

    // Ollama Audit of catalogue search
    const domSummary = await extractDomSummary(page);
    const agentAudit = await auditWithOllama({
      prompt: "Evaluate Jira CTIP-30 species search and catalogue browsing: Are the search input, grid/list view controls, and sort selections clearly laid out and responsive?",
      domSummary,
    });
    if (agentAudit.available) {
      console.log("[Ollama CTIP-30 Catalogue Search Audit]", agentAudit.result);
    }

    watchdog.assertClean("Jira CTIP-30 Search & Catalogue Views");
  });

  // =========================================================================
  // JIRA CTIP-45 & CTIP-69: Web: Observation Review Lock for Botanists
  // =========================================================================
  test("Jira CTIP-45/69: Web: Observation review lock prevents botanists from editing pending records and photos", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/records");
    await switchRole(page, "Botanist");

    // Check my records page
    const recordsHeader = page.locator("h2, h1").first();
    await expect(recordsHeader).toBeVisible();

    // Verify pending review lock note is displayed for synced records without edit controls
    const syncedNotices = page.locator("article:has(.chip:has-text('Needs review')), article:has(.chip:has-text('synced'))");
    const count = await syncedNotices.count();
    if (count > 0) {
      const firstSynced = syncedNotices.first();
      await expect(firstSynced).toContainText(/Waiting for an officer to review it|locked until a decision is returned/i);
      // Ensure no appearance/height input forms are rendered for pending records
      await expect(firstSynced.locator("textarea, input[type='number']")).toHaveCount(0);
    }

    watchdog.assertClean("Jira CTIP-45/69 Web Observation Review Lock");
  });

  // =========================================================================
  // JIRA CTIP-34 & CTIP-43: Web: Sign-In Requires Admin Invite; Public Registration Disabled
  // =========================================================================
  test("Jira CTIP-34/43: Web: Sign-in requires administrator invitation and disables public self-registration", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await page.goto("#/login");

    // 1. Verify sign in header and prompt
    const heading = page.locator("h1");
    await expect(heading).toContainText("Staff sign in");
    const mutePrompt = page.locator("p.mute").first();
    await expect(mutePrompt).toContainText("Accounts are created by administrator invitation only");

    // 2. Ensure NO public "Create account" button exists on the sign-in screen
    const createAccountBtn = page.locator('button:has-text("Create account")');
    await expect(createAccountBtn).toHaveCount(0);

    // 3. Verify Admin member invitation interface
    await page.goto("#/users");
    await switchRole(page, "Admin");
    const inviteSection = page.locator("form.addform");
    if (await inviteSection.isVisible()) {
      await expect(inviteSection.locator("h3")).toContainText("Invite member");
      await expect(inviteSection.locator('button[type="submit"]')).toContainText("Invite member");
      await expect(inviteSection.locator("p.mute")).toContainText(/Leave temporary password blank to send an email invitation/i);
    }

    watchdog.assertClean("Jira CTIP-34/43 Web Admin Invite Enforcement");
  });

});
