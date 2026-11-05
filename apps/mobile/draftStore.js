// apps/mobile/draftStore.js
// Crash-safe local draft persistence for in-progress plant observations (CTIP-57).
// Uses expo-sqlite on native devices, with graceful fallback to AsyncStorage / memory.
// The SQLite file is encrypted with SQLCipher (CTIP-107, docs/security/encryption.md
// "Mobile SQLite"): useSQLCipher is on in app.json, and the key is 32 random bytes
// made on the phone and kept in expo-secure-store, never in code.

const DB_NAME = 'daun_drafts_secure.db';
// Drafts saved before CTIP-107 live in this plain file; they are copied into the
// encrypted one on first open and the plain file is deleted.
const OLD_DB_NAME = 'daun_drafts.db';
const KEY_NAME = 'daun_drafts_db_key';

let dbPromise = null;
const memoryStore = new Map();

async function getDbKey() {
  const SecureStore = await import('expo-secure-store');
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key || !/^[0-9a-f]{64}$/.test(key)) {
    const { getRandomBytes } = await import('expo-crypto');
    key = Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return key;
}

function moveOldDrafts(SQLite, db) {
  try {
    const old = SQLite.openDatabaseSync(OLD_DB_NAME);
    const hasTable = old.getFirstSync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts';"
    );
    const rows = hasTable ? old.getAllSync('SELECT qr_id, data, updated_at FROM drafts;') : [];
    old.closeSync();
    for (const r of rows) {
      db.runSync(
        'INSERT OR IGNORE INTO drafts (qr_id, data, updated_at) VALUES (?, ?, ?);',
        [r.qr_id, r.data, r.updated_at]
      );
    }
    SQLite.deleteDatabaseSync(OLD_DB_NAME);
  } catch {
    // No old file, or it could not be read: nothing to move.
  }
}

async function openDb() {
  try {
    const SQLite = await import('expo-sqlite');
    if (SQLite && typeof SQLite.openDatabaseSync === 'function') {
      const key = await getDbKey();
      const db = SQLite.openDatabaseSync(DB_NAME);
      // Raw 256-bit key (x'..'), so SQLCipher skips its slow password derivation.
      db.execSync(`PRAGMA key = "x'${key}'";`);
      db.execSync(`
        CREATE TABLE IF NOT EXISTS drafts (
          qr_id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      if (!db.getFirstSync('PRAGMA cipher_version;')) {
        // Expo Go has no SQLCipher, so the file there is not encrypted.
        console.warn('[DraftStore] SQLCipher is not active; drafts are not encrypted in this build');
      }
      moveOldDrafts(SQLite, db);
      return db;
    }
  } catch {
    // Native SQLite not available in this environment (e.g. Node test runner, Web)
  }
  return null;
}

function getDb() {
  dbPromise ??= openDb();
  return dbPromise;
}

async function getAsyncStorage() {
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default || mod;
  } catch {
    return null;
  }
}

const STORAGE_PREFIX = 'daun_draft_';

/**
 * Save an in-progress plant observation draft.
 * Holds taxonomy, morphology, height, notes, photos, GPS and QR tag ID.
 */
export async function saveDraft(qr_id, draft) {
  if (!qr_id) return false;
  const payload = {
    qr_id,
    user_id: draft.user_id || null, // who started it, so My Records shows people only their own drafts
    proposed_species: draft.proposed_species || draft.sp || '',
    morphology: draft.morphology || draft.looks || '',
    height_cm: draft.height_cm || draft.height || '',
    notes: draft.notes || '',
    photos: draft.photos || [],
    gps: draft.gps || null,
    updated_at: new Date().toISOString(),
  };
  const json = JSON.stringify(payload);

  try {
    const db = await getDb();
    if (db) {
      db.runSync(
        'INSERT OR REPLACE INTO drafts (qr_id, data, updated_at) VALUES (?, ?, ?);',
        [qr_id, json, payload.updated_at]
      );
      return true;
    }
  } catch (err) {
    console.warn('[DraftStore SQLite Error]', err?.message || err);
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.setItem === 'function') {
      await storage.setItem(`${STORAGE_PREFIX}${qr_id}`, json);
      return true;
    }
  } catch {
    // fallback to memory
  }

  memoryStore.set(qr_id, payload);
  return true;
}

/**
 * Retrieve a saved draft for a specific QR tag.
 */
export async function getDraft(qr_id) {
  if (!qr_id) return null;

  try {
    const db = await getDb();
    if (db) {
      const row = db.getFirstSync('SELECT data FROM drafts WHERE qr_id = ?;', [qr_id]);
      if (row && row.data) {
        return JSON.parse(row.data);
      }
    }
  } catch (err) {
    console.warn('[DraftStore SQLite Read Error]', err?.message || err);
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.getItem === 'function') {
      const raw = await storage.getItem(`${STORAGE_PREFIX}${qr_id}`);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // fallback to memory
  }

  return memoryStore.get(qr_id) || null;
}

/**
 * Delete a draft after successful submission or intentional discard.
 */
export async function clearDraft(qr_id) {
  if (!qr_id) return false;

  try {
    const db = await getDb();
    if (db) {
      db.runSync('DELETE FROM drafts WHERE qr_id = ?;', [qr_id]);
    }
  } catch (err) {
    console.warn('[DraftStore SQLite Delete Error]', err?.message || err);
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.removeItem === 'function') {
      await storage.removeItem(`${STORAGE_PREFIX}${qr_id}`);
    }
  } catch {
    // fallback
  }

  memoryStore.delete(qr_id);
  return true;
}

/**
 * List all saved drafts currently stored locally.
 */
export async function listDrafts() {
  try {
    const db = await getDb();
    if (db) {
      const rows = db.getAllSync('SELECT qr_id, data, updated_at FROM drafts ORDER BY updated_at DESC;');
      return (rows || []).map((r) => {
        try {
          return JSON.parse(r.data);
        } catch {
          return { qr_id: r.qr_id, updated_at: r.updated_at };
        }
      });
    }
  } catch {
    // fallback
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.getAllKeys === 'function') {
      const keys = await storage.getAllKeys();
      const draftKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
      const pairs = await storage.multiGet(draftKeys);
      return pairs
        .map(([, val]) => {
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
  } catch {
    // fallback
  }

  return Array.from(memoryStore.values());
}

/**
 * The drafts one user started on this device. Drafts are kept per tag, and a phone
 * can be shared, so My Records must not list (and let someone send) another
 * person's draft. Drafts saved before user_id was added have no owner and are
 * left out; they still open when their tag is scanned.
 */
export async function listDraftsFor(userId) {
  if (!userId) return [];
  return (await listDrafts()).filter((d) => d.user_id === userId);
}

/**
 * Clear all drafts from the encrypted SQLite database, AsyncStorage, and memory.
 * Invoked on sign-out so in-progress plant drafts do not remain on shared devices.
 */
export async function clearAllDrafts() {
  try {
    const db = await getDb();
    if (db) {
      db.runSync('DELETE FROM drafts;');
    }
  } catch (err) {
    console.warn('[DraftStore SQLite ClearAll Error]', err?.message || err);
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.getAllKeys === 'function') {
      const keys = await storage.getAllKeys();
      const draftKeys = (keys || []).filter((k) => k.startsWith(STORAGE_PREFIX));
      if (draftKeys.length > 0 && typeof storage.multiRemove === 'function') {
        await storage.multiRemove(draftKeys);
      }
    }
  } catch {
    // fallback
  }

  memoryStore.clear();
  return true;
}
