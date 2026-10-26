// apps/web/src/useRoute.js
import { useEffect, useState } from "react";

// Tiny hash router: "#/dashboard/NIAH-0001" -> { seg: "dashboard", arg: "NIAH-0001" }
const read = () => {
  const path = window.location.hash.slice(1) || "/";
  const [seg = "", rawArg = ""] = path.replace(/^\//, "").split("/");
  let arg = rawArg;
  try {
    arg = decodeURIComponent(rawArg);
  } catch {
    // Malformed URI in hash: fallback to rawArg
  }
  return { path, seg, arg };
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
