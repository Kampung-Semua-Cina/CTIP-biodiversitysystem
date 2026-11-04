// apps/shared/api.js
// Client interface to the Daun Sense REST API (services/api).
// Works in both browser (Vite) and React Native (Expo/Metro).
import { decodeBase64ToArrayBuffer } from "./utils.js";

let inMemorySession = null;
let customBaseUrl = null;
let customStorage = null;

export function setStorageAdapter(adapter) {
  customStorage = adapter;
}

export function getStorageAdapter() {
  return customStorage;
}

const signOutListeners = new Set();

export function onSignOut(callback) {
  if (typeof callback === "function") {
    signOutListeners.add(callback);
    return () => signOutListeners.delete(callback);
  }
  return () => {};
}

function triggerSignOutListeners() {
  for (const listener of signOutListeners) {
    try {
      Promise.resolve(listener()).catch((err) => console.warn("[signOut listener error]", err));
    } catch (err) {
      console.warn("[signOut listener error]", err);
    }
  }
}

// Storage accessor that safely works in browser and falls back in non-browser environments
const storage = {
  get(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // ignore security / storage restrictions
    }
    return null;
  },
  set(key, val) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, val);
      }
    } catch {
      // ignore
    }
  },
  remove(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  },
};

// The signed-in session (CTIP-114): { access_token, refresh_token, expires_at, user }.
// It comes from POST /v1/auth/sign-in and is renewed through POST /v1/auth/refresh;
// the apps never call Supabase Auth themselves. Kept in localStorage on the web
// (so a reload stays signed in) and in memory on the phone.
const SESSION_KEY = "daun_session";
const OLD_TOKEN_KEY = "daun_access_token"; // before CTIP-114: a bare access token

export function getSession() {
  if (inMemorySession) return inMemorySession;
  try {
    const saved = storage.get(SESSION_KEY);
    inMemorySession = saved ? JSON.parse(saved) : null;
  } catch {
    inMemorySession = null;
  }
  if (!inMemorySession) {
    const old = storage.get(OLD_TOKEN_KEY);
    if (old) inMemorySession = { access_token: old };
  }
  return inMemorySession;
}

export function setSession(session) {
  inMemorySession = session?.access_token ? session : null;
  storage.remove(OLD_TOKEN_KEY);
  if (inMemorySession) {
    storage.set(SESSION_KEY, JSON.stringify(inMemorySession));
    if (customStorage?.setItem) {
      Promise.resolve(customStorage.setItem(SESSION_KEY, JSON.stringify(inMemorySession))).catch(() => {});
    }
  } else {
    storage.remove(SESSION_KEY);
    if (customStorage?.removeItem) {
      Promise.resolve(customStorage.removeItem(SESSION_KEY)).catch(() => {});
    }
  }
}

export async function restoreSession() {
  if (inMemorySession) return inMemorySession;
  try {
    if (customStorage?.getItem) {
      const saved = await customStorage.getItem(SESSION_KEY);
      if (saved && !inMemorySession) {
        inMemorySession = JSON.parse(saved);
      }
    }
  } catch {
    inMemorySession = null;
  }
  return getSession();
}

export function getAuthToken() {
  return getSession()?.access_token || null;
}

// A bare access token (the "Sign in with API token" form): no refresh token, so
// it simply stops working when it expires.
export function setAuthToken(token) {
  setSession(token ? { access_token: token } : null);
}

export function clearAuthToken() {
  setSession(null);
  for (const listener of signOutListeners) {
    try {
      Promise.resolve(listener()).catch((err) => console.warn("[signOut listener error]", err));
    } catch (err) {
      console.warn("[signOut listener error]", err);
    }
  }
}

// What the access token says about itself (exp, sub, email). Not checked here:
// the API checks every token it is sent.
export function tokenClaims(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return typeof atob === "function" ? JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))) : null;
  } catch {
    return null;
  }
}

// The session saved by another tab, when it differs from this tab's: adopted and returned.
function sessionFromOtherTab() {
  try {
    const saved = JSON.parse(storage.get(SESSION_KEY) || "null");
    if (!saved?.access_token || saved.access_token === inMemorySession?.access_token) return null;
    inMemorySession = saved;
    return saved;
  } catch {
    return null;
  }
}

const expiresAt = (session) => session?.expires_at || tokenClaims(session?.access_token)?.exp || null;

// Called when a refresh is refused, so the app can show the signed-out state.
const endedListeners = new Set();
export function onSessionEnded(fn) {
  endedListeners.add(fn);
  return () => endedListeners.delete(fn);
}

const REFRESH_MARGIN_S = 60;
let refreshing = null; // one refresh at a time: each refresh token works once

/**
 * The access token to send, renewed through POST /v1/auth/refresh when it
 * expires within a minute. Returns null when the session has ended (the stored
 * session is then cleared). If the API cannot be reached, returns the old token.
 * `force` renews even when the token looks fresh: the API has just said it expired.
 */
export async function freshAuthToken({ force = false } = {}) {
  if (!inMemorySession && customStorage?.getItem) {
    await restoreSession();
  }
  // Another tab may have renewed the session. Each refresh token works once, so
  // refreshing with this tab's old copy would be refused and sign everyone out.
  const renewedElsewhere = sessionFromOtherTab();
  const session = getSession();
  if (!session?.access_token) return null;
  if (force && renewedElsewhere) return session.access_token;
  const exp = expiresAt(session);
  if (!force && (!exp || exp - Date.now() / 1000 > REFRESH_MARGIN_S)) return session.access_token;
  if (!session.refresh_token) return session.access_token; // a pasted token: nothing to renew with
  refreshing ??= (async () => {
    const res = await apiFetch("/auth/refresh", { method: "POST", token: null, body: { refresh_token: session.refresh_token } });
    if (res.ok && res.data?.access_token) {
      setSession(res.data);
      return res.data.access_token;
    }
    if (res.status === 401) {
      // Lost the race with another tab: its new session is still good.
      if (sessionFromOtherTab()) return getSession().access_token;
      setSession(null);
  for (const listener of signOutListeners) {
    try {
      Promise.resolve(listener()).catch((err) => console.warn("[signOut listener error]", err));
    } catch (err) {
      console.warn("[signOut listener error]", err);
    }
  }
      endedListeners.forEach((fn) => fn());
      return null;
    }
    return session.access_token;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export function setApiBaseUrl(url) {
  customBaseUrl = url ? url.replace(/\/+$/, "") : null;
}

export function getApiBaseUrl() {
  if (customBaseUrl) return customBaseUrl.endsWith("/v1") ? customBaseUrl : customBaseUrl + "/v1";

  // Check if we are running in React Native / Expo environment.
  // In React Native, `document` is undefined, whereas in web browser `document` is defined.
  const isRN =
    (typeof navigator !== "undefined" && (navigator.product === "ReactNative" || /ReactNative/i.test(navigator.userAgent || ""))) ||
    (typeof document === "undefined" && typeof window !== "undefined") ||
    (typeof globalThis !== "undefined" && Boolean(globalThis.Expo || globalThis.HermesInternal || globalThis.__fbBatchedBridge || globalThis.nativeCallSyncHook));

  if (isRN) {
    const fromEnv = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;
    return fromEnv ? fromEnv.replace(/\/+$/, "") + "/v1" : "https://ctip-biodiversitysystem.onrender.com/v1";
  }

  // Browser environment: use Vite proxy path or environment variable
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
        return import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/v1";
      }
    } catch {
      // ignore
    }
    // Default to /v1 in web browser (proxied by Vite to https://ctip-biodiversitysystem.onrender.com/v1)
    return "/v1";
  }

  // Default to Render API for node / mobile
  return "https://ctip-biodiversitysystem.onrender.com/v1";
}

/**
 * Universal API fetch wrapper with JSON serialization and standard error normalization.
 */
export async function apiFetch(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}${cleanPath}`;

  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  // token: null sends none (signing in); left out, the stored one is sent.
  const token = options.token === null ? null : options.token || getAuthToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body = options.body;
  const isFormData = (typeof FormData !== "undefined" && body instanceof FormData) || (body && typeof body.append === "function");
  if (body && typeof body === "object" && !isFormData) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  const timeoutMs = options.timeout ?? 30000;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      body,
      signal: controller ? controller.signal : options.signal,
    });

    if (timer) clearTimeout(timer);

    let json = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    }

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        data: json?.data !== undefined ? json.data : json,
        raw: json,
      };
    }

    // 502/504 without our JSON envelope: the Vite dev proxy answered because
    // the API itself is not running. Treat it like a network failure.
    if (!json && (res.status === 502 || res.status === 504)) {
      return { ok: false, offline: true, status: res.status, code: "API_UNREACHABLE", message: "Cannot reach the API server" };
    }

    // Backend returned an error envelope (e.g. { code, message, details })
    return {
      ok: false,
      status: res.status,
      code: json?.code || `HTTP_${res.status}`,
      message: json?.message || res.statusText || "Request failed",
      details: json?.details || null,
      raw: json,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    const isAbort = err?.name === "AbortError";
    return {
      ok: false,
      offline: true,
      status: 0,
      code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
      message: isAbort ? "API request timed out" : (err?.message || "Cannot reach API server"),
    };
  }
}

// -----------------------------------------------------------------------------
// Implemented backend endpoints
// -----------------------------------------------------------------------------

/**
 * Public species catalogue: GET /v1/public/species
 * Returns array of published species ({ id, scientific_name, common_name, family, conservation_status })
 */
export async function fetchPublicSpecies() {
  return apiFetch("/public/species");
}

/**
 * Public single species details: GET /v1/public/species/:id
 * Implemented on backend ticket CTIP-89.
 */
export async function fetchPublicSpeciesById(id) {
  return apiFetch(`/public/species/${encodeURIComponent(id)}`);
}

/**
 * The plant on a scanned QR tag, for visitors: GET /v1/public/tags/:qrId (CTIP-33).
 * { qr_id, lat, lng, location_reduced, species }. 404 when the tag has no published plant.
 */
export async function fetchPublicPlantByTag(qrId) {
  return apiFetch(`/public/tags/${encodeURIComponent(qrId)}`, { token: null });
}

// -----------------------------------------------------------------------------
// Signing in and passwords (CTIP-114). The API calls Supabase Auth for the apps.
// -----------------------------------------------------------------------------

/** POST /v1/auth/sign-in. On success the session is stored and returned. */
export async function signInApi(email, password) {
  const res = await apiFetch("/auth/sign-in", { method: "POST", token: null, body: { email, password } });
  if (res.ok) setSession(res.data);
  return res;
}


/** POST /v1/auth/sign-out with the current token, then forgets the session. Never fails. */
export async function signOutApi() {
  const token = getAuthToken();
  setSession(null);
  for (const listener of signOutListeners) {
    try {
      Promise.resolve(listener()).catch((err) => console.warn("[signOut listener error]", err));
    } catch (err) {
      console.warn("[signOut listener error]", err);
    }
  }
  if (token) await apiFetch("/auth/sign-out", { method: "POST", token, timeout: 4000 });
}

/** POST /v1/auth/password-reset: emails a link that opens the website signed in. */
export const passwordResetApi = (email) => apiFetch("/auth/password-reset", { method: "POST", token: null, body: { email } });

/** POST /v1/me/password. Leave current_password out only after a reset link. */
export const changePasswordApi = (body, { token } = {}) => apiFetch("/me/password", { method: "POST", token, body });

/**
 * A password-reset link opens the website at
 * `#access_token=…&refresh_token=…&expires_at=…&type=recovery`. Reads that
 * session from the address, stores it, and returns its type ("recovery"),
 * "expired" for a link Supabase refused, or null when the address holds
 * neither. The caller then replaces the address. Web only.
 */
export function takeSessionFromUrl() {
  const hash = typeof window !== "undefined" ? window.location?.hash || "" : "";
  if (!/[#&/](access_token|error_code)=/.test(hash)) return null;
  const params = new URLSearchParams(hash.replace(/^#\/?/, ""));
  if (params.get("error_code")) return "expired"; // e.g. otp_expired: the link was used or is too old
  const access_token = params.get("access_token");
  if (!access_token) return null;
  const claims = tokenClaims(access_token) || {};
  setSession({
    access_token,
    refresh_token: params.get("refresh_token") || undefined,
    expires_at: Number(params.get("expires_at")) || claims.exp,
    user: { id: claims.sub, email: claims.email },
  });
  return params.get("type") || "signin";
}

/**
 * Authenticated user profile: GET /v1/me
 * Requires a valid access token.
 * Returns { id, full_name, email, role, is_active, created_at, updated_at }
 */
export async function fetchMe(token) {
  return apiFetch("/me", { token });
}

/**
 * Every page of a paged list endpoint ({ data, meta: { page, limit, total } }).
 * Stops at the first failed page and returns that error.
 */
async function fetchAllPages(path, { token, query = {} } = {}) {
  const rows = [];
  for (let page = 1; ; page++) {
    const qStr = new URLSearchParams({ ...query, page: String(page), limit: "100" }).toString();
    const res = await apiFetch(`${path}?${qStr}`, { token });
    if (!res.ok) return res;
    const data = Array.isArray(res.data) ? res.data : [];
    rows.push(...data);
    const total = res.raw?.meta?.total ?? rows.length;
    if (!data.length || rows.length >= total) return { ok: true, status: res.status, data: rows };
  }
}

// The API rejects empty strings, so blank optional fields are sent as null.
const SPECIES_FIELDS = ["scientific_name", "common_name", "family", "genus", "description", "conservation_status", "cultural_significance"];
function speciesBody(sp) {
  const body = {};
  for (const k of SPECIES_FIELDS) {
    const v = typeof sp[k] === "string" ? sp[k].trim() : sp[k];
    body[k] = v === "" || v === undefined ? null : v;
  }
  return body;
}

/**
 * Staff species list (Officer/Admin): GET /v1/species, every page.
 * Deleted species are not included.
 */
export async function fetchStaffSpecies({ token } = {}) {
  return fetchAllPages("/species", { token });
}

/**
 * Create a species (Officer/Admin): POST /v1/species (CTIP-46).
 * The API records created_by and updated_by from the token.
 */
export async function createSpeciesApi(sp, { token } = {}) {
  return apiFetch("/species", { method: "POST", token, body: speciesBody(sp) });
}

/**
 * Edit a species (Officer/Admin): PATCH /v1/species/:id (CTIP-46).
 * The API records updated_by; the database trigger sets updated_at.
 */
export async function updateSpeciesApi(id, sp, { token } = {}) {
  return apiFetch(`/species/${encodeURIComponent(id)}`, { method: "PATCH", token, body: speciesBody(sp) });
}

/**
 * Species photos (Officer/Admin, CTIP-85). The API checks the real file type
 * and size, removes location metadata, and stores it in Supabase Storage.
 * file is a File or Blob; fields are caption, credit, is_primary, sort_order.
 */
export async function uploadSpeciesMediaApi(speciesId, file, fields = {}, { token } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, String(v));
  if (file.uri) form.append("file", file); // React Native: { uri, name, type }
  else form.append("file", file, file.name || "photo");
  // Up to 10 MB on a field connection: allow longer than the usual 8 s.
  return apiFetch(`/species/${encodeURIComponent(speciesId)}/media`, { method: "POST", token, body: form, timeout: 60000 });
}

export async function updateSpeciesMediaApi(speciesId, mediaId, changes, { token } = {}) {
  return apiFetch(`/species/${encodeURIComponent(speciesId)}/media/${encodeURIComponent(mediaId)}`, { method: "PATCH", token, body: changes });
}

export async function deleteSpeciesMediaApi(speciesId, mediaId, { token } = {}) {
  return apiFetch(`/species/${encodeURIComponent(speciesId)}/media/${encodeURIComponent(mediaId)}`, { method: "DELETE", token });
}

/**
 * Observations (CTIP-86), every page: GET /v1/observations?status=...
 * status "pending" is the review queue (waiting for a decision), oldest first.
 * Botanists only ever get their own records back.
 */
export async function fetchObservations({ status, token } = {}) {
  return fetchAllPages("/observations", { token, query: status ? { status } : {} });
}

/**
 * Submit an observation review: POST /v1/observations/:id/reviews
 * (CTIP-86 locked review endpoint with transactional RPC).
 */
export async function submitReviewApi({ observationId, decision, version = 1, comment, token }) {
  return apiFetch(`/observations/${encodeURIComponent(observationId)}/reviews`, {
    method: "POST",
    token,
    body: {
      decision,
      observation_version: version,
      comment: comment || undefined,
    },
  });
}

/**
 * Fetch distribution map points: GET /v1/distribution
 * (CTIP-88: snaps endangered plant coordinates to ~1.1km grid for non-officers).
 */
export async function fetchDistribution({ speciesId, family, token } = {}) {
  const query = new URLSearchParams();
  if (speciesId) query.set("species_id", speciesId);
  if (family) query.set("family", family);
  const qStr = query.toString();
  return apiFetch(`/distribution${qStr ? `?${qStr}` : ""}`, { token });
}

/**
 * Everything the apps show, in one request. Signed in: GET /v1/workspace, the
 * rows this user's role may see. Visitor: GET /v1/public/workspace, published
 * species and their photos. Photo rows come with a `url` ready to show.
 */
export async function fetchWorkspace({ token } = {}) {
  return token ? apiFetch("/workspace", { token, timeout: 20000 }) : apiFetch("/public/workspace", { timeout: 20000 });
}

const enc = encodeURIComponent;
const send = (method, path, body, token, options = {}) =>
  apiFetch(path, { method, token, body, timeout: options?.timeout ?? 60000, ...options });

// Own account
export const updateMeApi = (changes, { token } = {}) => send("PATCH", "/me", changes, token);

// Accounts (Admin)
export const createProfileApi = (profile, { token } = {}) => send("POST", "/profiles", profile, token);
export const updateProfileApi = (id, changes, { token } = {}) => send("PATCH", `/profiles/${enc(id)}`, changes, token);

// Plants and observations
export const findSpecimenByQrApi = (qrId, { token } = {}) => apiFetch(`/specimens/by-qr/${enc(qrId)}`, { token });
export const createSpecimenApi = (specimen, { token } = {}) => send("POST", "/specimens", specimen, token);
export const updateSpecimenApi = (id, changes, { token } = {}) => send("PATCH", `/specimens/${enc(id)}`, changes, token);
export const createObservationApi = (obs, { token } = {}) => send("POST", "/observations", obs, token);
// Draft/queued: sent as it is. Returned: with fixes (height_cm, morphology, notes) and an optional comment.
export const submitObservationApi = (id, body = {}, { token } = {}) => send("POST", `/observations/${enc(id)}/submit`, body, token);
export const addCommentApi = (id, body, { token } = {}) => send("POST", `/observations/${enc(id)}/comments`, { body }, token);

// The file part of an upload. In the browser a File or Blob; in React Native / Expo,
// standard Blob, File or WinterCG part with bytes, with fallback to legacy URI.
export async function filePart(photo) {
  if (!photo) return null;
  if (photo.file) return photo.file;
  if (!photo.url && !photo.base64) return null;

  const fileName = photo.name || "photo.jpg";
  const mimeType = photo.type || "image/jpeg";

  // 1. If base64 is available (from mobile camera/gallery with base64: true, or data URL)
  const b64 = photo.base64 || (photo.url && photo.url.startsWith("data:") ? photo.url : null);
  if (b64) {
    const buffer = decodeBase64ToArrayBuffer(b64);
    const uint8 = new Uint8Array(buffer);
    let blob = null;
    if (typeof Blob !== "undefined") {
      try {
        blob = new Blob([uint8], { type: mimeType });
      } catch {}
    }
    const part = blob || {};
    try { Object.defineProperty(part, "name", { value: fileName, writable: true, configurable: true }); } catch { part.name = fileName; }
    try { Object.defineProperty(part, "bytes", { value: () => uint8, writable: true, configurable: true }); } catch { part.bytes = () => uint8; }
    if (!part.type) {
      try { Object.defineProperty(part, "type", { value: mimeType, writable: true, configurable: true }); } catch { part.type = mimeType; }
    }
    if (photo.url) {
      try { Object.defineProperty(part, "uri", { value: photo.url, writable: true, configurable: true }); } catch { part.uri = photo.url; }
    }
    return part;
  }

  // 2. Fetch url as Blob (standard web / modern Expo fetch)
  if (photo.url) {
    try {
      const res = await fetch(photo.url);
      const blob = await res.blob();
      try { Object.defineProperty(blob, "name", { value: fileName, writable: true, configurable: true }); } catch { blob.name = fileName; }
      try { Object.defineProperty(blob, "bytes", { value: async () => new Uint8Array(await blob.arrayBuffer()), writable: true, configurable: true }); } catch {}
      try { Object.defineProperty(blob, "uri", { value: photo.url, writable: true, configurable: true }); } catch { blob.uri = photo.url; }
      return blob;
    } catch {
      // In case fetch is not supported for this URI scheme, return the RN uri descriptor
      return {
        uri: photo.url,
        name: fileName,
        type: mimeType,
      };
    }
  }

  return null;
}

/**
 * Field photo: POST /v1/observations/:id/photos. photo is the app's photo
 * object ({ file } on web, { url: file:// or content://, base64 } on mobile). Its id is
 * sent too, so a retry does not save the same photo twice.
 */
export async function uploadObservationPhotoApi(observationId, photo, { token } = {}) {
  const part = await filePart(photo);
  if (!part) return { ok: false, code: "UNREADABLE_PHOTO", message: "This photo could not be read. Remove it and add it again." };
  const form = new FormData();
  if (photo.id) form.append("id", photo.id);
  if (photo.caption?.trim()) form.append("caption", photo.caption.trim());
  for (const trait of photo.traits || []) form.append("traits", trait);
  const fileName = photo.name || part.name || "photo.jpg";

  if (typeof Blob !== "undefined" && part instanceof Blob) {
    form.append("file", part, fileName);
  } else if (typeof part.bytes === "function") {
    // Expo WinterCG fetch accepts any object with a bytes() method
    form.append("file", part, fileName);
  } else if (part.uri) {
    // React Native legacy FormData
    form.append("file", part);
  } else {
    form.append("file", part, fileName);
  }
  return apiFetch(`/observations/${enc(observationId)}/photos`, { method: "POST", token, body: form, timeout: 60000 });
}

// Species: publish/unpublish, soft delete, restore
export const publishSpeciesApi = (id, is_published, { token } = {}) => send("POST", `/species/${enc(id)}/publish`, { is_published }, token);
export const deleteSpeciesApi = (id, { token } = {}) => send("DELETE", `/species/${enc(id)}`, undefined, token);
export const restoreSpeciesApi = (id, { token } = {}) => send("POST", `/species/${enc(id)}/restore`, undefined, token);

// QR tags (Officer/Admin). The API picks the next free ids.
export const createTagBatchApi = (count, batch_label, { token } = {}) => send("POST", "/qr-tags/batch", { count, batch_label }, token);
export const deleteTagApi = (qrId, { token } = {}) => send("DELETE", `/qr-tags/${enc(qrId)}`, undefined, token);
export const retireTagApi = (qrId, { token } = {}) => send("POST", `/qr-tags/${enc(qrId)}/retire`, undefined, token);

// Alerts and sensors (Officer/Admin)
export const assignAlertApi = (id, assigned_to, { token } = {}) => send("POST", `/alerts/${enc(id)}/assign`, { assigned_to }, token);
export const acknowledgeAlertApi = (id, { token } = {}) => send("POST", `/alerts/${enc(id)}/acknowledge`, undefined, token);
export const resolveAlertApi = (id, outcome, { token } = {}) => send("POST", `/alerts/${enc(id)}/resolve`, { outcome }, token);
export const addAlertNoteApi = (id, note, { token } = {}) => send("POST", `/alerts/${enc(id)}/notes`, { note }, token);
export const setThresholdsApi = (nodeId, thresholds, { token } = {}) => send("PATCH", `/sensor-nodes/${enc(nodeId)}`, { thresholds }, token);

// Notifications (the signed-in person's own)
export const fetchNotificationsApi = ({ token } = {}) => apiFetch("/notifications", { token });
export const markReadApi = (id, { token } = {}) => send("POST", `/notifications/${enc(id)}/read`, undefined, token);
export const markAllReadApi = ({ token } = {}) => send("POST", "/notifications/read-all", undefined, token);

/**
 * Check if the backend API server is reachable and active.
 */
export async function pingBackend() {
  const start = Date.now();
  const res = await apiFetch("/public/species", { timeout: 3000 });
  const latency = Date.now() - start;

  if (res.ok || (res.status >= 200 && res.status < 500)) {
    return { online: true, latency, status: res.status, url: getApiBaseUrl() };
  }

  return { online: false, latency, code: res.code, message: res.message, url: getApiBaseUrl() };
}
