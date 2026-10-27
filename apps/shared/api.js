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
