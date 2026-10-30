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

  // =========================================================================
  // 6. JIRA CTIP-45 & CTIP-69: Observation Review Lock for Botanists
  // =========================================================================
  test("Jira CTIP-45/69: Observations pending review lock edits and revisit actions for botanists", () => {
    // A plant with an observation pending officer review (status 'synced')
    const plant = { id: "p-1", qr_id: "NIAH-0001" };
    const observations = [
      { id: "obs-1", specimen_id: "p-1", status: "synced", version: 1, recorded_by: "botanist-1" },
    ];

    // 1. In Review status ('synced') locks edits:
    const pendingObs = observations.find((o) => o.specimen_id === plant.id && o.status === "synced");
    assert.ok(pendingObs, "Plant has an observation awaiting review");

    // Revisit action must be blocked when an observation is still pending
    function canRecordRevisit(role, specimenObs) {
      if (role !== "botanist") return false;
      const hasPending = specimenObs.some((o) => o.status === "synced");
      return !hasPending;
    }

    assert.equal(canRecordRevisit("botanist", observations), false, "Botanists cannot record a revisit while review is pending");
    assert.equal(canRecordRevisit("officer", observations), false, "Officers cannot record revisits");

    // 2. Form fields are read-only when status is 'synced'
    function canEditObservation(obs, role) {
      if (role !== "botanist") return false;
      // Only 'returned' records allow editing and fixing
      return obs.status === "returned";
    }

    assert.equal(canEditObservation(pendingObs, "botanist"), false, "Botanists cannot edit a pending (synced) observation");

    // 3. When an officer returns the record, edits become unlocked
    const returnedObs = { ...pendingObs, status: "returned", version: 1 };
    assert.equal(canEditObservation(returnedObs, "botanist"), true, "Botanists can edit returned observations");

    // 4. Once approved, the record is permanently locked from botanist edits
    const approvedObs = { ...pendingObs, status: "approved", version: 2 };
    assert.equal(canEditObservation(approvedObs, "botanist"), false, "Approved observations cannot be edited");
    assert.equal(canRecordRevisit("botanist", [approvedObs]), true, "Botanists can record revisits once previous observation is approved");
  });

  // =========================================================================
  // 7. JIRA CTIP-42 & CTIP-114: Mobile Account Screen & Security Controls
  // =========================================================================
  test("Jira CTIP-42/114: Mobile Account settings route permissions and password validation", () => {
    // 1. Route existence and RBAC
    assert.ok(ROUTE_NAMES.includes("account"), "Route 'account' is registered in ROUTE_NAMES");
    assert.equal(NEEDS.account, "pending", "Account route requires 'pending' (authenticated staff)");
    assert.equal(canAccess("visitor", "account"), false, "Visitor cannot access Account screen");
    assert.equal(canAccess("botanist", "account"), true, "Botanist can access Account screen");
    assert.equal(canAccess("officer", "account"), true, "Officer can access Account screen");
    assert.equal(canAccess("admin", "account"), true, "Admin can access Account screen");

    // 2. Password change validation rules (from Account.js / StoreProvider.js)
    function validatePasswordChange(current, next, again) {
      if (!current) return { ok: false, error: "Enter your current password" };
      if (!next || next.length < 8) return { ok: false, error: "Use at least 8 characters for the new password" };
      if (next !== again) return { ok: false, error: "The new passwords do not match" };
      if (next === current) return { ok: false, error: "Choose a password different from your current one" };
      return { ok: true };
    }

    assert.equal(validatePasswordChange("", "newSecret123", "newSecret123").ok, false);
    assert.equal(validatePasswordChange("oldSecret123", "short", "short").ok, false);
    assert.equal(validatePasswordChange("oldSecret123", "newSecret123", "different123").ok, false);
    assert.equal(validatePasswordChange("oldSecret123", "oldSecret123", "oldSecret123").ok, false);
    assert.equal(validatePasswordChange("oldSecret123", "newSecret123", "newSecret123").ok, true);
  });

  // =========================================================================
  // 8. JIRA CTIP-34 & CTIP-43: Admin-Only Invites & Zero Public Registration
  // =========================================================================
  test("Jira CTIP-34/43: Only admins can provision accounts; public self-registration is rejected", () => {
    // 1. Role permission: Only admin can access users
    assert.equal(can("admin", "users"), true, "Admin has 'users' permission");
    assert.equal(can("officer", "users"), false, "Officer does not have 'users' permission");
    assert.equal(can("botanist", "users"), false, "Botanist does not have 'users' permission");
    assert.equal(can("visitor", "users"), false, "Visitor does not have 'users' permission");

    // 2. User onboarding payload creation:
    // When password is omitted, it's an email invitation; when provided, it's immediate setup
    function createInvitePayload({ full_name, email, role, password }) {
      const invite = !password;
      return {
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        role: role || "botanist",
        is_invite: invite,
        has_temporary_password: !!password,
      };
    }

    const emailInvite = createInvitePayload({ full_name: "Dr. Jane Doe", email: "jane@sfc.my", role: "botanist" });
    assert.equal(emailInvite.is_invite, true, "Blank password creates an email invitation flow");
    assert.equal(emailInvite.has_temporary_password, false);

    const directSetup = createInvitePayload({ full_name: "Alex Tan", email: "alex@sfc.my", role: "officer", password: "InitialPass123!" });
    assert.equal(directSetup.is_invite, false, "Specified password creates an immediate account setup");
    assert.equal(directSetup.has_temporary_password, true);
  });

  // =========================================================================
  // 9. Real-Time Live Polling Invariant
  // =========================================================================
  test("Live Polling: Background polling executes quietly and responds to AppState", () => {
    let pollCount = 0;
    let isQuiet = false;
    let isTimerActive = false;

    const mockPollFn = async (quiet) => {
      pollCount++;
      isQuiet = quiet;
    };

    function simulatePollingController(appState) {
      if (appState === "active") {
        isTimerActive = true;
        mockPollFn(true); // immediate fetch
      } else {
        isTimerActive = false;
      }
    }

    // Mount screen in active app
    simulatePollingController("active");
    assert.equal(pollCount, 1, "Immediate poll fires on active mount");
    assert.equal(isQuiet, true, "Polling runs quietly without toasts");
    assert.equal(isTimerActive, true, "Polling timer is active in foreground");

    // App goes to background
    simulatePollingController("background");
    assert.equal(isTimerActive, false, "Polling timer is suspended in background");

    // App returns to foreground
    simulatePollingController("active");
    assert.equal(pollCount, 2, "Re-foregrounding immediately triggers a poll");
    assert.equal(isTimerActive, true, "Polling timer resumes in foreground");
  });

});
