// web/src/selectors.js
// Read-only helpers that join the tables together for the pages.

import { can } from "./permissions.js";

// Primary photo first. If nobody chose one, the oldest photo is primary.
export function orderedPhotos(photos) {
  const chosen = photos.find((p) => p.is_primary);
  if (chosen) return [chosen, ...photos.filter((p) => p !== chosen)];
  return [...photos].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export const nameOf = (db, id) => db.profiles.find((p) => p.id === id)?.full_name || "Unknown";

export function plantStatus(db, specimenId) {
  const obs = db.observations
    .filter((o) => o.specimen_id === specimenId)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  if (obs.some((o) => o.status === "approved")) return "approved";
  return obs[0]?.status || "draft";
}

// One plant = a specimen + its species + its photos + its record status.
export function plantView(db, p) {
  const species = db.species.find((s) => s.id === p.species_id && !s.is_deleted) || null;
  const status = plantStatus(db, p.id);
  const obs = db.observations
    .filter((o) => o.specimen_id === p.id && o.status === "approved")
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
  const endangered = p.endangered_override || species?.conservation_status === "endangered";
  return {
    ...p,
    species,
    status,
    endangered,
    name: species ? species.common_name || species.scientific_name : `${p.proposed_species || "Unnamed plant"} (unconfirmed)`,
    scientific: species?.scientific_name || "",
    conservation: species?.conservation_status || "unknown",
    height_cm: obs?.height_cm ?? null,
    morphology: obs?.morphology || "",
    photos: orderedPhotos(p.photos),
    isPublic: status === "approved" && !!species && species.is_published && !p.is_deleted,
  };
}

// Visitors only get published plants. Staff also see plants that are waiting for review.
export function visiblePlants(db, role) {
  return db.plants
    .filter((p) => !p.is_deleted)
    .map((p) => plantView(db, p))
    .filter((p) => can(role, "pending") || p.isPublic);
}

// Visitors never get any location for an endangered plant (returns null). Staff get the exact spot.
export function shownCoords(p, role) {
  if (p.endangered && !can(role, "pending")) return null;
  return { lat: p.lat, lng: p.lng };
}

// One colour per plant family, for the map. Plants with no confirmed species are grey.
const FAMILY_PALETTE = ["#2f9e44", "#e8590c", "#1c7ed6", "#c2255c", "#f2b705", "#7048e8", "#0ca678", "#a0522d", "#e64980", "#3bc9db"];
export const UNKNOWN_FAMILY = "Not confirmed";
export const familyOf = (p) => p.species?.family || UNKNOWN_FAMILY;

// Colours come from every family in the species table, not from the plants this role can see,
// so a family keeps the same colour for visitors and all staff. Only families in `plants` are returned (for the legend).
export function familyColors(species, plants) {
  const families = [...new Set(species.map((s) => s.family).filter(Boolean))].sort();
  const colorOf = Object.fromEntries(families.map((f, i) => [f, FAMILY_PALETTE[i % FAMILY_PALETTE.length]]));
  colorOf[UNKNOWN_FAMILY] = "#868e96";
  const shown = [...new Set(plants.map(familyOf))].sort((a, b) => (a === UNKNOWN_FAMILY) - (b === UNKNOWN_FAMILY) || a.localeCompare(b));
  return Object.fromEntries(shown.map((f) => [f, colorOf[f] || colorOf[UNKNOWN_FAMILY]]));
}

export function nextTagIds(tags, count) {
  const nums = tags.map((t) => Number(t.qr_id.replace(/\D/g, "")) || 0);
  const start = Math.max(0, ...nums) + 1;
  return Array.from({ length: count }, (_, i) => `NIAH-${String(start + i).padStart(4, "0")}`);
}

export const tagUrl = (qr) => `${window.location.origin}${window.location.pathname}#/dashboard/${qr}`;
