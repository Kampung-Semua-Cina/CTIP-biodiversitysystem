// apps/web/tests/availability-security.spec.js
// Availability, reliability and security from the browser's side, plus the report bars
// and the plant book. The API is mocked, so this never touches the live database.
import { test, expect } from "@playwright/test";
import { newState, observation, open, openAsVisitor, photo, species, specimen } from "./helpers/mockApi.js";

const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("when the API is down or slow", () => {
  for (const hash of ["#/", "#/plants", "#/book", "#/map", "#/about"]) {
    test(`${hash} still opens with the API down`, async ({ page }) => {
      const crashes = [];
      page.on("pageerror", (e) => crashes.push(e.message));
      await page.route("**/v1/**", (r) => r.abort());
      await page.route(/(tile\.openstreetmap|arcgisonline|opentopomap)/, (r) => r.abort());
      await page.goto("/" + hash);
      await expect(page.locator("main, #root").first()).toBeVisible();
      await expect(page.locator("#root")).not.toBeEmpty();
      await page.waitForTimeout(500);
      expect(crashes).toEqual([]);
    });
  }

  test("a staff page says the API cannot be reached", async ({ page }) => {
    await open(page, newState(), "#/review");
    await expect(page.getByRole("heading", { name: /review/i }).first()).toBeVisible();
    await page.unroute("**/v1/**");
    await page.route("**/v1/**", (r) => r.abort());
    await page.reload();
    await expect(page.getByText(/reach|offline|not connected/i).first()).toBeVisible({ timeout: 25000 });
  });

  test("a slow API keeps the page usable while it loads", async ({ page }) => {
    await open(page, newState({ workspaceDelay: 3000 }), "#/plants");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 2500 });
    await expect(page.getByText("Giant pitcher").first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("security", () => {
  const reduced = {
    species: [species({ conservation_status: "endangered" })], species_media: [],
    specimens: [specimen(1, { species_id: species().id, lat: 3.81, lng: 113.78, location_reduced: true })],
    observations: [observation(1, { status: "approved", lat: undefined, lng: undefined })], observation_photos: [], zones: [],
  };

  for (const hash of ["#/users", "#/reports", "#/review", "#/audit"]) {
    test(`a visitor cannot open ${hash}`, async ({ page }) => {
      await openAsVisitor(page, newState({ publicWorkspace: reduced }), hash);
      await page.waitForTimeout(300);
      await expect(page.getByRole("heading", { name: /^(Users|Reports|Audit log|Review queue)$/ })).toHaveCount(0);
      await expect(page.getByText("officer@example.com")).toHaveCount(0);
    });
  }

  test("the plant book saved on a visitor's device holds no locations", async ({ page }) => {
    await openAsVisitor(page, newState({ publicWorkspace: reduced }), "#/book");
    await expect(page.getByRole("heading", { name: "Giant pitcher" })).toBeVisible();
    const saved = await page.evaluate(() => window.localStorage.getItem("daun_plant_book"));
    expect(saved).toContain("Giant pitcher");
    expect(saved).not.toMatch(/"lat"|"lng"/);
  });

  test("the sign-in token never appears in the address", async ({ page }) => {
    const urls = [];
    page.on("framenavigated", (f) => urls.push(f.url()));
    await open(page, newState(), "#/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    expect(urls.join(" ")).not.toMatch(/token|h\.ey/i);
  });
});

test.describe("layout", () => {
  for (const hash of ["#/", "#/plants", "#/book", "#/map", "#/about", "#/signin"]) {
    test(`${hash} does not scroll sideways for a visitor`, async ({ page }) => {
      await openAsVisitor(page, newState(), hash);
      await page.waitForTimeout(300);
      expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
    });
  }
  for (const hash of ["#/reports", "#/review", "#/users", "#/tags", "#/species", "#/monitor", "#/account"]) {
    test(`${hash} does not scroll sideways for staff`, async ({ page }) => {
      await open(page, newState(), hash);
      await page.waitForTimeout(300);
      expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("report bars", () => {
  const families = ["Nepenthaceae", "Rafflesiaceae"].map((family, i) => species({ id: `dddddddd-0000-4000-8000-00000000000${i}`, family, scientific_name: `Plantus ${family}`, common_name: `Name ${i}` }));
  const state = () => newState({
    species: families,
    specimens: [specimen(1, { species_id: families[0].id }), specimen(2, { species_id: families[0].id }), specimen(3, { species_id: families[1].id })],
    observations: [1, 2, 3].map((n) => observation(n, { status: "approved" })),
    photos: [photo(1)],
  });

  test("selecting a family lists only those plants", async ({ page }) => {
    await open(page, state(), "#/reports");
    await page.getByRole("button", { name: /^Rafflesiaceae: 1 plant/ }).click();
    await expect(page).toHaveURL(/family=Rafflesiaceae/);
    await expect(page.getByRole("link", { name: "NIAH-0003" }).or(page.getByText("NIAH-0003")).first()).toBeVisible();
    await expect(page.getByText("NIAH-0001")).toHaveCount(0);
  });

  test("selecting a species lists only those plants", async ({ page }) => {
    await open(page, state(), "#/reports");
    await page.getByRole("button", { name: /^Plantus Nepenthaceae: 2 plants/ }).click();
    await expect(page.getByText("NIAH-0001").first()).toBeVisible();
    await expect(page.getByText("NIAH-0003")).toHaveCount(0);
  });
});

test.describe("plant book", () => {
  test("search narrows it, and the saved copy opens when the API goes down", async ({ page }) => {
    const state = newState({ species: [species(), species({ id: "eeeeeeee-0000-4000-8000-000000000000", common_name: "Bornean ironwood", scientific_name: "Eusideroxylon zwageri", family: "Lauraceae" }), species({ id: "eeeeeeee-0000-4000-8000-000000000001", common_name: "Hidden draft", is_published: false })] });
    await openAsVisitor(page, state, "#/book");
    await expect(page.getByRole("heading", { name: "Bornean ironwood" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hidden draft" })).toHaveCount(0);

    await page.getByLabel("Search the plant book").fill("ironwood");
    await expect(page.getByRole("heading", { name: "Giant pitcher" })).toHaveCount(0);
    await page.getByLabel("Search the plant book").fill("");

    await page.unroute("**/v1/**");
    await page.route("**/v1/**", (r) => r.abort());
    await page.reload();
    await expect(page.getByText(/Not connected: showing the copy saved/)).toBeVisible({ timeout: 25000 });
    await expect(page.getByRole("heading", { name: "Bornean ironwood" })).toBeVisible();
  });
});
