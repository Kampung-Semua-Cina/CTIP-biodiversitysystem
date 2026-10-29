// apps/shared/utils.js
// Small helpers used across web and mobile.

/**
 * Generate an RFC 4122 version 4 compliant UUID.
 * Works across Web (crypto.randomUUID), React Native Hermes, Node.js, and older browsers.
 */
export function uuidv4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate whether a string is a valid UUID format (v1-v5).
 */
export function isValidUuid(str) {
  return typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Fast zero-dependency base64 string to ArrayBuffer decoder.
 * Compatible with React Native Hermes, Web, and Node.js.
 */
export function decodeBase64ToArrayBuffer(base64) {
  if (!base64 || typeof base64 !== "string") return new ArrayBuffer(0);
  const clean = base64.replace(/^data:[^;]+;base64,/, "").trim();
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(clean, "base64");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  if (typeof atob === "function") {
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let len = clean.length * 0.75;
  if (clean.endsWith("==")) len -= 2;
  else if (clean.endsWith("=")) len -= 1;
  const buffer = new ArrayBuffer(Math.max(0, Math.floor(len)));
  const bytes = new Uint8Array(buffer);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = chars.indexOf(clean[i]);
    const enc2 = chars.indexOf(clean[i + 1]);
    const enc3 = chars.indexOf(clean[i + 2]);
    const enc4 = chars.indexOf(clean[i + 3]);
    if (enc1 === -1 || enc2 === -1) break;
    bytes[p++] = (enc1 << 2) | (enc2 >> 4);
    if (enc3 !== -1 && clean[i + 2] !== "=") {
      bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    }
    if (enc4 !== -1 && clean[i + 3] !== "=") {
      bytes[p++] = ((enc3 & 3) << 6) | enc4;
    }
  }
  return buffer;
}

export const uid = uuidv4;

export const nowIso = () => new Date().toISOString();

// Upload rules, the same as the Storage buckets (supabase/migrations/*_storage.sql)
// and UploadRequest in the API contract. The API and Storage check them again.
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_MB = 10;
export const CAPTION_MAX = 200;

// Why a file can't be uploaded, or null if it is fine.
export const photoProblem = (file) =>
  !PHOTO_TYPES.includes(file.type) ? `${file.name} is not a JPG, PNG or WebP image`
  : file.size > PHOTO_MAX_MB * 1024 * 1024 ? `${file.name} is larger than ${PHOTO_MAX_MB} MB`
  : null;

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "-";

export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "-";

export const initials = (name = "") => {
  if (!name || typeof name !== "string") return "?";
  const clean = name.trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

export const toCsv = (rows) =>
  rows.map((r) => r.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");

export function download(name, text, type = "text/csv") {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Pretty label for values like "observation_submitted" or "least concern".
export const label = (s = "") => {
  const t = String(s).replaceAll("_", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Exponential backoff retry wrapper (CTIP-58).
 * Retries on transient failure with exponential delay and randomized jitter.
 */
// Database and permission errors come back the same every time, so only
// network problems and server hiccups are worth another try.
export function isRetryable(err) {
  if (err?.retryable === false) return false;
  const code = String(err?.code ?? "");
  if (/^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST")) return false; // Postgres / PostgREST
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  return !status || status >= 500 || status === 408 || status === 429;
}

export async function withExponentialRetry(fn, { maxRetries = 3, initialDelayMs = 400, factor = 2, maxDelayMs = 4000, retryIf = isRetryable } = {}) {
  let attempt = 0;
  let delay = initialDelayMs;
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      if (attempt > maxRetries || !retryIf(err)) {
        throw err;
      }
      const jitter = (Math.random() - 0.5) * 0.4 * delay;
      const sleepMs = Math.min(maxDelayMs, delay + jitter);
      console.warn(`[Retry ${attempt}/${maxRetries}] Network action failed: ${err?.message || err}. Retrying in ${Math.round(sleepMs)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      delay = Math.min(maxDelayMs, delay * factor);
    }
  }
}

