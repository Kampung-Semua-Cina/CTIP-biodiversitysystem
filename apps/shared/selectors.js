// apps/shared/selectors.js
// Read-only helpers that join the tables together for the pages.

import { can } from "./permissions.js";
import { FAMILY_PALETTE, UNKNOWN_FAMILY_COLOR } from "./tokens.js";

// Primary photo first. If nobody chose one, the oldest photo is primary.
export function orderedPhotos(photos = []) {
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
  if (!p) return null;
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
export const UNKNOWN_FAMILY = "Not confirmed";
export const familyOf = (p) => p.species?.family || UNKNOWN_FAMILY;

// Colours come from every family in the species table, not from the plants this role can see,
// so a family keeps the same colour for visitors and all staff. Only families in `plants` are returned (for the legend).
export function familyColors(species = [], plants = []) {
  const families = [...new Set(species.map((s) => s.family).filter(Boolean))].sort();
  const colorOf = Object.fromEntries(families.map((f, i) => [f, FAMILY_PALETTE[i % FAMILY_PALETTE.length]]));
  colorOf[UNKNOWN_FAMILY] = UNKNOWN_FAMILY_COLOR;
  const shown = [...new Set(plants.map(familyOf))].sort((a, b) => (a === UNKNOWN_FAMILY) - (b === UNKNOWN_FAMILY) || a.localeCompare(b));
  return Object.fromEntries(shown.map((f) => [f, colorOf[f] || colorOf[UNKNOWN_FAMILY]]));
}

export function nextTagIds(tags = [], count = 1) {
  const nums = tags.map((t) => Number(t.qr_id.replace(/\D/g, "")) || 0);
  const start = Math.max(0, ...nums) + 1;
  return Array.from({ length: count }, (_, i) => `NIAH-${String(start + i).padStart(4, "0")}`);
}

export const tagUrl = (qr) =>
  typeof window !== "undefined" && window.location
    ? `${window.location.origin}${window.location.pathname}#/dashboard/${qr}`
    : `https://daunsense.example/#/dashboard/${qr}`;

export function staffCounts(db, me) {
  return {
    review: db.observations.filter((o) => o.status === "synced").length,
    alerts: db.alerts.filter((a) => a.status === "open").length,
    returned: me ? db.observations.filter((o) => o.recorded_by === me.id && o.status === "returned").length : 0,
  };
}

// ---------- Species catalogue, species page and plant page ----------

// Visits to one tagged plant (observations), newest first. Visitors only see approved visits.
export function plantVisits(db, plantId, role) {
  return db.observations
    .filter((o) => o.specimen_id === plantId && (can(role, "pending") || o.status === "approved"))
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));
}

// Date of the newest visit, or null.
export const lastVisit = (db, plantId, role) => plantVisits(db, plantId, role)[0]?.observed_at || null;

// Captioned catalogue photos of one species, cover photo first.
export const speciesMedia = (db, speciesId) =>
  db.species_media.filter((m) => m.species_id === speciesId).sort((a, b) => a.sort_order - b.sort_order);

// Observation photos for one species across all its tagged specimens.
export function speciesObservationPhotos(db, speciesId) {
  if (!speciesId || !db?.plants) return [];
  const species = db.species?.find((s) => s.id === speciesId);
  const matchingPlants = (db.plants || []).filter((p) => {
    if (p.is_deleted) return false;
    if (p.species_id === speciesId) return true;
    if (species && p.proposed_species) {
      const prop = p.proposed_species.trim().toLowerCase();
      if (species.scientific_name && prop === species.scientific_name.toLowerCase()) return true;
      if (species.common_name && prop === species.common_name.toLowerCase()) return true;
    }
    return false;
  });

  const photos = [];
  const seen = new Set();
  for (const plant of matchingPlants) {
    for (const ph of plant.photos || []) {
      const key = ph.url || ph.id;
      if (key && !seen.has(key)) {
        seen.add(key);
        photos.push({
          id: ph.id,
          observation_id: ph.observation_id || null,
          url: ph.url,
          created_at: ph.created_at || "",
          plant_qr: plant.qr_id,
          plant_name: plant.name,
          caption: ph.caption || (plant.qr_id ? `Observation from ${plant.qr_id}` : "Field observation"),
          is_primary: false,
        });
      }
    }
  }
  return photos;
}

// One entry per species for the catalogue, with the tagged plants this role can see.
// Visitors only get published species. Staff also see unpublished ones.
export function speciesCatalogue(db, role) {
  const plants = visiblePlants(db, role);
  return db.species
    .filter((s) => !s.is_deleted && (can(role, "pending") || s.is_published))
    .map((s) => {
      const mine = plants.filter((p) => p.species_id === s.id);
      const media = speciesMedia(db, s.id);
      const obsPhotos = speciesObservationPhotos(db, s.id);
      return {
        ...s,
        name: s.common_name || s.scientific_name,
        plants: mine,
        media,
        photo: media[0]?.url || obsPhotos[0]?.url || mine.find((p) => p.photos?.length)?.photos[0]?.url || null,
        endangered: s.conservation_status === "endangered",
      };
    });
}

// Plants that are not on the map for this role (endangered for visitors) still count, but have no coords.
export const mappable = (plants, role) => plants.map((p) => ({ p, c: shownCoords(p, role) })).filter((x) => x.c);
