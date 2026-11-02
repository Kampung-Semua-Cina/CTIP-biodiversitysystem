// apps/mobile/tests/secure-storage.test.mjs
// Test suite for SecureStore session persistence and migration (CTIP-119)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSecureStorage } from '../secureStorage.js';
import { setStorageAdapter, setSession, restoreSession, getSession, signOutApi } from '../../shared/api.js';

describe('CTIP-119: SecureStore Session Persistence & AsyncStorage Migration', () => {
  test('saves and retrieves sessions using SecureStore adapter', async () => {
    const secureMock = new Map();
    const asyncMock = new Map();

    const mockSS = {
      getItemAsync: async (k) => secureMock.get(k) ?? null,
      setItemAsync: async (k, v) => secureMock.set(k, String(v)),
      deleteItemAsync: async (k) => secureMock.delete(k),
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    };
    const mockAsync = {
      getItem: async (k) => asyncMock.get(k) ?? null,
      setItem: async (k, v) => asyncMock.set(k, String(v)),
      removeItem: async (k) => asyncMock.delete(k),
    };

    const storage = createSecureStorage({
      getSecureStore: async () => mockSS,
      asyncStorage: mockAsync,
    });

    // Write a session
    const sessionData = JSON.stringify({ access_token: 'sec_tok_123', refresh_token: 'sec_ref_456' });
    await storage.setItem('daun_session', sessionData);

    // Should exist in SecureStore
    assert.equal(secureMock.get('daun_session'), sessionData);
    // Should NOT exist in AsyncStorage
    assert.equal(asyncMock.has('daun_session'), false);

    // Read back
    const retrieved = await storage.getItem('daun_session');
    assert.equal(retrieved, sessionData);

    // Remove item
    await storage.removeItem('daun_session');
    assert.equal(secureMock.has('daun_session'), false);
    assert.equal(await storage.getItem('daun_session'), null);
  });

  test('migrates existing legacy session from AsyncStorage to SecureStore and purges from AsyncStorage', async () => {
    const secureMock = new Map();
    const asyncMock = new Map();

    // Simulate an existing session left behind by previous AsyncStorage build
    const legacySession = JSON.stringify({
      access_token: 'legacy_access_token',
      refresh_token: 'legacy_refresh_token',
      expires_at: 1800000000,
      user: { id: 'u_legacy', email: 'botanist@sfc.my' },
    });
    asyncMock.set('daun_session', legacySession);

    const mockSS = {
      getItemAsync: async (k) => secureMock.get(k) ?? null,
      setItemAsync: async (k, v) => secureMock.set(k, String(v)),
      deleteItemAsync: async (k) => secureMock.delete(k),
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    };
    const mockAsync = {
      getItem: async (k) => asyncMock.get(k) ?? null,
      setItem: async (k, v) => asyncMock.set(k, String(v)),
      removeItem: async (k) => asyncMock.delete(k),
    };

    const storage = createSecureStorage({
      getSecureStore: async () => mockSS,
      asyncStorage: mockAsync,
    });

    // Initial read should trigger migration
    const session = await storage.getItem('daun_session');
    assert.equal(session, legacySession, 'Should successfully read the legacy session during migration');

    // After migration, it MUST be in SecureStore
    assert.equal(secureMock.get('daun_session'), legacySession, 'Migrated session must be stored in SecureStore');

    // And it MUST be deleted from unencrypted AsyncStorage
    assert.equal(asyncMock.has('daun_session'), false, 'Migrated session must be purged from AsyncStorage');

    // Subsequent reads come from SecureStore
    const secondRead = await storage.getItem('daun_session');
    assert.equal(secondRead, legacySession);
  });

  test('integrates with api.js setStorageAdapter and restoreSession', async () => {
    const secureMock = new Map();
    const asyncMock = new Map();

    const mockSS = {
      getItemAsync: async (k) => secureMock.get(k) ?? null,
      setItemAsync: async (k, v) => secureMock.set(k, String(v)),
      deleteItemAsync: async (k) => secureMock.delete(k),
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    };
    const mockAsync = {
      getItem: async (k) => asyncMock.get(k) ?? null,
      setItem: async (k, v) => asyncMock.set(k, String(v)),
      removeItem: async (k) => asyncMock.delete(k),
    };

    const storage = createSecureStorage({
      getSecureStore: async () => mockSS,
      asyncStorage: mockAsync,
    });

    setStorageAdapter(storage);

    const testSession = {
      access_token: 'live_test_token',
      refresh_token: 'live_test_refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'u_live', email: 'officer@sfc.my' },
    };

    setSession(testSession);
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(secureMock.has('daun_session'));

    // Clear in-memory session to simulate cold app launch
    setSession(null);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(getSession(), null);

    // Re-populate SecureStore mock to simulate saved session on device
    secureMock.set('daun_session', JSON.stringify(testSession));

    // restoreSession rehydrates from SecureStore
    const restored = await restoreSession();
    assert.deepEqual(restored, testSession);
    assert.equal(getSession()?.access_token, 'live_test_token');

    // Clean up
    setStorageAdapter(null);
    setSession(null);
  });
});
