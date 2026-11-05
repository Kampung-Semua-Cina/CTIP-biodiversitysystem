// apps/web/tests/every-page.spec.js
// Opens every page as every role (visitor, botanist, officer, admin) against the
// mocked API and fails on an uncaught error, a console error, or the error screen.
// Also checks that officers and admins can both act on alerts.
import { test, expect } from "@playwright/test";
import { newState, open, openAsVisitor, specimen, SPECIES } from "./helpers/mockApi.js";

const PUBLIC = ["#/", "#/about", "#/contact", "#/staff", "#/book", "#/plants", `#/plants/${SPECIES}`, "#/tag/NIAH-0001", "#/map", "#/scan", "#/login"];
const STAFF = {
  botanist: ["#/dashboard", "#/add", "#/records", "#/notifications", "#/discussion", "#/account"],
  officer: ["#/dashboard", "#/review", "#/reports", "#/species", "#/monitoring", "#/tags", "#/notifications", "#/discussion", "#/account"],
  admin: ["#/dashboard", "#/species", "#/monitoring", "#/users", "#/audit", "#/tags", "#/notifications", "#/discussion", "#/account"],
};

const NODE = "aaaaaaaa-0000-4000-8000-0000000000aa";
const withSensors = (role) => newState({
  role,
  sensorNodes: [{ id: NODE, name: "Node A", specimen_id: specimen(1).id, status: "active", thresholds: { temp_max: 35, moisture_min: 20 }, last_seen: "2026-11-02T00:00:00Z", created_at: "2026-11-01T00:00:00Z" }],
  alerts: [{ id: "bbbbbbbb-0000-4000-8000-0000000000aa", node_id: NODE, type: "Overheat", reading: { temperature: 41 }, severity: "high", status: "open", created_at: "2026-11-03T00:00:00Z" }],
});

function watch(page) {
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Blocked map tiles and the mock's empty answers show up as failed loads; not app errors.
    if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  return problems;
}

async function checkPage(page, problems, hash) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(700); // lazy pages and the first workspace load
  await expect(page.locator("main, #root").first()).toBeVisible();
  await expect(page.getByText("This page hit a problem"), `${hash} shows the error screen`).toHaveCount(0);
  await expect(page.getByText(/no access|not allowed/i), `${hash} says no access`).toHaveCount(0);
  expect(problems, `${hash}:\n${problems.join("\n")}`).toEqual([]);
}

test("visitor: every public page opens without errors", async ({ page }) => {
  const problems = watch(page);
  await openAsVisitor(page, newState(), "#/");
  for (const hash of PUBLIC) await checkPage(page, problems, hash);
});

for (const role of Object.keys(STAFF)) {
  test(`${role}: every page they can use opens without errors`, async ({ page }) => {
    const problems = watch(page);
    await open(page, withSensors(role), "#/dashboard");
    await expect(page.locator(".shell, main").first()).toBeVisible();
    for (const hash of [...PUBLIC.filter((h) => h !== "#/login"), ...STAFF[role]]) await checkPage(page, problems, hash);
  });
}

// Team rule: officers and admins both handle alerts (acknowledge, resolve, assign, notes).
for (const role of ["officer", "admin"]) {
  test(`${role}: can act on alerts`, async ({ page }) => {
    await open(page, withSensors(role), "#/monitoring");
    await expect(page.getByText("Overheat").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Acknowledge", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resolve", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add note", exact: true })).toBeVisible();
  });
}
