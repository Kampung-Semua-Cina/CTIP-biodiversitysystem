// apps/web/src/theme.js
// Turns the shared design tokens (apps/shared/tokens.js) into the CSS variables App.css uses,
// and keeps track of which theme to show (Light, Dark, or follow the device).
// Colour, type, spacing and radius values live only in tokens.js. Never put a hex value here.
import { useEffect, useState, useSyncExternalStore } from "react";
import { colors, alpha, typeScale, space, radius, fonts } from "../../shared/tokens.js";

// ---------- CSS variables ----------
export function themeVars(theme) {
  const c = colors(theme);
  const light = theme === "light";
  const vars = {
    // Surfaces. Solid colours only: no see-through panels.
    "--ground": c.bg, // page background
    "--surface": c.surface, // cards, popups
    "--raised": c.raised, // table heads, hover and selected rows
    "--sunken": c.sunken, // inputs and search fields
    "--chrome": c.chrome, // header, footer, sidebar, bottom bar
    "--line": c.line,
    // Text
    "--ink": c.ink,
    "--ink2": c.ink2,
    "--ink3": c.ink3,
    // Accent and status tones, each with a soft fill and a border for chips and notices
    "--acc": c.accent,
    "--on-acc": c.onAccent,
    "--acc-press": c.accentPress,
    "--ok": c.success,
    "--info": c.info,
    "--warn": c.warning,
    "--bad": c.danger,
    "--on-bad": c.onDanger,
    "--neutral": c.neutral,
    "--map-tile": c.mapTile,
    "--map-line": c.mapLine,
    // Depth: dark mode steps surfaces up in lightness; light mode adds one soft shadow.
    "--shadow": light ? `0 1px 2px ${alpha(c.ink, 0.06)}, 0 8px 24px ${alpha(c.ink, 0.07)}` : "none",
    // Behind popups and the phone menu: the near-black camera colour, so it dims both themes alike.
    "--scrim": alpha(c.camera, light ? 0.4 : 0.6),
  };
  for (const tone of ["accent", "success", "info", "warning", "danger", "neutral"]) {
    const name = { accent: "acc", success: "ok", info: "info", warning: "warn", danger: "bad", neutral: "neutral" }[tone];
    vars[`--${name}-soft`] = c[tone + "Soft"];
    vars[`--${name}-line`] = c[tone + "Line"];
  }
  // Type scale: --t-title1-size, --t-title1-line ... (same numbers as the mobile app)
  for (const [name, t] of Object.entries(typeScale)) {
    vars[`--t-${name}-size`] = t.size + "px";
    vars[`--t-${name}-line`] = t.line + "px";
  }
  for (const [k, v] of Object.entries(space)) vars[`--s-${k}`] = v + "px";
  for (const [k, v] of Object.entries(radius)) vars[`--r-${k}`] = v + "px";
  vars["--f-display"] = `${fonts.display}, Georgia, serif`;
  vars["--f-text"] = `${fonts.text}, system-ui, sans-serif`;
  vars["--f-mono"] = `"${fonts.mono}", ui-monospace, Menlo, Consolas, monospace`;
  return vars;
}

export const pageBackground = (theme) => colors(theme).bg;

// ---------- which theme to show ----------
// mode = what the person picked: "device" (default), "light" or "dark".
// The pick is kept in this browser only (localStorage), so it survives a reload.
const KEY = "daun-theme";
const MODES = ["device", "light", "dark"];

function readMode() {
  try {
    const saved = window.localStorage.getItem(KEY);
    return MODES.includes(saved) ? saved : "device";
  } catch {
    return "device"; // private window or blocked storage: just follow the device
  }
}

// Follows the device's dark mode setting live, so switching it in the OS updates the page.
const query = "(prefers-color-scheme: dark)";
function subscribeScheme(callback) {
  const mq = window.matchMedia?.(query);
  mq?.addEventListener("change", callback);
  return () => mq?.removeEventListener("change", callback);
}
const deviceScheme = () => (window.matchMedia?.(query).matches === false ? "light" : "dark");

export function useThemeMode() {
  const [mode, setModeState] = useState(readMode);
  const device = useSyncExternalStore(subscribeScheme, deviceScheme, () => "dark");
  const theme = mode === "device" ? device : mode;

  const setMode = (next) => {
    setModeState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice still applies until the page is reloaded.
    }
  };

  // The page behind the site (overscroll, print margins) and native controls follow the theme.
  useEffect(() => {
    document.body.style.background = pageBackground(theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return { mode, theme, setMode };
}
