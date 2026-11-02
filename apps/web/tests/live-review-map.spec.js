// apps/web/tests/live-review-map.spec.js
// Staying signed in, live review queue, creating a species during review, hiding a
// location, and the map's plant window. The API is mocked in the browser, so this
// needs no sign-in and never touches the live database.
import { test, expect } from "@playwright/test";

const ME = "11111111-1111-4111-8111-111111111111";
const BOTANIST = "22222222-2222-4222-8222-222222222222";
const SPECIES = "33333333-3333-4333-8333-333333333333";
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const iso = (minutes) => new Date(Date.UTC(2026, 9, 30, 8, minutes)).toISOString();

const jwt = () => {
  const claims = { sub: ME, email: "officer@example.com", user_role: "officer", exp: Math.floor(Date.now() / 1000) + 3600 };
  return `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;
};

const specimen = (n, extra = {}) => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${n}`, qr_id: `NIAH-000${n}`, species_id: null, proposed_species_name: `Guessed plant ${n}`,
  registered_by: BOTANIST, lat: 3.8, lng: 113.77, gps_accuracy_m: 5, endangered_override: false, is_deleted: false, updated_at: iso(n), ...extra,
});
const observation = (n, extra = {}) => ({
  id: `bbbbbbbb-0000-4000-8000-00000000000${n}`, specimen_id: specimen(n).id, recorded_by: BOTANIST, status: "synced", version: 1,
  observed_at: iso(n), last_synced_at: iso(n), updated_at: iso(n), device_id: "phone", height_cm: 40 + n, morphology: "Broad leaves", notes: "Near the path", lat: 3.8, lng: 113.77, ...extra,
});
const photo = (n) => ({ id: `cccccccc-0000-4000-8000-00000000000${n}`, observation_id: observation(n).id, url: PIXEL, s3_key: `k${n}`, created_at: iso(n) });
const species = (extra = {}) => ({
  id: SPECIES, scientific_name: "Nepenthes rajah", common_name: "Giant pitcher", family: "Nepenthaceae", genus: "Nepenthes",
  conservation_status: "least concern", is_published: true, is_deleted: false, updated_at: iso(1), ...extra,
});

function mockApi(page, state) {
  const requests = [];
  return page.route("**/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/v1/, "");
    const method = req.method();
    const body = req.postDataJSON?.() ?? null;
    if (method !== "GET") state.writes.push({ method, path, body });
    requests.push(path);
    const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

    if (path === "/workspace") {
      if (state.workspaceDelay) await new Promise((r) => setTimeout(r, state.workspaceDelay));
      state.workspaceLoads++;
      return json({
        species: state.species, species_media: [], qr_tags: [], specimens: state.specimens, observations: state.observations,
        observation_photos: state.photos, observation_reviews: [], observation_comments: [], alerts: [], alert_notes: [], sensor_nodes: [],
        notifications: [], audit_logs: [],
        profiles: [
          { id: ME, full_name: "Olive Officer", email: "officer@example.com", role: "officer", is_active: true },
          { id: BOTANIST, full_name: "Bo Tanist", email: "bo@example.com", role: "botanist", is_active: true },
        ],
        zones: [],
      });
    }
    if (path === "/observations") {
      const status = new URL(req.url()).searchParams.get("status");
      const wanted = status === "pending" ? "synced" : status;
      return json({ data: state.observations.filter((o) => o.status === wanted), meta: { total: state.observations.filter((o) => o.status === wanted).length } });
    }
    if (path === "/distribution") return json({ data: state.points });
    if (path === "/species" && method === "POST") {
      const made = species({ ...body, id: "44444444-4444-4444-8444-444444444444", is_published: false });
      state.species = [...state.species, made];
      return json(made, 201);
    }
    if (/^\/species\/[^/]+\/publish$/.test(path)) {
      const id = path.split("/")[2];
      state.species = state.species.map((s) => (s.id === id ? { ...s, is_published: body.is_published } : s));
      return json(state.species.find((s) => s.id === id));
    }
    if (/^\/specimens\/[^/]+$/.test(path) && method === "PATCH") {
      const id = path.split("/")[2];
      state.specimens = state.specimens.map((s) => (s.id === id ? { ...s, ...body } : s));
      return json(state.specimens.find((s) => s.id === id));
    }
    if (/\/reviews$/.test(path)) {
      const id = path.split("/")[2];
      state.observations = state.observations.map((o) => (o.id === id ? { ...o, status: "approved" } : o));
      return json({ ok: true }, 201);
    }
    return json({ data: [] });
  });
}

const newState = (over = {}) => ({
  writes: [], workspaceLoads: 0, workspaceDelay: 0, points: [],
  species: [species()], specimens: [specimen(1)], observations: [observation(1)], photos: [photo(1)], ...over,
});

async function open(page, state, hash) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("daun_session", JSON.stringify(session));
  }, { access_token: jwt(), refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: ME, email: "officer@example.com" } });
  await page.route(/(tile\.openstreetmap|arcgisonline|opentopomap)/, (r) => r.abort());
  await mockApi(page, state);
  await page.goto("/" + hash);
}

test("a page refresh stays signed in while the API wakes up", async ({ page }) => {
  const state = newState({ workspaceDelay: 2500 });
  await open(page, state, "#/review");
  // Before the workspace answers: still the officer, not a visitor.
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await expect(page.getByText("Staff sign in")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await expect(page.getByText("Staff sign in")).toHaveCount(0);
  await expect(page.locator(".rqcard", { hasText: "Guessed plant 1" })).toBeVisible();
});

test("a new field record reaches the officer without a refresh, and does not disturb the open record", async ({ page }) => {
  const state = newState();
  await open(page, state, "#/review");
  const note = page.getByPlaceholder("What needs to change?");
  await note.fill("Half-written note");

  state.specimens = [...state.specimens, specimen(2)];
  state.observations = [...state.observations, observation(2)];
  state.photos = [...state.photos, photo(2)];

  await expect(page.locator(".rqcard", { hasText: "Guessed plant 2" })).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".toast")).toContainText("New record to review: NIAH-0002");
  await expect(page).toHaveTitle(/^\(2\) /);
  await expect(note).toHaveValue("Half-written note");
  await expect(page.getByRole("article", { name: "Record for NIAH-0001" })).toBeVisible();
});

test("an officer creates a new species from the review screen and it is linked to the plant", async ({ page }) => {
  const state = newState();
  await open(page, state, "#/review");
  await page.getByRole("button", { name: /Create a new species/ }).click();
  const dialog = page.getByRole("dialog", { name: "Add species" });
  await expect(dialog.getByLabel("Scientific name")).toHaveValue("Guessed plant 1");
  await dialog.getByLabel("Scientific name").fill("Rafflesia keithii");
  await dialog.getByLabel("Family").fill("Rafflesiaceae");
  await dialog.getByRole("button", { name: "Save species" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".rdetail select")).toHaveValue("44444444-4444-4444-8444-444444444444");
  const paths = state.writes.map((w) => `${w.method} ${w.path}`);
  expect(paths).toContain("POST /species");
  expect(paths).toContain("POST /species/44444444-4444-4444-8444-444444444444/publish");
  expect(state.writes.find((w) => w.path === `/specimens/${specimen(1).id}`).body).toEqual({ species_id: "44444444-4444-4444-8444-444444444444" });
});

test("a vulnerable plant's location is hidden by default when it is approved", async ({ page }) => {
  const state = newState({ species: [species({ conservation_status: "vulnerable" })], specimens: [specimen(1, { species_id: SPECIES })] });
  await open(page, state, "#/review");
  const box = page.getByRole("checkbox", { name: /Hide the exact location/ });
  await expect(box).toBeChecked();
  await page.getByRole("button", { name: /Approve/ }).click();
  await expect.poll(() => state.writes.map((w) => w.path)).toContain(`/observations/${observation(1).id}/reviews`);
  const paths = state.writes.map((w) => w.path);
  expect(paths.indexOf(`/specimens/${specimen(1).id}`)).toBeLessThan(paths.indexOf(`/observations/${observation(1).id}/reviews`));
  expect(state.writes[0].body).toEqual({ endangered_override: true });
});

test("selecting a map pin lists every plant at that spot, with photos and coordinates", async ({ page }) => {
  const point = (n, extra = {}) => ({
    observation_id: observation(n).id, specimen_id: specimen(n).id, qr_id: specimen(n).qr_id, species_id: SPECIES, scientific_name: "Nepenthes rajah",
    common_name: "Giant pitcher", family: "Nepenthaceae", conservation_status: "least concern", endangered: false, lat: 3.8, lng: 113.77, location_reduced: false, ...extra,
  });
  const approved = { status: "approved" };
  const state = newState({
    specimens: [specimen(1, { species_id: SPECIES }), specimen(2, { species_id: SPECIES }), specimen(3, { species_id: SPECIES, lat: 3.81, lng: 113.78 })],
    observations: [observation(1, approved), observation(2, approved), observation(3, approved)],
    photos: [photo(1), photo(2), photo(3)],
    points: [point(1), point(2), point(3, { lat: 3.81, lng: 113.78 })],
  });
  await open(page, state, "#/map");

  // At the view fitted to the plants, two plants on one spot make a cluster: it opens both.
  const cluster = page.locator(".daun-cluster");
  await expect(cluster).toHaveCount(1);
  await cluster.click();
  const dialog = page.getByRole("dialog", { name: "2 plants at this spot" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("article")).toHaveCount(2);
  await expect(dialog.getByText("NIAH-0001")).toBeVisible();
  await expect(dialog.getByText("NIAH-0002")).toBeVisible();
  await expect(dialog.getByText("3.80000, 113.77000").first()).toBeVisible();
  await expect(dialog.locator("article img").first()).toHaveAttribute("src", PIXEL);
  await expect(dialog.getByText("Broad leaves").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  // A single pin opens just that plant.
  await page.locator(".custom-pin-wrap").first().click();
  await expect(page.getByRole("dialog", { name: "Plant at this spot" })).toContainText("NIAH-0003");
  await expect(page.getByRole("dialog").getByRole("link", { name: "Google Maps" })).toBeVisible();
});

test("a protected plant's coordinates are never linked to Google Maps", async ({ page }) => {
  const state = newState({
    specimens: [specimen(1, { species_id: SPECIES, endangered_override: true })],
    observations: [observation(1, { status: "approved" })],
    points: [{ observation_id: observation(1).id, specimen_id: specimen(1).id, qr_id: "NIAH-0001", species_id: SPECIES, scientific_name: "Nepenthes rajah", family: "Nepenthaceae", endangered: true, lat: 3.8, lng: 113.77, location_reduced: false }],
  });
  await open(page, state, "#/map");
  await page.locator(".custom-pin-wrap").click();
  const dialog = page.getByRole("dialog", { name: "Plant at this spot" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Google Maps" })).toHaveCount(0);
});

test("an officer's map never asks the tile server for close-ups of a protected plant (T19)", async ({ page }) => {
  const zooms = [];
  await page.route(/tile\.openstreetmap/, (r) => {
    zooms.push(Number(r.request().url().match(/org\/(\d+)\//)[1]));
    return r.abort();
  });
  const state = newState({
    specimens: [specimen(1, { species_id: SPECIES, endangered_override: true })],
    observations: [observation(1, { status: "approved" })],
    points: [{ observation_id: observation(1).id, specimen_id: specimen(1).id, qr_id: "NIAH-0001", species_id: SPECIES, scientific_name: "Nepenthes rajah", family: "Nepenthaceae", endangered: true, lat: 3.8, lng: 113.77, location_reduced: false }],
  });
  await page.addInitScript((session) => {
    window.localStorage.setItem("daun_session", JSON.stringify(session));
  }, { access_token: jwt(), refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: ME, email: "officer@example.com" } });
  await mockApi(page, state);
  await page.goto("/#/map");
  await expect(page.locator(".custom-pin-wrap")).toBeVisible();
  await page.waitForTimeout(500); // the park overview from before the plant arrived does not point at it
  zooms.length = 0;
  for (let i = 0; i < 3; i++) {
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(350);
  }
  await expect(page.locator(".map-readout")).toContainText("Zoom 20");
  await page.mouse.move(400, 400);
  await page.waitForTimeout(300);
  expect(zooms.filter((z) => z > 15)).toEqual([]);
});

test("Send to carries a link only, with no plant name or tag list", async ({ page }) => {
  const state = newState({
    specimens: [specimen(1)],
    observations: [observation(1)],
  });
  await open(page, state, "#/review");
  await page.getByRole("button", { name: "Send to…" }).click();
  await page.locator(".sendto input[type=checkbox]").first().check();
  const href = decodeURIComponent(await page.locator(".sendto a.btn").getAttribute("href"));
  expect(href).toContain("#/tag/NIAH-0001");
  expect(href).not.toContain("Nepenthes");
  expect(href).not.toMatch(/3\.8|113\.7/);
});

test("reset zoom brings every plant back into view after zooming in", async ({ page }) => {
  const point = (n, lat, lng) => ({
    observation_id: observation(n).id, specimen_id: specimen(n).id, qr_id: specimen(n).qr_id, species_id: SPECIES, scientific_name: "Nepenthes rajah",
    family: "Nepenthaceae", endangered: false, lat, lng, location_reduced: false,
  });
  const state = newState({
    specimens: [specimen(1, { species_id: SPECIES, lat: 3.8, lng: 113.77 }), specimen(2, { species_id: SPECIES, lat: 3.81, lng: 113.78 })],
    observations: [observation(1, { status: "approved" }), observation(2, { status: "approved" })],
    points: [point(1, 3.8, 113.77), point(2, 3.81, 113.78)],
  });
  await open(page, state, "#/map");
  const pins = page.locator(".custom-pin-wrap");
  await expect(pins).toHaveCount(2);
  const inView = () => pins.evaluateAll((els) => {
    const box = document.querySelector(".leaflet-map-wrapper").getBoundingClientRect();
    return els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
    }).length;
  });
  const readout = page.locator(".map-readout");
  const startZoom = (await readout.textContent()).match(/Zoom (\d+)/)?.[1];
  expect(await inView()).toBe(2);

  for (let i = 0; i < 3; i++) {
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(400);
  }
  await expect.poll(inView).toBeLessThan(2);

  await page.getByRole("button", { name: /Reset zoom/ }).click();
  await expect.poll(inView).toBe(2);
  if (startZoom) await expect(readout).toContainText(`Zoom ${startZoom}`);
});
