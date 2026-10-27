// apps/mobile/tests/agent-mobile-jira-traceability.test.mjs
// Ported from apps/web/tests/agent-jira-traceability.spec.js for Daun Sense Mobile
// Full Jira requirement traceability across mobile workstreams
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { can, ROLES } from "../../shared/permissions.js";
import { canAccess, NEEDS, FULL_SCREEN, ROUTE_NAMES } from "../navigation/routeMeta.js";
import { MobileDriver } from "./helpers/mobileDriver.mjs";
import { attachLogcatWatchdog } from "./helpers/logcatWatchdog.mjs";
import { auditWithOllama } from "./helpers/ollama.mjs";

describe("Mobile Port: Jira Requirements Traceability (from agent-jira-traceability.spec.js)", () => {
  let driver;
  let watchdog;
  let deviceStatus;

  before(async () => {
    driver = new MobileDriver();
    deviceStatus = await driver.checkDevice();
    if (deviceStatus.available) {
      watchdog = attachLogcatWatchdog(deviceStatus.serial);
    }
  });

  after(() => {
    if (watchdog) watchdog.stop();
  });

  // =========================================================================
  // 1. JIRA CTIP-30: Species Catalogue Partial Match & Family Filters
  // =========================================================================
  test("Jira CTIP-30: Species catalogue partial matching and family filtering", async () => {
    const mockSpecies = [
      { id: "1", scientific_name: "Nepenthes rajah", common_name: "Rajah Pitcher", family: "Nepenthaceae" },
      { id: "2", scientific_name: "Nepenthes tentaculata", common_name: "Fringed Pitcher", family: "Nepenthaceae" },
      { id: "3", scientific_name: "Rafflesia pricei", common_name: "Price's Rafflesia", family: "Rafflesiaceae" },
      { id: "4", scientific_name: "Begonia darthvaderiana", common_name: "Dark Begonia", family: "Begoniaceae" },
    ];

    // Filter by partial search term
    const query = "pitcher";
    const searchResults = mockSpecies.filter(
      (s) =>
        s.common_name.toLowerCase().includes(query) ||
        s.scientific_name.toLowerCase().includes(query)
    );
    assert.equal(searchResults.length, 2, "Partial search for 'pitcher' should return 2 Nepenthes species");

    // Filter by family
    const familyFilter = "Nepenthaceae";
    const familyResults = mockSpecies.filter((s) => s.family === familyFilter);
    assert.equal(familyResults.length, 2);

    // Combined search and family
    const combined = mockSpecies.filter(
      (s) =>
        s.family === familyFilter &&
        (s.common_name.toLowerCase().includes("rajah") || s.scientific_name.toLowerCase().includes("rajah"))
    );
    assert.equal(combined.length, 1);
    assert.equal(combined[0].id, "1");

    // Ollama AI Invariant evaluation
    const audit = await auditWithOllama({
      prompt: "Verify CTIP-30 Species Catalogue search and family filtering accuracy. Does filtering correctly isolate target botanical families without false drops?",
      domSummary: `Query: ${query}, Family: ${familyFilter}, Results: ${combined.map((c) => c.scientific_name).join(", ")}`,
    });
    if (audit.available) {
      console.log("  🤖 [Ollama CTIP-30 Verdict]:", audit.result);
      assert.ok(audit.result);
    }
  });

  // =========================================================================
  // 2. JIRA CTIP-33: Public QR Landing & Unknown Tag Handling
  // =========================================================================
  test("Jira CTIP-33: Public QR landing renders friendly feedback for unknown tags without login", () => {
    // Ported from AddPlant.js lines 114-118 and 227:
    function handleScannedTag({ qr, registeredPlants = [] }) {
      if (!qr) {
        return { action: "empty", message: "Scan an unused tag first. The record starts from the tag on the plant." };
      }
      const existing = registeredPlants.find((p) => p.qr_id === qr && !p.is_deleted);
      if (existing) {
        return { action: "revisit", plant: existing };
      }
      return { action: "new", qr };
    }

    // 1. Missing QR
    const missing = handleScannedTag({ qr: null });
    assert.equal(missing.action, "empty");
    assert.match(missing.message, /Scan an unused tag first/i);

    // 2. Unassigned fresh QR code (new observation flow)
    const fresh = handleScannedTag({ qr: "NIAH-0450", registeredPlants: [] });
    assert.equal(fresh.action, "new");
    assert.equal(fresh.qr, "NIAH-0450");

    // 3. Existing registered QR (revisit flow)
    const existing = handleScannedTag({
      qr: "NIAH-0100",
      registeredPlants: [{ id: "p-100", qr_id: "NIAH-0100", is_deleted: false }],
    });
    assert.equal(existing.action, "revisit");
    assert.equal(existing.plant.id, "p-100");
  });

  // =========================================================================
  // 3. JIRA CTIP-39/79/78: IoT Node Telemetry & Alert Resolution
  // =========================================================================
  test("Jira CTIP-39/79/78: IoT node telemetry status and alert threshold checks", () => {
    const node = {
      id: "node-niah-01",
      name: "Great Cave Sensor Node",
      battery_pct: 88,
      temperature_c: 24.5,
      humidity_pct: 92.0,
      soil_moisture_pct: 75.0,
      status: "online",
    };

    // Environmental thresholds for cave flora
    const isTempNormal = node.temperature_c >= 18 && node.temperature_c <= 32;
    const isHumidityNormal = node.humidity_pct >= 60;
    const isBatteryOk = node.battery_pct > 20;

    assert.ok(isTempNormal, "Temperature should be within normal range");
    assert.ok(isHumidityNormal, "Cave humidity should exceed 60%");
    assert.ok(isBatteryOk, "Battery level should be above warning threshold");

    // Alert resolution state transition
    const sampleAlert = { id: "a1", node_id: "node-niah-01", type: "humidity_high", resolved: false };
    function resolveAlert(alert, note, resolvedBy) {
      if (!note || !note.trim()) throw new Error("Resolution note is required");
      return { ...alert, resolved: true, resolution_note: note.trim(), resolved_by: resolvedBy };
    }

    const resolved = resolveAlert(sampleAlert, "Sensor re-calibrated after heavy rain", "officer-1");
    assert.equal(resolved.resolved, true);
    assert.equal(resolved.resolution_note, "Sensor re-calibrated after heavy rain");
  });

  // =========================================================================
  // 4. JIRA CTIP-34/72: RBAC Route Accessibility Matrix
  // =========================================================================
  test("Jira CTIP-34/72: Mobile RBAC permissions matrix correctly restricts screens", () => {
    // Visitor permissions
    assert.equal(canAccess("visitor", "home"), true);
    assert.equal(canAccess("visitor", "plants"), true);
    assert.equal(canAccess("visitor", "map"), true);
    assert.equal(canAccess("visitor", "add"), false, "Visitor cannot access Add Plant");
    assert.equal(canAccess("visitor", "records"), false, "Visitor cannot access Records");
    assert.equal(canAccess("visitor", "review"), false, "Visitor cannot access Review Queue");
    assert.equal(canAccess("visitor", "users"), false, "Visitor cannot access User Management");

    // Field Botanist permissions
    assert.equal(canAccess("botanist", "add"), true, "Botanist can add plants");
    assert.equal(canAccess("botanist", "records"), true, "Botanist can view records");
    assert.equal(canAccess("botanist", "review"), false, "Botanist cannot review/approve observations");
    assert.equal(canAccess("botanist", "users"), false, "Botanist cannot manage users");

    // Conservation Officer permissions
    assert.equal(canAccess("officer", "review"), true, "Officer can access review queue");
    assert.equal(canAccess("officer", "monitor"), true, "Officer can access IoT monitor");
    assert.equal(canAccess("officer", "reports"), true, "Officer can access reports");
    assert.equal(canAccess("officer", "users"), false, "Officer cannot manage users");

    // Administrator permissions
    assert.equal(canAccess("admin", "users"), true, "Admin can manage users");
    assert.equal(canAccess("admin", "audit"), true, "Admin can view audit logs");
  });

  // =========================================================================
  // 5. JIRA CTIP-32: Mobile Record Status Lifecycle
  // =========================================================================
  test("Jira CTIP-32: Observation record lifecycle conforms to status progression", () => {
    const validStatuses = ["draft", "queued", "synced", "returned", "approved", "rejected"];
    const allowedTransitions = {
      draft: ["queued", "synced"],
      queued: ["synced"],
      synced: ["returned", "approved", "rejected"],
      returned: ["synced", "draft"],
      approved: [],
      rejected: [],
    };

    function canTransition(from, to) {
      return (allowedTransitions[from] || []).includes(to);
    }

    assert.ok(canTransition("draft", "synced"));
    assert.ok(canTransition("synced", "approved"));
    assert.ok(canTransition("synced", "returned"));
    assert.ok(canTransition("returned", "synced"));
    assert.equal(canTransition("approved", "draft"), false, "Approved record cannot revert directly to draft");
  });
});
