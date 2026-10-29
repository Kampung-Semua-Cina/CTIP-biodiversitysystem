// apps/web/tests/auth-supabase-accounts.spec.js
// Automated Supabase Auth & Role-Based Verification Test Suite
// Verifies live Supabase authentication for all configured accounts:
//   1. admin123456@gmail.com  (Admin)
//   2. officer123@gmail.com    (Conservation Officer)
//   3. botanist123@gmail.com   (Field Botanist)
//   4. test123@gmail.com       (Inactive Officer / Null Name test)
// Password for all: Niah@1234
// Powered by Playwright + Local Ollama (Zero Gemini/Cloud Tokens Consumed)
import { test, expect } from "@playwright/test";
import { auditWithOllama } from "./helpers/ollama.js";

const DEFAULT_PASSWORD = "Niah@1234";

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

async function extractDomSummary(page) {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map((h) => `${h.tagName}: ${h.innerText.trim()}`);
    const buttons = Array.from(document.querySelectorAll("button:not([disabled])")).map((b) => `[Btn] ${b.innerText.trim() || b.getAttribute("aria-label") || ""}`);
    const badged = Array.from(document.querySelectorAll(".whoname, .chip, .api-badge")).map((c) => `[Badge/Info] ${c.innerText.trim()}`);
    return [...headings, ...badged.slice(0, 10), ...buttons.slice(0, 10)].filter(Boolean).join("\n");
  });
}

/**
 * Helper to perform login via the UI form
 */
async function loginAs(page, email, password = DEFAULT_PASSWORD) {
  await page.goto("#/login");
  await page.waitForLoadState("domcontentloaded");

  const emailInput = page.locator('input[autocomplete="username"], input[placeholder*="@"], label:has-text("Email") input').first();
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await emailInput.fill(email);

  const pwInput = page.locator('input[type="password"]').first();
  await expect(pwInput).toBeVisible();
  await pwInput.fill(password);

  const submitBtn = page.locator('button[type="submit"]:has-text("Sign in")');
  await submitBtn.click();
}

/**
 * Helper to assert the user role cleanly across both Desktop and Mobile viewports
 */
async function assertUserRole(page, expectedRoleRegex) {
  const whoBtn = page.locator(".account button.who");
  await expect(whoBtn).toBeVisible({ timeout: 15000 });

  // On desktop Chrome, .who .whoname is visible directly in the header
  const desktopName = page.locator(".account button.who .whoname");
  if (await desktopName.isVisible()) {
    await expect(desktopName).toContainText(expectedRoleRegex);
  } else {
    // On mobile (<800px), .whoname is hidden in the button and shown in the menu
    await whoBtn.click();
    const menuName = page.locator(".account .menu .whoname").first();
    await expect(menuName).toBeVisible({ timeout: 5000 });
    await expect(menuName).toContainText(expectedRoleRegex);
    await whoBtn.click(); // Close menu
  }
}

/**
 * Helper to log out via the user profile menu
 */
async function logout(page) {
  const whoBtn = page.locator(".account button.who");
  if (await whoBtn.isVisible()) {
    await whoBtn.click();
    const signoutBtn = page.locator('.account button.item.danger, button:has-text("Sign out")').first();
    await expect(signoutBtn).toBeVisible({ timeout: 5000 });
    await signoutBtn.click();
    await page.waitForTimeout(500);
  }
}

test.describe("Supabase Auth Live Accounts Suite", () => {
  test.beforeEach(async ({ page }) => {
    // Clear tokens and session before each test to guarantee isolated state
    await page.goto("#/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  // =========================================================================
  // 1. Administrator Account: admin123456@gmail.com
  // =========================================================================
  test("Supabase Auth: Administrator login (admin123456@gmail.com)", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    await loginAs(page, "admin123456@gmail.com");

    // Must navigate to dashboard
    await expect(page).toHaveURL(/.*#\/dashboard/, { timeout: 15000 });

    // Assert Administrator role
    await assertUserRole(page, /admin/i);

    // Admin privileges: can access User Administration
    await page.goto("#/users");
    await expect(page.locator("form.addform")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".tablewrap table")).toBeVisible();

    // Ollama AI UX Audit
    const domSummary = await extractDomSummary(page);
    const audit = await auditWithOllama({
      prompt: "Verify that admin123456@gmail.com is properly authenticated with administrator permissions and access to user management.",
      domSummary,
    });
    if (audit.available) {
      console.log("[Ollama Admin Auth Audit]", audit.result);
    }

    // Clean sign out
    await logout(page);
    watchdog.assertClean("Admin Auth");
  });

  // =========================================================================
  // 2. Conservation Officer Account: officer123@gmail.com
  // =========================================================================
  test("Supabase Auth: Conservation Officer login (officer123@gmail.com)", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    await loginAs(page, "officer123@gmail.com");

    await expect(page).toHaveURL(/.*#\/dashboard/, { timeout: 15000 });

    // Header displays Officer role
    await assertUserRole(page, /officer/i);

    // Officer permissions: Review Queue is accessible
    await page.goto("#/review");
    await expect(page.locator('.reviewgrid, .rdetail, p:has-text("review"), p:has-text("queue")').first()).toBeVisible({ timeout: 10000 });

    // Officer permissions: Reports page accessible
    await page.goto("#/reports");
    await expect(page.locator('h2:has-text("Reports"), button:has-text("Export CSV")').first()).toBeVisible({ timeout: 10000 });

    // Clean sign out
    await logout(page);
    watchdog.assertClean("Officer Auth");
  });

  // =========================================================================
  // 3. Field Botanist Account: botanist123@gmail.com
  // =========================================================================
  test("Supabase Auth: Field Botanist login (botanist123@gmail.com)", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    await loginAs(page, "botanist123@gmail.com");

    await expect(page).toHaveURL(/.*#\/dashboard/, { timeout: 15000 });

    // Header displays Botanist role
    await assertUserRole(page, /botanist/i);

    // Botanist can access Add Plant flow
    await page.goto("#/add");
    await expect(page.locator('h2:has-text("Add plant"), form button:has-text("Generate new QR")').first()).toBeVisible({ timeout: 10000 });

    // Clean sign out
    await logout(page);
    watchdog.assertClean("Botanist Auth");
  });

  // =========================================================================
  // 4. Inactive / Null-Name User: test123@gmail.com
  // =========================================================================
  test("Supabase Auth: Inactive / Null-Name User resilience (test123@gmail.com)", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    await loginAs(page, "test123@gmail.com");

    await expect(page).toHaveURL(/.*#\/dashboard/, { timeout: 15000 });

    // Avatar and header must render fallback cleanly without throwing TypeError on null full_name
    const whoBtn = page.locator(".account button.who");
    await expect(whoBtn).toBeVisible({ timeout: 10000 });

    const avatar = whoBtn.locator(".avatar");
    await expect(avatar).toBeVisible();
    const avatarText = await avatar.innerText();
    expect(avatarText.length).toBeGreaterThan(0);

    // Clean sign out
    await logout(page);
    watchdog.assertClean("Inactive/Null-Name User Auth");
  });

  // =========================================================================
  // 5. Auth Invariants: Password rejection & Session reload persistence
  // =========================================================================
  test("Supabase Auth: Invalid credentials rejection and session persistence across reload", async ({ page }) => {
    const watchdog = attachBugWatchdog(page);

    // A. Rejection of incorrect password
    await loginAs(page, "admin123456@gmail.com", "WrongPassword@999");
    await page.waitForTimeout(1000);

    // User must remain on login page and error notification should appear
    await expect(page).toHaveURL(/.*#\/login/);
    const toast = page.locator(".toast, .alert, [role='alert']");
    if (await toast.count()) {
      await expect(toast.first()).toBeVisible();
      const toastText = await toast.first().innerText();
      expect(toastText.toLowerCase()).toMatch(/invalid|fail|error|wrong/);
    }

    // B. Successful login followed by browser refresh
    await loginAs(page, "botanist123@gmail.com", DEFAULT_PASSWORD);
    await expect(page).toHaveURL(/.*#\/dashboard/, { timeout: 15000 });

    // Reload the page: session should remain active
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    await assertUserRole(page, /botanist/i);

    // Clean sign out
    await logout(page);
    watchdog.assertClean("Auth Invariants");
  });
});
