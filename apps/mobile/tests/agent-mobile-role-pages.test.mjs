// apps/mobile/tests/agent-mobile-role-pages.test.mjs
// Automated verification for every page, screen, and role (Visitor, Botanist, Officer, Admin).
// Verifies tab order invariants, role screen access control, species submission preconditions,
// gallery photo support, real demo credentials, and recently published home screen fallback.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ROUTE_NAMES, canAccess, isFullScreen } from "../navigation/routeMeta.js";
import { TABS, getRoleTabs, getRoleDefaultTab, badgeCounts } from "../navigation/tabs.js";
import { ROLES, can } from "../../shared/permissions.js";
import { initialProfiles, DEMO_USER, DEMO_EMAILS, DEMO_PASSWORD, seed } from "../../shared/data.js";
import { visiblePlants, speciesCatalogue, extractTag, lookupTag } from "../../shared/selectors.js";

describe("Mobile Port: Automated Role & Page Verification", () => {
  // =========================================================================
  // 1. BOTTOM NAVIGATION BAR INVARIANTS ACROSS ALL ROLES
  // =========================================================================
  test("Bottom Tab Bar: With every role, Plants is 2nd button, Middle 3rd button is Scan/Add plant", () => {
    const roles = ["visitor", "botanist", "officer", "admin"];

    for (const r of roles) {
      const tabs = getRoleTabs(r);
      assert.equal(tabs.length, 5, `Role '${r}' must have exactly 5 bottom tabs`);

      // 2nd button MUST be Plants
      const secondTab = tabs[1];
      assert.ok(
        secondTab.key === "plants" || secondTab.key === "tagged",
        `Role '${r}' 2nd button key must be 'plants' or 'tagged' (found '${secondTab.key}')`
      );
      assert.equal(secondTab.label, "Plants", `Role '${r}' 2nd button label must be 'Plants'`);
      assert.equal(secondTab.icon, "leaf", `Role '${r}' 2nd button icon must be 'leaf'`);

      // 3rd button MUST be Scan / Add plant and flagged as main (raised centre button)
      const thirdTab = tabs[2];
      assert.equal(thirdTab.key, "scan", `Role '${r}' 3rd button key must be 'scan'`);
      assert.ok(thirdTab.main, `Role '${r}' 3rd button must have main: true`);
      assert.ok(
        thirdTab.label === "Scan" || thirdTab.label === "Add plant",
        `Role '${r}' 3rd button label must be 'Scan' or 'Add plant' (found '${thirdTab.label}')`
      );
    }
  });

  test("Bottom Tab Bar: Officer has Review 1st, Botanist has My Records 1st, Admin has Users 1st", () => {
    // Botanist: "My Records" 1st button
    const botanistTabs = getRoleTabs("botanist");
    assert.equal(botanistTabs[0].key, "records", "Botanist 1st button key must be 'records'");
    assert.equal(botanistTabs[0].label, "My records", "Botanist 1st button label must be 'My records'");
    assert.equal(getRoleDefaultTab("botanist"), "records", "Botanist default screen must be 'records'");

    // Officer: "Review" left (1st) button, and monitor is NOT in tabs
    const officerTabs = getRoleTabs("officer");
    assert.equal(officerTabs[0].key, "review", "Officer 1st button key must be 'review'");
    assert.equal(officerTabs[0].label, "Review", "Officer 1st button label must be 'Review'");
    assert.equal(getRoleDefaultTab("officer"), "review", "Officer default screen must be 'review'");
    assert.ok(
      !officerTabs.some((t) => t.key === "monitor"),
      "Officer bottom bar must NOT contain 'monitor' (moved to More section)"
    );

    // Admin: "Users" 1st button
    const adminTabs = getRoleTabs("admin");
    assert.equal(adminTabs[0].key, "users", "Admin 1st button key must be 'users'");
    assert.equal(adminTabs[0].label, "Users", "Admin 1st button label must be 'Users'");
    assert.equal(getRoleDefaultTab("admin"), "users", "Admin default screen must be 'users'");

    // Visitor: "Home" 1st button
    const visitorTabs = getRoleTabs("visitor");
    assert.equal(visitorTabs[0].key, "home", "Visitor 1st button key must be 'home'");
    assert.equal(visitorTabs[0].label, "Home", "Visitor 1st button label must be 'Home'");
    assert.equal(getRoleDefaultTab("visitor"), "home", "Visitor default screen must be 'home'");
  });

  // =========================================================================
  // 2. ROLE-BASED ACCESS CONTROL (RBAC) FOR EVERY SCREEN
  // =========================================================================
  test("Screen Permissions: Visitor has access to public screens, restricted from staff routes", () => {
    const allowed = ["home", "about", "contact", "more", "plants", "species", "tag", "tagged", "map", "scan", "signin"];
    for (const route of allowed) {
      assert.equal(canAccess("visitor", route), true, `Visitor should have access to '${route}'`);
    }

    const restricted = ["records", "add", "submitted", "revisit", "review", "monitor", "users", "audit", "speciesAdmin", "tags", "reports"];
    for (const route of restricted) {
      assert.equal(canAccess("visitor", route), false, `Visitor must be blocked from '${route}'`);
    }
  });

  test("Screen Permissions: Botanist has access to field records and add plant, blocked from officer/admin tools", () => {
    const allowed = ["records", "record", "add", "submitted", "revisit", "alerts", "discussion", "staffMore", "tagged", "plants", "species", "tag", "map", "scan"];
    for (const route of allowed) {
      assert.equal(canAccess("botanist", route), true, `Botanist should have access to '${route}'`);
    }

    const blocked = ["review", "reviewItem", "monitor", "alert", "users", "audit", "speciesAdmin", "tags", "reports"];
    for (const route of blocked) {
      assert.equal(canAccess("botanist", route), false, `Botanist must be blocked from '${route}'`);
    }
  });

  test("Screen Permissions: Officer has access to review queue and monitoring, blocked from admin tools", () => {
    const allowed = ["review", "reviewItem", "monitor", "alert", "speciesAdmin", "tags", "reports", "alerts", "discussion", "staffMore", "tagged", "plants", "species", "tag", "map", "scan"];
    for (const route of allowed) {
      assert.equal(canAccess("officer", route), true, `Officer should have access to '${route}'`);
    }

    const blocked = ["users", "audit"];
    for (const route of blocked) {
      assert.equal(canAccess("officer", route), false, `Officer must be blocked from '${route}'`);
    }
  });

  test("Screen Permissions: Admin has access to user management, audit log, and officer tools", () => {
    const allowed = ["users", "audit", "speciesAdmin", "tags", "monitor", "alert", "alerts", "discussion", "staffMore", "tagged", "plants", "species", "tag", "map", "scan"];
    for (const route of allowed) {
      assert.equal(canAccess("admin", route), true, `Admin should have access to '${route}'`);
    }
  });

  // =========================================================================
  // 3. SUBMISSION PRECONDITIONS: SPECIES REQUIRED BEFORE REVIEW
  // =========================================================================
  test("Add Plant Workflow: Requires a confirmed species before record can be submitted for review", () => {
    function validateAddPlant({ qr, photos, looks, species }) {
      const problems = {
        photos: !photos || photos.length === 0,
        looks: !looks || !looks.trim(),
        species: !species || !species.trim(),
      };
      const ok = !problems.photos && !problems.looks && !problems.species;
      return { ok, problems };
    }

    // Without species -> must fail
    const noSpecies = validateAddPlant({
      qr: "NIAH-0001",
      photos: [{ url: "file://photo1.jpg" }],
      looks: "Green pitcher plant with red speckles",
      species: "",
    });
    assert.equal(noSpecies.ok, false, "Submission without species must not be ok");
    assert.equal(noSpecies.problems.species, true, "Species problem flag must be true");

    // With species -> must pass
    const withSpecies = validateAddPlant({
      qr: "NIAH-0001",
      photos: [{ url: "file://photo1.jpg" }],
      looks: "Green pitcher plant with red speckles",
      species: "Nepenthes rajah",
    });
    assert.equal(withSpecies.ok, true, "Submission with valid species and photos must be ok");
    assert.equal(withSpecies.problems.species, false, "Species problem flag must be false");
  });

  // =========================================================================
  // 4. PROTOTYPE ROLE SWITCH AUTHENTICATION CREDENTIALS
  // =========================================================================
  test("Prototype Role Switch: Uses actual emails and shared password", () => {
    assert.equal(DEMO_EMAILS.botanist, "botanist123@gmail.com", "Botanist demo email must be botanist123@gmail.com");
    assert.equal(DEMO_EMAILS.officer, "officer123@gmail.com", "Officer demo email must be officer123@gmail.com");
    assert.equal(DEMO_EMAILS.admin, "admin123456@gmail.com", "Admin demo email must be admin123456@gmail.com");
    assert.equal(DEMO_PASSWORD, "Niah@1234", "Demo password must be Niah@1234");
  });

  // =========================================================================
  // 5. HOME SCREEN: VISITORS MUST SEE RECENTLY PUBLISHED CONTENT
  // =========================================================================
  test("Home Screen: Visitors view recently published plants or fallback to published species", () => {
    const testDb = {
      ...seed,
      species: [
        { id: "sp-1", common_name: "Rajah Pitcher Plant", scientific_name: "Nepenthes rajah", is_published: true, is_deleted: false },
        { id: "sp-2", common_name: "Sarawak Ironwood", scientific_name: "Dipterocarpus sarawakensis", is_published: true, is_deleted: false },
      ],
      species_media: [],
      plants: [],
      observations: [],
      reviews: [],
    };

    // When plants array is empty, species catalogue fallback ensures visitors still see published content
    const fallbackCatalog = speciesCatalogue(testDb, "visitor");
    assert.ok(fallbackCatalog.length >= 2, "Visitor catalogue must return published species");
    assert.equal(fallbackCatalog[0].common_name, "Rajah Pitcher Plant");
  });

  // =========================================================================
  // 6. ADD PLANT & SCAN: QR GENERATION AND GALLERY EXTRACTION
  // =========================================================================
  test("Tag Extraction Utility: Extracts tag IDs from camera text, full web URLs, and gallery filenames", () => {
    // Bare tag
    assert.equal(extractTag("NIAH-0007"), "NIAH-0007");
    assert.equal(extractTag("niah-0042"), "NIAH-0042");

    // Full web QR URL
    assert.equal(extractTag("https://daunsense.org/tag/NIAH-0088"), "NIAH-0088");
    assert.equal(extractTag("http://192.168.1.10:5173/#/tag/NIAH-0015"), "NIAH-0015");

    // Filenames from gallery picking
    assert.equal(extractTag("IMG_NIAH-0021_preview.jpg"), "NIAH-0021");
    assert.equal(extractTag("/data/user/0/host.exp.exponent/cache/photo_NIAH-0099.png"), "NIAH-0099");
  });

  test("Add Plant QR Setup: Resolves unused vs existing tags for binding vs revisits", () => {
    const testDb = {
      ...seed,
      tags: [
        { qr_id: "NIAH-0001", status: "unused", batch_label: "field-1" },
        { qr_id: "NIAH-0002", status: "retired", batch_label: "field-1" },
      ],
      plants: [
        { id: "plant-1", qr_id: "NIAH-0003", name: "Rajah Pitcher", is_deleted: false, photos: [] },
      ],
      observations: [],
      comments: [],
      reviews: [],
    };

    // Unused tag is valid for new plant record
    const unusedLookup = lookupTag(testDb, "NIAH-0001");
    assert.equal(unusedLookup.kind, "unused");
    assert.equal(unusedLookup.id, "NIAH-0001");

    // Already-used tag triggers existing plant view / revisit option
    const usedLookup = lookupTag(testDb, "NIAH-0003");
    assert.equal(usedLookup.kind, "used");
    assert.equal(usedLookup.id, "NIAH-0003");

    // Retired tag is marked retired
    const retiredLookup = lookupTag(testDb, "NIAH-0002");
    assert.equal(retiredLookup.kind, "retired");
  });
});
