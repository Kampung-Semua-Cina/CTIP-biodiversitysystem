// apps/shared/utils.js
// Small helpers used across web and mobile.

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

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
export async function withExponentialRetry(fn, { maxRetries = 3, initialDelayMs = 400, factor = 2, maxDelayMs = 4000 } = {}) {
  let attempt = 0;
  let delay = initialDelayMs;
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
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

