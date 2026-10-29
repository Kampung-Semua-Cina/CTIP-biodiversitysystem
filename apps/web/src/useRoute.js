// apps/web/src/useRoute.js
import { useEffect, useState } from "react";

// Tiny hash router: "#/dashboard/NIAH-0001" -> { seg: "dashboard", arg: "NIAH-0001" }
// Search pages keep their filters after "?", so a search can be shared or bookmarked:
// "#/plants?q=pitcher&family=Nepenthaceae" -> query { q: "pitcher", family: "Nepenthaceae" }
const read = () => {
  const full = window.location.hash.slice(1) || "/";
  const [path, qs = ""] = full.split("?");
  const [seg = "", rawArg = ""] = path.replace(/^\//, "").split("/");
  let arg = rawArg;
  try {
    arg = decodeURIComponent(rawArg);
  } catch {
    // Malformed URI in hash: fallback to rawArg
  }
  return { path, seg, arg, query: Object.fromEntries(new URLSearchParams(qs)) };
};

export function useRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const go = (path) => {
  window.location.hash = path;
};

// Changes some filters in the URL, keeping the page and the other filters. Empty
// values are left out. It replaces the history entry, so typing in a search box
// does not fill the Back button with one entry per letter.
export const setQuery = (changes) => {
  const { path, query } = read();
  const next = Object.entries({ ...query, ...changes }).filter(([, v]) => v != null && v !== "");
  const qs = new URLSearchParams(next).toString();
  window.history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  window.dispatchEvent(new HashChangeEvent("hashchange")); // replaceState does not fire it
};
