// apps/shared/api.js
// Client interface to the Daun Sense REST API (services/api).
// Works in both browser (Vite) and React Native (Expo/Metro).

let inMemoryToken = null;
let customBaseUrl = null;

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

const TOKEN_KEY = "daun_access_token";

export function getAuthToken() {
  if (inMemoryToken) return inMemoryToken;
  inMemoryToken = storage.get(TOKEN_KEY);
  return inMemoryToken;
}

export function setAuthToken(token) {
  inMemoryToken = token || null;
  if (token) {
    storage.set(TOKEN_KEY, token);
  } else {
    storage.remove(TOKEN_KEY);
  }
}

export function clearAuthToken() {
  setAuthToken(null);
}

export function setApiBaseUrl(url) {
  customBaseUrl = url ? url.replace(/\/+$/, "") : null;
}

export function getApiBaseUrl() {
  if (customBaseUrl) return customBaseUrl;
  // React Native also defines window, so check it first. A phone cannot use a
  // relative path or its own localhost: set EXPO_PUBLIC_API_URL (apps/mobile/.env,
  // eas.json) to the API's address, e.g. http://192.168.1.20:8000.
  // Expo inlines EXPO_PUBLIC_ variables only when written out in full like this.
  if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
    const fromEnv = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;
    return fromEnv ? fromEnv.replace(/\/+$/, "") + "/v1" : "http://localhost:8000/v1";
  }
  // Browser environment: use Vite proxy path or environment variable
  if (typeof window !== "undefined") {
    // If running under Vite in dev or preview, check env
    try {
      if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
        return import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/v1";
      }
    } catch {
      // ignore
    }
    // Default to /v1 in web browser (proxied by Vite to http://localhost:8000/v1)
    return "/v1";
  }
  // Default to localhost:8000/v1 for node / mobile
  return "http://localhost:8000/v1";
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

  const token = options.token || getAuthToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  const timeoutMs = options.timeout ?? 8000;
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
 * Authenticated user profile: GET /v1/me
 * Requires valid Supabase Bearer token.
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
const send = (method, path, body, token) => apiFetch(path, { method, token, body });

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

// The file part of an upload. In the browser a File or Blob; in React Native
// FormData takes { uri, name, type } and streams the file from the device.
const isReactNative = typeof navigator !== "undefined" && navigator.product === "ReactNative";
export async function filePart(photo) {
  if (photo.file) return photo.file;
  if (!photo.url) return null;
  if (isReactNative && !/^https?:/i.test(photo.url)) {
    return { uri: photo.url, name: photo.name || "photo.jpg", type: photo.type || "image/jpeg" };
  }
  try {
    return await (await fetch(photo.url)).blob();
  } catch {
    return null;
  }
}

/**
 * Field photo: POST /v1/observations/:id/photos. photo is the app's photo
 * object ({ file } on web, { url: file:// or content:// } on mobile). Its id is
 * sent too, so a retry does not save the same photo twice.
 */
export async function uploadObservationPhotoApi(observationId, photo, { token } = {}) {
  const part = await filePart(photo);
  if (!part) return { ok: false, code: "UNREADABLE_PHOTO", message: "This photo could not be read. Remove it and add it again." };
  const form = new FormData();
  if (photo.id) form.append("id", photo.id);
  if (part.uri) form.append("file", part);
  else form.append("file", part, part.name || photo.name || "photo");
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
