// Small helpers used by several pages. Only call uid() and nowIso()
// from event handlers, never while rendering.

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

export const nowIso = () => new Date().toISOString();

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "-";

export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "-";

export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export const toCsv = (rows) =>
  rows.map((r) => r.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");

export function download(name, text, type = "text/csv") {
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
