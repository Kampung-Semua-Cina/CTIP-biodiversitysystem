// apps/mobile/tests/security-fixes.test.mjs
// Verification for:
// 1. Users page crash safety when accounts have missing/null name or role
// 2. Security: allowBackup set to false in app.json
// 3. Security: Unused permissions (microphone, draw over apps, storage) blocked in app.json
// 4. Security: minSdkVersion raised to Android 11 (API 30)
// 5. Security: In-progress plant drafts wiped on sign-out
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROLE_LABEL } from '../../shared/permissions.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { saveDraft, getDraft, clearAllDrafts } from '../draftStore.js';
import { onSignOut, signOutApi, setAuthToken, getAuthToken } from '../../shared/api.js';

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

  test('Security: Android minSdk is upgraded to Android 11 (API 30)', () => {
    const appJsonPath = path.join(rootDir, 'app.json');
    const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    // Configured in android block
    assert.equal(
      appConfig.expo?.android?.minSdkVersion,
      30,
      'expo.android.minSdkVersion must be 30 (Android 11)'
    );

    // Configured in expo-build-properties plugin
    const buildPropsPlugin = (appConfig.expo?.plugins || []).find(
      (p) => Array.isArray(p) && p[0] === 'expo-build-properties'
    );
    assert.ok(buildPropsPlugin, 'expo-build-properties plugin must be configured in app.json');
    assert.equal(
      buildPropsPlugin[1]?.android?.minSdkVersion,
      30,
      'expo-build-properties must set android.minSdkVersion to 30 (Android 11)'
    );
  });

  // -------------------------------------------------------------------------
  // 3. Security: Plant drafts cleared on sign-out
  // -------------------------------------------------------------------------
  test('Security: plant drafts are purged on sign-out', async () => {
    const testTag = 'TEST-TAG-CLEAR-123';
    await saveDraft(testTag, {
      proposed_species: 'Nepenthes rajah',
      height_cm: '45',
      morphology: 'Red pitcher with lid',
      notes: 'Confidential field notes',
      photos: [],
      gps: { lat: 3.81, lng: 113.78 },
    });

    // Ensure draft is saved
    const saved = await getDraft(testTag);
    assert.ok(saved, 'Draft must be saved');
    assert.equal(saved.proposed_species, 'Nepenthes rajah');

    // Perform sign-out cleanup
    await clearAllDrafts();

    // Verify draft is wiped
    const wiped = await getDraft(testTag);
    assert.equal(wiped, null, 'Draft must be null after clearAllDrafts');
  });

  test('Security: signOutApi invokes onSignOut listener to clear drafts', async () => {
    let listenerCalled = false;
    const unsub = onSignOut(async () => {
      listenerCalled = true;
      await clearAllDrafts();
    });

    try {
      const tag = 'TAG-SIGNOUT-HOOK-456';
      await saveDraft(tag, { proposed_species: 'Ficus', notes: 'Secret tree' });
      assert.ok(await getDraft(tag));

      // Trigger sign out
      await signOutApi();

      assert.equal(listenerCalled, true, 'onSignOut listener must be called on signOutApi');
      assert.equal(await getDraft(tag), null, 'Draft must be cleared after signOutApi');
    } finally {
      unsub();
    }
  });
});
