// apps/web/src/theme.js
// Turns the shared design tokens (apps/shared/tokens.js) into the CSS variables App.css uses.
// Colours live only in tokens.js; this file just adds the see-through versions the
// frosted-glass panels need on top of the forest photo.
import { colors, alpha } from "../../shared/tokens.js";

export function themeVars(theme) {
  const c = colors(theme);
  const light = theme === "light";
  return {
    "--bg": alpha(c.surface, light ? 0.76 : 0.66), // glass panels
    "--bg2": alpha(light ? c.bg : c.raised, light ? 0.72 : 0.55), // inputs, hover rows
    "--solid": c.surface, // popups, dropdown lists
    "--pop": alpha(c.surface, 0.96),
    "--ink": c.ink,
    "--mute": c.ink2,
    "--line": c.line,
    "--acc": c.accent,
    "--acc2": c.warning,
    "--red": c.danger,
    "--btnink": c.onAccent,
    "--ok": c.success,
    "--warn": c.warning,
    "--bad": c.danger,
    "--ondanger": c.onDanger,
    "--info": c.info,
    "--neutral": c.neutral,
    "--veil": alpha(c.bg, light ? 0.88 : 0.8), // frosted sheet the page content sits on
    "--card": alpha(c.surface, light ? 0.86 : 0.72), // panels on top of the sheet
    "--tint": light ? alpha(c.bg, 0.62) : "rgba(0, 0, 0, 0)",
    "--sh": light ? `0 10px 30px ${c.shadow}` : "none",
    "--shade": light ? 1 : 0.45, // background photo brightness
  };
}

export const pageBackground = (theme) => colors(theme).bg;
