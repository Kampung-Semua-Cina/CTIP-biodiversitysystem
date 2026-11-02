// apps/web/tests/mobile-map-html.spec.js
// The page the phone app shows in its WebView (apps/shared/mapHtml.js), run in a real
// browser. Leaflet is served from node_modules and tile servers are never contacted.
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { generateMapHtml } from "../../shared/mapHtml.js";

const require = createRequire(import.meta.url);
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const pin = (id, lat, lng, extra = {}) => ({ id, qr_id: `NIAH-${id}`, name: `Plant ${id}`, color: "#2f7a3c", lat, lng, ...extra });

// Opens the page and collects what it sends to the app and which tile zooms it asks for.
async function openMap(page, options) {
  const tiles = [];
  tiles.seen = []; // street map tiles, with their position
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const cors = { "access-control-allow-origin": "*" };
    if (url === "http://map.test/") return route.fulfill({ contentType: "text/html", body: generateMapHtml({ showControls: false, ...options }) });
    if (url.includes("unpkg.com/leaflet@")) {
      const file = url.split("/dist/")[1];
      return route.fulfill({ headers: cors, contentType: file.endsWith(".js") ? "text/javascript" : "text/css", body: readFileSync(require.resolve(`leaflet/dist/${file}`)) });
    }
    if (url.includes("unpkg.com/leaflet.markercluster@")) {
      const file = url.split("/dist/")[1];
      return route.fulfill({ headers: cors, contentType: file.endsWith(".js") ? "text/javascript" : "text/css", body: readFileSync(require.resolve(`leaflet.markercluster/dist/${file}`)) });
    }
    const tile = url.match(/tile\.openstreetmap\.org\/(\d+)\//) || url.match(/MapServer\/tile\/(\d+)\//);
    if (tile) {
      tiles.push(Number(tile[1]));
      const osm = url.match(/org\/(\d+)\/(\d+)\/(\d+)/);
      if (osm) tiles.seen.push({ z: Number(osm[1]), x: Number(osm[2]), y: Number(osm[3]) });
      return route.fulfill({ contentType: "image/gif", body: PIXEL });
    }
    return route.abort();
  });
  await page.addInitScript(() => {
    window.sent = [];
    window.ReactNativeWebView = { postMessage: (s) => window.sent.push(JSON.parse(s)) };
  });
  await page.goto("http://map.test/");
  await page.waitForFunction(() => typeof window.handleIncoming === "function");
  return tiles;
}

// How far a tile's nearest edge is from a spot, in metres.
function metresFromTile({ z, x, y }, lat, lng) {
  const n = 2 ** z;
  const latAt = (row) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  const nearLat = Math.min(latAt(y), Math.max(latAt(y + 1), lat));
  const nearLng = Math.min(((x + 1) / n) * 360 - 180, Math.max((x / n) * 360 - 180, lng));
  return Math.hypot(nearLat - lat, (nearLng - lng) * Math.cos((lat * Math.PI) / 180)) * 111320;
}

const lastSent = (page, type) => page.evaluate((t) => window.sent.filter((m) => m.type === t).at(-1), type);

test.describe("Mobile map page", () => {
  test("a pin sends every plant at its spot to the app", async ({ page }) => {
    await openMap(page, { points: [pin("A", 3.81, 113.78), pin("B", 3.81, 113.78), pin("C", 3.83, 113.8)] });
    await page.evaluate(() => window.handleIncoming({ type: "FIT_POINTS" }));
    await page.evaluate(() => window.handleIncoming({ type: "UPDATE_POINTS", points: [
      { id: "A", qr_id: "NIAH-A", name: "Plant A", lat: 3.81, lng: 113.78 },
    ], fit: true }));
    await page.locator(".pin-container").first().click({ force: true });
    await expect.poll(() => lastSent(page, "SELECT_PLANT")).toMatchObject({ id: "A", ids: ["A"] });
  });

  test("a group at one spot opens a list, and a spread-out group zooms in first", async ({ page }) => {
    await openMap(page, { points: [pin("A", 3.81, 113.78), pin("B", 3.81, 113.78)] });
    await page.locator(".daun-cluster").first().click();
    await expect.poll(async () => (await lastSent(page, "SELECT_PLANT"))?.ids?.sort()).toEqual(["A", "B"]);

    await page.evaluate(() => {
      window.sent.length = 0;
      window.handleIncoming({ type: "UPDATE_POINTS", points: [
        { id: "C", qr_id: "NIAH-C", name: "C", lat: 3.8, lng: 113.77 },
        { id: "D", qr_id: "NIAH-D", name: "D", lat: 3.801, lng: 113.771 },
      ] });
    });
    await page.locator(".daun-cluster").first().click();
    await page.waitForTimeout(600);
    expect(await lastSent(page, "SELECT_PLANT")).toBeUndefined();
  });

  test("tapping the map reports the spot, for setting a location by hand", async ({ page }) => {
    await openMap(page, { points: [] });
    await page.mouse.click(200, 200);
    const click = await page.evaluate(() => new Promise((done) => {
      const look = () => {
        const hit = window.sent.find((m) => m.type === "MAP_CLICK");
        if (hit) done(hit); else setTimeout(look, 50);
      };
      look();
    }));
    expect(click.lat).toEqual(expect.any(Number));
    expect(click.lng).toEqual(expect.any(Number));
  });

  test("only a view showing a protected plant is limited, and the rest keep full detail", async ({ page }) => {
    const tiles = await openMap(page, { points: [pin("A", 3.81, 113.78)], selectedId: "A" });
    const show = (points, selectedId) => page.evaluate((m) => window.handleIncoming({ type: "UPDATE_POINTS", fit: true, ...m }), { points, selectedId });
    const near = pin("E", 3.82, 113.79, { protect: true });

    // About 1.5 km from the protected plant, off screen at zoom 18: stays sharp.
    await show([pin("F", 3.82, 113.7765), near], "F");
    await expect.poll(() => Math.max(0, ...tiles), "full detail beside the plant").toBeGreaterThan(15);
    await page.waitForTimeout(500); // let the requests already on their way arrive

    tiles.length = 0;
    await show([pin("F", 3.82, 113.7765), near], "E");
    await page.evaluate(() => window.handleIncoming({ type: "SET_LAYER", layer: "satellite" }));
    await expect.poll(() => tiles.length, "satellite tiles have not been fetched before").toBeGreaterThan(0);
    await page.waitForTimeout(500);
    expect(Math.max(...tiles)).toBeLessThanOrEqual(15);
  });

  test("dragging the view towards a protected plant never fetches a close-up of the ground around it", async ({ page }) => {
    const tiles = await openMap(page, { points: [] });
    // At zoom 18 a pixel is about 0.6 m, and the plant starts about 4 km to the east.
    await page.evaluate(() => window.handleIncoming({ type: "UPDATE_POINTS", fit: true, selectedId: "F", points: [
      { id: "F", qr_id: "NIAH-F", name: "F", lat: 3.8, lng: 113.7 },
      { id: "E", qr_id: "NIAH-E", name: "E", lat: 3.8, lng: 113.736, protect: true },
    ] }));
    await expect.poll(() => tiles.seen.filter((t) => t.z > 15).length, "starts with full detail").toBeGreaterThan(0);
    const { width, height } = page.viewportSize();
    const stroke = Math.round(width * 0.8);
    const strokes = Math.ceil(4000 / (stroke * 0.6));
    for (let i = 0; i < strokes; i++) {
      await page.mouse.move(width * 0.9, height / 2);
      await page.mouse.down();
      await page.mouse.move(width * 0.9 - stroke, height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(500);
    // Close-ups may come near the plant, but never reach its spot or the ground just around it.
    const closeUps = tiles.seen.filter((t) => t.z > 15 && metresFromTile(t, 3.8, 113.736) < 150);
    expect(closeUps).toEqual([]);
  });

  test("a high-density phone screen gets tiles one zoom deeper, never past what the server has", async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 390, height: 780 } });
    const page = await context.newPage();
    const tiles = await openMap(page, { points: [] });
    await page.evaluate(() => {
      window.handleIncoming({ type: "SET_LAYER", layer: "satellite" });
      window.handleIncoming({ type: "UPDATE_POINTS", fit: true, selectedId: "A", points: [{ id: "A", qr_id: "NIAH-A", name: "A", lat: 3.81, lng: 113.78 }] });
    });
    // Zoom 18 on the map: 18 is also the deepest Esri has here, and it must be asked for.
    await expect.poll(() => Math.max(0, ...tiles)).toBe(18);
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(500);
    expect(Math.max(...tiles)).toBe(18);
    await context.close();
  });

  test("the zoom buttons move above the card the app shows over the map", async ({ page }) => {
    await openMap(page, { points: [] });
    const buttons = page.locator(".leaflet-control-zoom");
    const before = (await buttons.boundingBox()).y;
    await page.evaluate(() => window.handleIncoming({ type: "SET_INSET", bottom: 120 }));
    await expect.poll(async () => before - (await buttons.boundingBox()).y).toBe(120);
  });

  test("reset zoom brings back every plant", async ({ page }) => {
    await openMap(page, { points: [pin("A", 3.7, 113.6), pin("B", 3.95, 113.95)] });
    await page.evaluate(() => {
      window.handleIncoming({ type: "UPDATE_POINTS", points: [
        { id: "A", qr_id: "NIAH-A", name: "A", lat: 3.7, lng: 113.6 },
        { id: "B", qr_id: "NIAH-B", name: "B", lat: 3.95, lng: 113.95 },
      ], selectedId: "A", fit: true });
    });
    await expect(page.locator(".pin-container"), "zoomed in on one plant").toHaveCount(1);
    await page.evaluate(() => window.handleIncoming({ type: "FIT_POINTS" }));
    await expect(page.locator(".pin-container")).toHaveCount(2);
  });
});
