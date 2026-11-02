// apps/mobile/secureStorage.js
// Secure session storage adapter for mobile (CTIP-119).
// Replaces unencrypted AsyncStorage with expo-secure-store (backed by Android Keystore / iOS Keychain).
// Automatically migrates existing sessions from AsyncStorage so users are not signed out by the update.
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export function createSecureStorage(options = {}) {
  const getSS = options.getSecureStore || getSecureStore;
  const asyncStorage = options.asyncStorage || AsyncStorage;

  return {
    async getItem(key) {
      const ss = await getSS();
      if (ss) {
        try {
          const val = await ss.getItemAsync(key);
          if (val != null) return val;
        } catch (err) {
          console.warn('[SecureStore getItem error]', err?.message || err);
        }

        // Migration check: did the user have a session saved in unencrypted AsyncStorage?
        try {
          const legacy = asyncStorage?.getItem ? await asyncStorage.getItem(key) : null;
          if (legacy != null) {
            try {
              await ss.setItemAsync(key, legacy, {
                keychainAccessible: ss.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
              });
              if (asyncStorage?.removeItem) await asyncStorage.removeItem(key);
            } catch (migrateErr) {
              console.warn('[SecureStore migration error]', migrateErr?.message || migrateErr);
            }
            return legacy;
          }
        } catch {
          // Ignore legacy read errors
        }
        return null;
      }

      // Fallback if SecureStore is not available
      return asyncStorage?.getItem ? asyncStorage.getItem(key) : null;
    },

    async setItem(key, value) {
      const ss = await getSS();
      if (ss) {
        try {
          await ss.setItemAsync(key, String(value), {
            keychainAccessible: ss.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
          // Remove legacy unencrypted copy if present
          if (asyncStorage?.removeItem) await asyncStorage.removeItem(key).catch(() => {});
          return;
        } catch (err) {
          console.warn('[SecureStore setItem error]', err?.message || err);
        }
      }
      return asyncStorage?.setItem ? asyncStorage.setItem(key, String(value)) : undefined;
    },

    async removeItem(key) {
      const ss = await getSS();
      if (ss) {
        try {
          await ss.deleteItemAsync(key);
        } catch (err) {
          console.warn('[SecureStore deleteItem error]', err?.message || err);
        }
      }
      return asyncStorage?.removeItem ? asyncStorage.removeItem(key).catch(() => {}) : undefined;
    },
  };
}

export const secureStorage = createSecureStorage();
export default secureStorage;
