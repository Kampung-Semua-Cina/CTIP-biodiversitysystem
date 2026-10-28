// apps/mobile/draftStore.js
// Crash-safe local draft persistence for in-progress plant observations (CTIP-57).
// Uses expo-sqlite on native devices, with graceful fallback to AsyncStorage / memory.

let sqliteDb = null;
const memoryStore = new Map();

async function getDb() {
  if (sqliteDb) return sqliteDb;
  try {
    const SQLite = await import('expo-sqlite');
    if (SQLite && typeof SQLite.openDatabaseSync === 'function') {
      sqliteDb = SQLite.openDatabaseSync('daun_drafts.db');
      sqliteDb.execSync(`
        CREATE TABLE IF NOT EXISTS drafts (
          qr_id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return sqliteDb;
    }
  } catch {
    // Native SQLite not available in this environment (e.g. Node test runner, Web)
  }
  return null;
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
