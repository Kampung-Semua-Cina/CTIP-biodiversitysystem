// apps/mobile/secureStorage.js
// Secure session storage adapter for mobile (CTIP-119).
// Replaces unencrypted AsyncStorage with expo-secure-store (backed by Android Keystore / iOS Keychain).
// Fails closed: if SecureStore is unavailable or throws, the session is never saved to unencrypted storage.
// Automatically migrates existing sessions from AsyncStorage so users are not signed out by the update.

let secureStorePromise = null;

async function getSecureStore() {
  if (secureStorePromise) return secureStorePromise;
  secureStorePromise = (async () => {
    try {
      const mod = await import('expo-secure-store');
      const isAvail = typeof mod.isAvailableAsync === 'function' ? await mod.isAvailableAsync() : true;
      if (isAvail && mod.getItemAsync) {
        return mod;
      }
    } catch {
      // Outside native runtime or expo-secure-store not available
    }
    return null;
  })();
  return secureStorePromise;
}

let asyncStoragePromise = null;

async function getAsyncStorage() {
  if (asyncStoragePromise) return asyncStoragePromise;
  asyncStoragePromise = (async () => {
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      return mod.default || mod;
    } catch {
      return null;
    }
  })();
  return asyncStoragePromise;
}

export function createSecureStorage(options = {}) {
  const getSS = options.getSecureStore || getSecureStore;
  const getLegacyStorage = options.asyncStorage
    ? (async () => options.asyncStorage)
    : (options.getAsyncStorage || getAsyncStorage);

  return {
    async getItem(key) {
      const ss = await getSS();
      if (!ss) {
        // Fail closed: do not read or fall back to unencrypted storage
        return null;
      }

      try {
        const val = await ss.getItemAsync(key);
        // An empty string represents an invalidated/deleted session
        if (val != null && val !== '') return val;
      } catch (err) {
        console.warn('[SecureStore getItem error]', err?.message || err);
      }

      // One-time migration check: did the user have a session saved in unencrypted AsyncStorage?
      try {
        const legacyStorage = await getLegacyStorage();
        const legacy = legacyStorage?.getItem ? await legacyStorage.getItem(key) : null;
        if (legacy != null && legacy !== '') {
          try {
            await ss.setItemAsync(key, legacy, {
              keychainAccessible: ss.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            });
            if (legacyStorage?.removeItem) await legacyStorage.removeItem(key);
            return legacy;
          } catch (migrateErr) {
            console.warn('[SecureStore migration error]', migrateErr?.message || migrateErr);
            // Purge plaintext session even if SecureStore setItemAsync threw so credentials are not left unencrypted
            try {
              if (legacyStorage?.removeItem) await legacyStorage.removeItem(key);
            } catch {}
            // Fail closed: do not return legacy plaintext token if it could not be securely saved
            return null;
          }
        }
      } catch {
        // Ignore legacy read errors
      }
      return null;
    },

    async setItem(key, value) {
      const ss = await getSS();
      if (!ss) {
        // Fail closed (CTIP-119): never save session tokens to unencrypted AsyncStorage
        console.warn('[SecureStore] Storage unavailable; failing closed without persisting session');
        return;
      }

      try {
        await ss.setItemAsync(key, String(value), {
          keychainAccessible: ss.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch (err) {
        console.warn('[SecureStore setItem error]', err?.message || err);
        // Fail closed: do not write to unencrypted storage
        throw err;
      }

      // Remove legacy unencrypted copy if present from earlier app versions
      try {
        const legacyStorage = await getLegacyStorage();
        if (legacyStorage?.removeItem) await legacyStorage.removeItem(key).catch(() => {});
      } catch {}
    },

    async removeItem(key) {
      const ss = await getSS();
      if (!ss) {
        // Also clean up legacy storage if any exists
        try {
          const legacyStorage = await getLegacyStorage();
          if (legacyStorage?.removeItem) await legacyStorage.removeItem(key).catch(() => {});
        } catch {}
        // Don't report sign-out as complete unless the stored session was invalidated.
        // Surface the failure so callers know the keystore wasn't cleared.
        throw new Error('[SecureStore] Storage unavailable; failed to securely invalidate session on device.');
      }

      let deleted = false;
      // Retry deleteItemAsync up to 3 times to prevent leaving session on shared device
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await ss.deleteItemAsync(key);
          deleted = true;
          break;
        } catch (err) {
          if (attempt === 2) {
            console.warn('[SecureStore deleteItem error after retries]', err?.message || err);
          }
        }
      }
      // If deleteItemAsync failed, overwrite with empty value so restoreSession cannot resurrect it
      if (!deleted) {
        try {
          await ss.setItemAsync(key, '', {
            keychainAccessible: ss.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
        } catch (overwriteErr) {
          console.error('[SecureStore failed to delete and overwrite session]', overwriteErr);
          throw overwriteErr;
        }
      }

      // Also clean up legacy storage if any exists
      try {
        const legacyStorage = await getLegacyStorage();
        if (legacyStorage?.removeItem) await legacyStorage.removeItem(key).catch(() => {});
      } catch {}
    },
  };
}

export const secureStorage = createSecureStorage();
export default secureStorage;
