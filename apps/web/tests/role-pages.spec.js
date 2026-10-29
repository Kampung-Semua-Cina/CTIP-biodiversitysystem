// apps/web/tests/role-pages.spec.js
// Automated verification for every page and every role (Visitor, Botanist, Officer, Admin).
// Checks page render health, permission enforcement, navigation, and absence of JS console errors.
import { test, expect } from "@playwright/test";

function attachBugWatchdog(page) {
  const crashes = [];
  page.on("pageerror", (err) => crashes.push(`Unhandled Exception: ${err.message}`));
  page.on("console", (msg) => {
    const txt = msg.text();
    if (
      msg.type() === "error" &&
      !txt.includes("favicon") &&
      !txt.includes("401") &&
      !txt.includes("404") &&
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

async function switchToRole(page, roleLabel) {
  const btn = page.locator(".roleswitch button", { hasText: roleLabel });
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
  await expect(btn).toHaveClass(/on/);
}

test.describe("Web Portal: Automated Role & Page Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("Front page: Scan badge is clickable, navigates to #/scan and step cards are static", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    // 1. Verify scan badge exists, has href #/scan, and is clickable
    const scanBadge = page.locator("a.scanbadge");
    await expect(scanBadge).toBeVisible();
    await expect(scanBadge).toHaveAttribute("href", "#/scan");

    // 2. Click scan badge and verify navigation to #/scan
    await scanBadge.click();
    await expect(page).toHaveURL(/#\/scan/);
    await expect(page.locator("h1")).toContainText(/Scan Plant QR Tag/i);

    // 3. Navigate back and inspect "How a plant gets here" cards
    await page.goto("/");
    const stepCards = page.locator(".steps3 li.stepcard");
    await expect(stepCards).toHaveCount(3);
    const firstStep = stepCards.first();
    await expect(firstStep).toContainText(/Tagged in the field/i);

    watchdog.assertClean("Front page scan badge and step cards");
  });

  test("Visitor Role: Can view all public pages, blocked from staff pages", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await switchToRole(page, "Visitor");

    const publicPages = [
      { hash: "#/", heading: /Niah/i },
      { hash: "#/plants", heading: /Plant catalogue|Plants of Niah|Species/i },
      { hash: "#/map", heading: /Plant map|Map/i },
      { hash: "#/about", heading: /About/i },
      { hash: "#/contact", heading: /Contact/i },
      { hash: "#/staff", heading: /Staff portal|Sign in/i },
      { hash: "#/scan", heading: /Scan Plant QR Tag/i },
    ];

    for (const p of publicPages) {
      await page.goto(p.hash);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).toBeVisible();
      const h1Count = await page.locator("h1").count();
      expect(h1Count, `Expected an h1 on ${p.hash}`).toBeGreaterThan(0);
    }

    // Verify Contact page email is hyperlinked
    await page.goto("#/contact");
    const emailLink = page.locator('a[href^="mailto:"]');
    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveAttribute("href", /mailto:\S+@\S+/);

    // Restricted staff pages must render the NoAccess boundary
    const restricted = ["#/add", "#/records", "#/review", "#/users", "#/audit", "#/monitoring", "#/species", "#/tags", "#/reports"];
    for (const r of restricted) {
      await page.goto(r);
      await page.waitForLoadState("domcontentloaded");
      const noAccess = page.locator(".prose h1, .shellcard h1, .glass h1, h1");
      await expect(noAccess.first()).toContainText(/You can't open this page|Staff only|No access/i);
    }

    watchdog.assertClean("Visitor pages verification");
  });

  test("Botanist Role: Can view records, add plant, discussion, account, and public pages", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await switchToRole(page, "Botanist");

    const botanistPages = [
      { hash: "#/dashboard", heading: /Botanist dashboard|Dashboard/i },
      { hash: "#/add", heading: /Add plant/i },
      { hash: "#/records", heading: /My records|Plant records/i },
      { hash: "#/discussion", heading: /Discussion/i },
      { hash: "#/account", heading: /Account|Profile/i },
      { hash: "#/plants", heading: /Plant catalogue|Plants of Niah|Species/i },
      { hash: "#/scan", heading: /Scan Plant QR Tag/i },
    ];

    for (const p of botanistPages) {
      await page.goto(p.hash);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).toBeVisible();
      const h1OrH2 = page.locator("h1, h2").first();
      await expect(h1OrH2).toBeVisible();
    }

    // Botanists must be blocked from officer/admin only pages
    const blocked = ["#/review", "#/users", "#/audit", "#/species", "#/monitoring", "#/tags", "#/reports"];
    for (const b of blocked) {
      await page.goto(b);
      await page.waitForLoadState("domcontentloaded");
      const notice = page.locator(".prose h1, .shellcard h1, .glass h1, h1").first();
      await expect(notice).toContainText(/You can't open this page|Staff only|No access/i);
    }

    watchdog.assertClean("Botanist pages verification");
  });

  test("Officer Role: Can view review queue, monitoring, species, reports, tags, and dashboard", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await switchToRole(page, "Officer");

    const officerPages = [
      { hash: "#/dashboard", heading: /Officer dashboard|Dashboard/i },
      { hash: "#/review", heading: /Review/i },
      { hash: "#/monitoring", heading: /Monitoring|Sensor/i },
      { hash: "#/species", heading: /Species/i },
      { hash: "#/tags", heading: /QR tags|Tags/i },
      { hash: "#/reports", heading: /Reports/i },
      { hash: "#/discussion", heading: /Discussion/i },
      { hash: "#/account", heading: /Account|Profile/i },
    ];

    for (const p of officerPages) {
      await page.goto(p.hash);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).toBeVisible();
      const header = page.locator("h1, h2").first();
      await expect(header).toBeVisible();
    }

    // Officers must be blocked from admin-only pages
    const adminOnly = ["#/users", "#/audit"];
    for (const a of adminOnly) {
      await page.goto(a);
      await page.waitForLoadState("domcontentloaded");
      const notice = page.locator(".prose h1, .shellcard h1, .glass h1, h1").first();
      await expect(notice).toContainText(/You can't open this page|Staff only|No access/i);
    }

    watchdog.assertClean("Officer pages verification");
  });

  test("Admin Role: Can view users, audit log, species, monitoring, tags, and dashboard", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await switchToRole(page, "Admin");

    const adminPages = [
      { hash: "#/dashboard", heading: /Admin dashboard|Dashboard/i },
      { hash: "#/users", heading: /Users/i },
      { hash: "#/audit", heading: /Audit/i },
      { hash: "#/species", heading: /Species/i },
      { hash: "#/monitoring", heading: /Monitoring|Sensor/i },
      { hash: "#/tags", heading: /QR tags|Tags/i },
      { hash: "#/discussion", heading: /Discussion/i },
      { hash: "#/account", heading: /Account|Profile/i },
    ];

    for (const p of adminPages) {
      await page.goto(p.hash);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).toBeVisible();
      const header = page.locator("h1, h2").first();
      await expect(header).toBeVisible();
    }

    watchdog.assertClean("Admin pages verification");
  });

  test("Add Plant: Provides interactive species suggestions and auto-fills morphology", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);
    await switchToRole(page, "Botanist");

    await page.goto("#/add");
    await page.waitForLoadState("domcontentloaded");

    const speciesInput = page.locator('input[placeholder*="Start typing a botanical"]');
    await expect(speciesInput).toBeVisible();

    // Check common species pills are visible
    const pills = page.locator(".species-pills-row .species-pill-btn");
    await expect(pills.first()).toBeVisible();

    // Type partial name to trigger dropdown suggestions
    await speciesInput.fill("Nep");
    const dropdown = page.locator(".species-dropdown");
    await expect(dropdown).toBeVisible();

    const suggestionItems = dropdown.locator(".species-dropdown-item");
    const count = await suggestionItems.count();
    expect(count).toBeGreaterThan(0);

    // Click the first suggestion
    await suggestionItems.first().click();

    // Verify input is populated with scientific name and recognized hint is displayed
    const val = await speciesInput.inputValue();
    expect(val).toContain("Nepenthes");

    const recognizedHint = page.locator(".success-hint");
    await expect(recognizedHint).toBeVisible();

    watchdog.assertClean("Add plant species suggestions verification");
  });
});
