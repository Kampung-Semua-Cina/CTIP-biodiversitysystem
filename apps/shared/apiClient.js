// apps/shared/apiClient.js
// One way for the web and mobile apps to call the Express API (CTIP-54).
// Each app makes its own instance with its base URL from .env:
//   web:    apps/web/src/api.js     (VITE_API_URL)
//   mobile: apps/mobile/api.js      (EXPO_PUBLIC_API_URL)
//
// How a feature story uses it:
//
//   import { api, ApiError } from "../api.js";      // web; mobile: "../api.js" from pages/
//
//   const { data, meta } = await api.get("/species", { query: { q: "nepen", page: 1 } });
//   const created = await api.post("/species", { scientific_name: "Nepenthes rajah" });
//   await api.patch(`/species/${id}`, { common_name: "Giant pitcher plant" });
//   await api.delete(`/species/${id}`);
//
//   const form = new FormData();                     // uploads: send FormData, no JSON
//   form.append("file", file);
//   form.append("caption", "Lower pitcher");
//   await api.post(`/species/${id}/media`, form);
//
//   try { ... } catch (err) {
//     if (err instanceof ApiError) showError(err.userMessage);  // one message for the user
//   }
//
// Signing in goes through the API too (POST /v1/auth/sign-in, CTIP-114); the
// apps never call Supabase. Connect the stored session once:
//
//   import { freshAuthToken } from "./api.js";
//   api.setAuth({ getAccessToken: freshAuthToken, refreshSession: freshAuthToken });
//
// Until then (and for visitors) requests go without a token, which is what the
// public routes (/public/...) expect.

// What the user sees for each API error code. Anything not listed falls back
// to the API's own message, or a general one for server errors.
const USER_MESSAGES = {
  ACCOUNT_NOT_ACTIVE: "Your account is waiting for an Admin to approve it.",
  FORBIDDEN: "Your role is not allowed to do this.",
  UNAUTHENTICATED: "Please sign in again.",
  INVALID_TOKEN: "Please sign in again.",
  TOKEN_EXPIRED: "Your session has ended. Please sign in again.",
  NOT_FOUND: "We couldn't find that. It may have been deleted.",
  VERSION_CONFLICT: "Someone changed this while you were working on it. Reload and try again.",
  FILE_TOO_LARGE: "That file is too large. Photos can be at most 10 MB.",
  UNSUPPORTED_FILE_TYPE: "Photos must be JPEG, PNG or WebP.",
  NETWORK_ERROR: "Can't reach the server. Check your connection and try again.",
  INTERNAL_ERROR: "Something went wrong on the server. Please try again.",
};

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = "ApiError";
    this.status = status;   // HTTP status, 0 when the server could not be reached
    this.code = code;       // the API's code, e.g. "VALIDATION_ERROR"
    this.details = details; // e.g. { fields: [{ path, message }] } for 422
  }

  // One consistent, readable message for the user.
  get userMessage() {
    if (USER_MESSAGES[this.code]) return USER_MESSAGES[this.code];
    if (this.code === "VALIDATION_ERROR" && this.details?.fields?.length) {
      return this.details.fields.map((f) => (f.path ? `${f.path}: ${f.message}` : f.message)).join("\n");
    }
    if (this.status >= 500) return USER_MESSAGES.INTERNAL_ERROR;
    return this.message || "Something went wrong. Please try again.";
  }
}

export function createApiClient({ baseUrl, fetch: fetchFn = (...args) => globalThis.fetch(...args) }) {
  const root = (baseUrl ?? "").replace(/\/+$/, "");
  let auth = { getAccessToken: async () => null, refreshSession: async () => null };
  let refreshing = null; // one refresh at a time, shared by every request that hit 401

  function refreshOnce() {
    refreshing ??= Promise.resolve(auth.refreshSession()).finally(() => { refreshing = null; });
    return refreshing;
  }

  async function send(method, path, body, query, token) {
    // Checked here, not at import, so an app without .env still starts.
    if (!root) throw new Error("API base URL is missing. Set it in the app's .env (see .env.example).");
    const isAbsolute = root.startsWith("http://") || root.startsWith("https://");
    const base = isAbsolute ? undefined : (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost:8000");
    const url = new URL(root + path, base);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
    try {
      return await fetchFn(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });
    } catch {
      throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Network request failed" });
    }
  }

  async function request(method, path, { body, query } = {}) {
    let res = await send(method, path, body, query, await auth.getAccessToken());
    if (res.status === 401) {
      const err = await res.clone().json().catch(() => ({}));
      if (err.code === "TOKEN_EXPIRED") {
        const fresh = await refreshOnce().catch(() => null);
        if (fresh) res = await send(method, path, body, query, fresh); // retry once, never more
      }
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError({
        status: res.status,
        code: data?.code ?? (res.status >= 500 ? "INTERNAL_ERROR" : "HTTP_" + res.status),
        message: data?.message ?? res.statusText,
        details: data?.details,
      });
    }
    return data;
  }

  return {
    setAuth(next) { auth = { ...auth, ...next }; },
    get: (path, { query } = {}) => request("GET", path, { query }),
    post: (path, body, { query } = {}) => request("POST", path, { body, query }),
    patch: (path, body, { query } = {}) => request("PATCH", path, { body, query }),
    delete: (path, { query } = {}) => request("DELETE", path, { query }),
  };
}
