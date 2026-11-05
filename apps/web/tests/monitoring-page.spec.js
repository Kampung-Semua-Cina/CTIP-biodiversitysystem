// apps/web/tests/monitoring-page.spec.js
// The monitoring page must open even when the data is incomplete: a sensor node with
// no plant, an alert with no node or reading. The API is mocked in the browser.
import { test, expect } from "@playwright/test";
import { newState, open, specimen } from "./helpers/mockApi.js";

test("monitoring opens with a node that has no plant and an alert with no reading", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = newState();
  state.sensorNodes = [
    { id: "aaaaaaaa-0000-4000-8000-000000000001", specimen_id: null, status: "active", thresholds: null, last_seen: null, created_at: "2026-11-01T00:00:00Z" },
    { id: "aaaaaaaa-0000-4000-8000-000000000002", specimen_id: specimen(1).id, status: "offline", thresholds: { temp_max: 35, moisture_min: 20 }, last_seen: "2026-11-02T00:00:00Z", created_at: "2026-11-01T00:00:00Z" },
  ];
  state.alerts = [
    { id: "bbbbbbbb-0000-4000-8000-000000000001", node_id: null, type: "Overheat", reading: null, severity: "high", status: "open", created_at: "2026-11-03T00:00:00Z" },
  ];
  await open(page, state, "#/monitoring");
  await expect(page.getByRole("heading", { name: "Monitoring" })).toBeVisible();
  await expect(page.getByText("No plant assigned")).toBeVisible();
  await expect(page.getByText("Unknown node").first()).toBeVisible();
  expect(errors).toEqual([]);
});
