// apps/shared/tokens.js
// Daun design language v1: the ONE place colour, type, spacing and shape values live.
// The web app turns these into CSS variables (apps/web/src/theme.js) and the mobile app
// reads them through its ThemeProvider (apps/mobile/components/Theme.js).
// Change a value here and both apps follow. Do not copy hex values into other files.

// ---------- colour ----------
// Same token names in both themes. Every text pair below is checked at 4.5:1 or better
// against `surface` (ink3 against `sunken`).
export const palettes = {
  dark: {
    bg: "#0d1f15", // page ground
    surface: "#15291d", // cards, sheets, popovers
    raised: "#1c3526", // table heads, hover and selected rows
    sunken: "#0a1810", // input and search fields
    chrome: "#11251a", // top bar, bottom bar, sidebar
    line: "#2e4d38", // borders and dividers (solid, no alpha, so React Native matches the web)
    ink: "#eef4e4", // primary text
    ink2: "#b4c9ab", // secondary text, labels, scientific names
    ink3: "#8ea688", // placeholders, hints, timestamps
    accent: "#9bcf6a", // primary button, links, selected tab
    onAccent: "#11281a", // text and icons on accent
    accentPress: "#86ba56", // pressed and hover state
    success: "#8fd18a", // done, safe, published
    info: "#82c8dc", // waiting on someone else
    warning: "#e8bd5c", // needs your attention
    danger: "#f2907b", // at risk, rejected, destructive
    onDanger: "#2b0e08", // text on danger buttons
    neutral: "#aabba6", // draft, unused, offline
    mapTile: "#123021", // map ground
    mapLine: "#24533a", // map rivers and trails
    camera: "#06110b", // behind the camera preview (same in both themes)
  },
  light: {
    bg: "#f3f6ec",
    surface: "#ffffff",
    raised: "#f8faf4",
    sunken: "#f7faf2",
    chrome: "#ffffff",
    line: "#d4e0c9",
    ink: "#15301f",
    ink2: "#4a6652",
    ink3: "#5b7461",
    accent: "#2f7a3c",
    onAccent: "#ffffff",
    accentPress: "#256331",
    success: "#2b7a3a",
    info: "#1b6e85",
    warning: "#8a5a00",
    danger: "#b23c26",
    onDanger: "#ffffff",
    neutral: "#5a6f61",
    mapTile: "#e3eed8",
    mapLine: "#bcd3ae",
    camera: "#06110b",
  },
};

export const TONES = ["accent", "success", "info", "warning", "danger", "neutral"];

// Mix two hex colours: t = how much of `a` (0..1).
export function mix(a, b, t) {
  const A = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const B = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return "#" + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, "0")).join("");
}

// A hex colour with transparency, as rgba() (for the web's frosted panels).
export function alpha(hex, a) {
  const [r, g, b] = hex.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Full colour set for one theme: the palette plus a soft fill and a border for every tone
// (chips, notices, selected rows). Fill = tone mixed into surface at 16% (dark) or 10% (light).
export function colors(theme = "dark") {
  const p = palettes[theme] || palettes.dark;
  const k = theme === "light" ? 0.1 : 0.16;
  const out = { ...p };
  for (const t of TONES) {
    out[t + "Soft"] = mix(p[t], p.surface, k);
    out[t + "Line"] = mix(p[t], p.surface, 0.4);
  }
  out.shadow = theme === "light" ? "rgba(21, 48, 31, 0.07)" : "transparent";
  return out;
}

// One meaning per colour: every status maps to exactly one tone, on web and mobile.
export const STATUS_TONE = {
  approved: "success", published: "success", active: "success", resolved: "success", "least concern": "success",
  synced: "info", assigned: "info",
  returned: "warning", acknowledged: "warning", vulnerable: "warning", "near threatened": "warning", medium: "warning",
  rejected: "danger", endangered: "danger", open: "danger", high: "danger", faulty: "danger", retired: "danger",
  draft: "neutral", queued: "neutral", unused: "neutral", offline: "neutral", low: "neutral", unknown: "neutral",
};

// Plain-language names for record statuses. The database values stay the same.
export const STATUS_TEXT = {
  approved: "Published",
  synced: "Needs review",
  queued: "Waiting to sync",
  returned: "Returned",
  rejected: "Rejected",
  draft: "Draft",
};

// Categorical colours for plant families on maps (not statuses, so they sit outside the tones).
export const FAMILY_PALETTE = ["#2f9e44", "#e8590c", "#1c7ed6", "#c2255c", "#f2b705", "#7048e8", "#0ca678", "#a0522d", "#e64980", "#3bc9db"];
export const UNKNOWN_FAMILY_COLOR = "#868e96";

// ---------- type ----------
// Fraunces names things (headings, plant names, numbers); scientific names are Fraunces italic.
// Nunito is everything you read or tap. JetBrains Mono is for tag IDs, coordinates and readings.
export const fonts = { display: "Fraunces", text: "Nunito", mono: "JetBrains Mono" };

// Same numbers in CSS (px) and React Native (dp). Nothing smaller than 12.
export const typeScale = {
  display: { size: 40, line: 44, font: "display", weight: 700 },
  title1: { size: 30, line: 36, font: "display", weight: 700 },
  title2: { size: 22, line: 28, font: "display", weight: 700 },
  title3: { size: 18, line: 24, font: "display", weight: 600 },
  sci: { size: 15, line: 20, font: "display", weight: 500, italic: true },
  bodyLg: { size: 17, line: 26, font: "text", weight: 400 },
  body: { size: 16, line: 24, font: "text", weight: 400 },
  label: { size: 15, line: 20, font: "text", weight: 700 },
  small: { size: 14, line: 20, font: "text", weight: 600 },
  caption: { size: 13, line: 18, font: "text", weight: 700 },
  overline: { size: 12, line: 16, font: "text", weight: 800, caps: true, tracking: 0.08 },
  mono: { size: 13, line: 18, font: "mono", weight: 500 },
};

// ---------- space, shape, touch ----------
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 56 };
export const radius = { tag: 6, control: 10, card: 14, sheet: 20, pill: 999 };
export const touch = { phone: 48, web: 44 };

// ---------- motion ----------
// Short and calm: things fade and settle into place, nothing bounces. Durations in ms.
// Anything that moves must respect the device's "reduce motion" setting.
export const motion = {
  fast: 120, // hover, press, colour changes
  base: 200, // popovers, menus, chips, theme change
  slow: 320, // page and panel entrances
  ease: "cubic-bezier(0.2, 0, 0, 1)", // settle into place (entrances)
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)", // colour and size changes
};
