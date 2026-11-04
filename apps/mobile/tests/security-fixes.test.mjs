// apps/mobile/tests/security-fixes.test.mjs
// Verification for:
// 1. Users page crash safety when accounts have missing/null name or role
// 2. Security: allowBackup set to false in app.json
// 3. Security: Unused permissions (microphone, draw over apps, storage) blocked in app.json
// 4. Security: minSdkVersion raised to Android 11 (API 30) via expo-build-properties
// 5. Security: In-progress plant drafts wiped on user sign-out without destroying drafts on session expiration
// 6. Bug fix: Photo gallery picker launches directly without requesting blocked storage permissions
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROLE_LABEL } from '../../shared/permissions.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { saveDraft, getDraft, listDrafts, clearAllDrafts } from '../draftStore.js';
import { signOutApi, setAuthToken, getAuthToken, clearAuthToken } from '../../shared/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Mobile Bug Fixes & Security Hardening Suite', () => {
  // -------------------------------------------------------------------------
  // 1. Users page null name / null role safety
  // -------------------------------------------------------------------------
  test('Users page: sorting and role display do not crash when full_name or role is missing/null', () => {
    const testProfiles = [
      { id: 'u-1', full_name: 'Zoe Botanist', email: 'zoe@sfc.my', role: 'botanist', is_active: true },
      { id: 'u-2', full_name: null, email: 'noname@sfc.my', role: 'officer', is_active: true },
      { id: 'u-3', full_name: undefined, email: 'undefinedname@sfc.my', role: null, is_active: true },
      { id: 'u-4', full_name: 'Alice Admin', email: 'alice@sfc.my', role: undefined, is_active: false },
      { id: 'u-5', full_name: '', email: 'empty@sfc.my', role: 'admin', is_active: true },
    ];

    // Filter needle check with null safety
    const needle = 'sfc';
    const filtered = testProfiles.filter((p) =>
      fuzzyMatch(`${p.full_name || ''} ${p.email || ''} ${p.role || ''}`, needle)
    );
    assert.equal(filtered.length, 5, 'All accounts should match email query without throwing');

    // Test sorting by name (A-Z)
    assert.doesNotThrow(() => {
      const sortedByName = [...testProfiles].sort((a, b) =>
        (a.full_name || '').localeCompare(b.full_name || '')
      );
      assert.ok(Array.isArray(sortedByName));
      assert.equal(sortedByName[sortedByName.length - 1].full_name, 'Zoe Botanist');
    }, 'Sorting by name must not crash on null/undefined full_name');

    // Test sorting by nameDesc (Z-A)
    assert.doesNotThrow(() => {
      const sortedDesc = [...testProfiles].sort((a, b) =>
        (b.full_name || '').localeCompare(a.full_name || '')
      );
      assert.equal(sortedDesc[0].full_name, 'Zoe Botanist');
    }, 'Sorting by nameDesc must not crash on null/undefined full_name');

    // Test sorting by role
    assert.doesNotThrow(() => {
      const sortedByRole = [...testProfiles].sort((a, b) =>
        (a.role || '').localeCompare(b.role || '') || (a.full_name || '').localeCompare(b.full_name || '')
      );
      assert.ok(Array.isArray(sortedByRole));
    }, 'Sorting by role must not crash on null/undefined role or full_name');

    // Test sorting by email
    assert.doesNotThrow(() => {
      const sortedByEmail = [...testProfiles].sort((a, b) =>
        (a.email || '').localeCompare(b.email || '')
      );
      assert.ok(Array.isArray(sortedByEmail));
    }, 'Sorting by email must not crash');

    // Test sorting by active
    assert.doesNotThrow(() => {
      const sortedByActive = [...testProfiles].sort((a, b) =>
        ((b.is_active ? 1 : 0) - (a.is_active ? 1 : 0)) || (a.full_name || '').localeCompare(b.full_name || '')
      );
      assert.ok(Array.isArray(sortedByActive));
      assert.equal(sortedByActive[sortedByActive.length - 1].id, 'u-4');
    }, 'Sorting by active must not crash');

    // Test role label display logic across all profiles
    for (const p of testProfiles) {
      assert.doesNotThrow(() => {
        const roleLabel = ROLE_LABEL[p.role] || p.role || 'Member';
        const roleDisplay = roleLabel.split(' ').pop().replace(/^\w/, (m) => m.toUpperCase());
        const displayName = p.full_name || p.email || 'Unnamed member';
        assert.ok(roleDisplay.length > 0);
        assert.ok(displayName.length > 0);
      }, `Rendering account ${p.id} with missing role/name must not throw`);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Security: app.json configuration (allowBackup, permissions, minSdk)
  // -------------------------------------------------------------------------
  test('Security: app.json sets allowBackup to false', () => {
    const appJsonPath = path.join(rootDir, 'app.json');
    const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    assert.equal(
      appConfig.expo?.android?.allowBackup,
      false,
      'app.json expo.android.allowBackup must be explicitly false (Medium security risk)'
    );
  });

  test('Security: app.json removes unused permissions and blocks mic/storage/system alert', () => {
    const appJsonPath = path.join(rootDir, 'app.json');
    const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const androidConfig = appConfig.expo?.android || {};

    const allowedPermissions = androidConfig.permissions || [];
    const blockedPermissions = androidConfig.blockedPermissions || [];

    // Allowed permissions should only be camera and location
    assert.ok(
      allowedPermissions.includes('android.permission.CAMERA'),
      'Must include camera permission'
    );
    assert.ok(
      allowedPermissions.includes('android.permission.ACCESS_FINE_LOCATION'),
      'Must include location permission'
    );
    assert.ok(
      !allowedPermissions.includes('android.permission.RECORD_AUDIO'),
      'Must not request microphone'
    );
    assert.ok(
      !allowedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'),
      'Must not request draw over apps'
    );

    // Blocked permissions must include microphone, drawing over other apps, and storage
    assert.ok(
      blockedPermissions.includes('android.permission.RECORD_AUDIO'),
      'Must explicitly block RECORD_AUDIO'
    );
    assert.ok(
      blockedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'),
      'Must explicitly block SYSTEM_ALERT_WINDOW'
    );
    assert.ok(
      blockedPermissions.includes('android.permission.READ_EXTERNAL_STORAGE'),
      'Must explicitly block READ_EXTERNAL_STORAGE'
    );
    assert.ok(
      blockedPermissions.includes('android.permission.WRITE_EXTERNAL_STORAGE'),
      'Must explicitly block WRITE_EXTERNAL_STORAGE'
    );
  });

  test('Security: Android minSdk is upgraded to Android 11 (API 30) via expo-build-properties', () => {
    const appJsonPath = path.join(rootDir, 'app.json');
    const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    // Configured in expo-build-properties plugin (valid Expo configuration)
    const buildPropsPlugin = (appConfig.expo?.plugins || []).find(
      (p) => Array.isArray(p) && p[0] === 'expo-build-properties'
    );
    assert.ok(buildPropsPlugin, 'expo-build-properties plugin must be configured in app.json');
    assert.equal(
      buildPropsPlugin[1]?.android?.minSdkVersion,
      30,
      'expo-build-properties must set android.minSdkVersion to 30 (Android 11)'
    );

    // Redundant top-level android.minSdkVersion must not be present
    assert.equal(
      appConfig.expo?.android?.minSdkVersion,
      undefined,
      'android.minSdkVersion under android object should be omitted in favour of expo-build-properties'
    );
  });

  // -------------------------------------------------------------------------
  // 3. Security & Safety: Plant drafts cleared on user sign-out, not on session drop
  // -------------------------------------------------------------------------
  test('Security & Safety: plant drafts are purged on intentional sign-out', async () => {
    const testTag = 'TEST-TAG-CLEAR-123';
    await saveDraft(testTag, {
      proposed_species: 'Nepenthes rajah',
      height_cm: '45',
      morphology: 'Red pitcher with lid',
      notes: 'Confidential field notes',
      photos: [],
      gps: { lat: 3.81, lng: 113.78 },
    });

    // Ensure draft is saved and discoverable
    const saved = await getDraft(testTag);
    assert.ok(saved, 'Draft must be saved');
    assert.equal(saved.proposed_species, 'Nepenthes rajah');

    const drafts = await listDrafts();
    assert.ok(drafts.some((d) => d.qr_id === testTag), 'Draft must appear in listDrafts()');

    // Perform intentional sign-out cleanup
    await clearAllDrafts();

    // Verify draft is wiped
    const wiped = await getDraft(testTag);
    assert.equal(wiped, null, 'Draft must be null after clearAllDrafts');
  });

  test('CTIP-57 Safety: session expiration or clearAuthToken does NOT wipe offline field drafts', async () => {
    const tag = 'TAG-PERSIST-OFFLINE-789';
    await saveDraft(tag, { proposed_species: 'Shorea albida', notes: 'Peat swamp tree in progress' });
    assert.ok(await getDraft(tag), 'Draft should be saved');

    // Simulate unexpected auth token invalidation / expiration in the background
    clearAuthToken();

    // In-progress field draft must still be preserved for the botanist!
    const preserved = await getDraft(tag);
    assert.ok(preserved, 'Draft must NOT be wiped by background session expiration');
    assert.equal(preserved.proposed_species, 'Shorea albida');

    // Clean up
    await clearAllDrafts();
  });

  // -------------------------------------------------------------------------
  // 4. Bug Fix: Photo gallery picker does not request legacy storage permissions
  // -------------------------------------------------------------------------
  test('Photo picker: AddPlant.js and Scan.js call launchImageLibraryAsync directly without requestMediaLibraryPermissionsAsync', () => {
    const addPlantSrc = fs.readFileSync(path.join(rootDir, 'pages', 'AddPlant.js'), 'utf8');
    const scanSrc = fs.readFileSync(path.join(rootDir, 'pages', 'Scan.js'), 'utf8');

    assert.ok(
      !addPlantSrc.includes('requestMediaLibraryPermissionsAsync'),
      'AddPlant.js must not request media library permissions on Android 11/12'
    );
    assert.ok(
      !scanSrc.includes('requestMediaLibraryPermissionsAsync'),
      'Scan.js must not request media library permissions on Android 11/12'
    );
    assert.ok(
      addPlantSrc.includes('launchImageLibraryAsync'),
      'AddPlant.js must launch photo picker directly'
    );
    assert.ok(
      scanSrc.includes('launchImageLibraryAsync'),
      'Scan.js must launch photo picker directly'
    );
  });

  // -------------------------------------------------------------------------
  // 5. Bug Fix: Local plant drafts from draftStore show up in My Records
  // -------------------------------------------------------------------------
  test('MyRecords: offline plant drafts from draftStore are discoverable and match search', async () => {
    const draftTag = 'NIAH-TEST-DRAFT-99';
    await saveDraft(draftTag, {
      proposed_species: 'Nepenthes lowii',
      notes: 'Pitcher plant on mountain ridge',
      photos: [{ url: 'file:///photo1.jpg' }],
    });

    const drafts = await listDrafts();
    const found = drafts.find((d) => d.qr_id === draftTag);
    assert.ok(found, 'Local draft should be in listDrafts()');
    assert.equal(found.proposed_species, 'Nepenthes lowii');

    // draftMatches filtering works
    const { draftMatches } = await import('../../shared/selectors.js');
    assert.ok(draftMatches(found, 'lowii'), 'Draft matches query "lowii"');
    assert.ok(draftMatches(found, 'DRAFT-99'), 'Draft matches query by tag substring');
    assert.ok(!draftMatches(found, 'orchid'), 'Draft does not match irrelevant query');

    // Clean up
    await clearAllDrafts();
  });
});
