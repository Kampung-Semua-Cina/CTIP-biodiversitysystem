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

  test('fails closed: does NOT write to unencrypted AsyncStorage if SecureStore is unavailable or throws', async () => {
    const asyncMock = new Map();
    const mockAsync = {
      getItem: async (k) => asyncMock.get(k) ?? null,
      setItem: async (k, v) => asyncMock.set(k, String(v)),
      removeItem: async (k) => asyncMock.delete(k),
    };

    // Case A: SecureStore is completely unavailable
    const unavailableStorage = createSecureStorage({
      getSecureStore: async () => null,
      asyncStorage: mockAsync,
    });
    await unavailableStorage.setItem('daun_session', JSON.stringify({ token: 'fail_closed_1' }));
    assert.equal(asyncMock.has('daun_session'), false, 'Must NOT write unencrypted session when SecureStore unavailable');
    assert.equal(await unavailableStorage.getItem('daun_session'), null, 'Must fail closed on read');

    // Case B: SecureStore setItemAsync throws an error
    const throwingStorage = createSecureStorage({
      getSecureStore: async () => ({
        setItemAsync: async () => { throw new Error('Keystore locked / hardware fault'); },
        getItemAsync: async () => null,
        deleteItemAsync: async () => {},
        WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      }),
      asyncStorage: mockAsync,
    });
    await assert.rejects(
      () => throwingStorage.setItem('daun_session', JSON.stringify({ token: 'fail_closed_2' })),
      /Keystore locked/,
      'Must rethrow or refuse write instead of silently falling back to unencrypted storage'
    );
    assert.equal(asyncMock.has('daun_session'), false, 'Must NOT fall back to AsyncStorage when setItemAsync throws');
  });

  test('sign-out: retries deleteItemAsync and overwrites session if delete fails so restoreSession cannot resurrect it', async () => {
    let deleteAttempts = 0;
    const secureMock = new Map([['daun_session', JSON.stringify({ access_token: 'secret_token' })]]);

    const throwingSS = {
      getItemAsync: async (k) => secureMock.get(k) ?? null,
      setItemAsync: async (k, v) => { secureMock.set(k, String(v)); },
      deleteItemAsync: async () => {
        deleteAttempts++;
        throw new Error('Keystore delete failure');
      },
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    };

    const storage = createSecureStorage({
      getSecureStore: async () => throwingSS,
      asyncStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
    });

    // Attempt remove - delete throws all 3 times, so it falls back to overwriting with empty string
    await storage.removeItem('daun_session');
    assert.equal(deleteAttempts, 3, 'Must retry deleteItemAsync 3 times before fallback overwrite');
    assert.equal(secureMock.get('daun_session'), '', 'Must overwrite session with empty string so restoreSession cannot read old token');
    assert.equal(await storage.getItem('daun_session'), null, 'Empty string must return null on getItem');
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
