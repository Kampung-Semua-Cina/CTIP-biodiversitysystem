// apps/shared/mapConfig.js
// Shared Leaflet and OpenStreetMap map configuration, bounds, and coordinate helpers.
import { MAP_BOUNDS } from "./site.js";
import { shownCoords, familyOf } from "./selectors.js";

export { MAP_BOUNDS };

export const MAP_CENTER = {
  lat: (MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2, // ~3.803
  lng: (MAP_BOUNDS.minLng + MAP_BOUNDS.maxLng) / 2, // ~113.7755
};

export const DEFAULT_ZOOM = 14;

// Base maps run out of detail before MAX_ZOOM: their last tiles are enlarged, so zooming in stays sharp enough to pick a pin.
export const MAX_ZOOM = 20;
// From this zoom (or when zooming would not separate them) a cluster's number opens its plants.
export const LIST_ZOOM = 16;
export const PLANT_ZOOM = 17;
export const SELECTED_ZOOM = 18;

// Asking a tile server for a close-up tells it where the viewer is looking (threat T19).
// While a protected plant's exact spot is on screen, or within PROTECTED_REACH_M of the
// screen's edge, a map only downloads tiles up to this zoom, about 1.2 km across, and
// enlarges them: no finer than the 1.1 km area the public gets. Pins stay exact, because
// the app draws them and not the tile server. Every other view keeps its full detail, so
// the tile server can see close-ups a few hundred metres from a plant, but not of it.
export const PROTECTED_TILE_ZOOM = 15;
export const PROTECTED_REACH_M = 200;
export const isExactProtected = (p) => !!p.endangered && !p.location_reduced;

// Phone and high-density screens have 2 to 3 pixels per point. Tiles one zoom deeper,
// drawn at half size, use those pixels instead of stretching a normal tile over them.
export const HD_SCREEN_RATIO = 2;
export const tileServerZoom = (info) => info.maxNativeZoom || info.maxZoom || 19;

export const TILE_LAYERS = {
  osm: {
    id: "osm",
    name: "Map",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    id: "satellite",
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, USGS",
    maxZoom: 18, // past this, Esri has no imagery of the park: enlarge instead
  },
  topo: {
    id: "topo",
    name: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    subdomains: "abc",
    attribution: 'Map &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },
};

/**
 * Bounds in Leaflet [[south, west], [north, east]] format.
 */
export function getLeafletBounds(bounds = MAP_BOUNDS) {
  return [
    [bounds.minLat, bounds.minLng],
    [bounds.maxLat, bounds.maxLng],
  ];
}

/**
 * Transforms a plant record into a standardized map point object.
 */
export function toMapPoint(plant, role, familyColorMap = {}) {
  const coords = shownCoords(plant, role);
  if (!coords) return null;
  const fam = familyOf(plant);
  return {
    id: plant.id,
    qr_id: plant.qr_id,
    name: plant.name || plant.proposed_species || "Unknown plant",
    scientific: plant.scientific || plant.species?.scientific || "",
    family: fam,
    color: familyColorMap[fam] || "#10b981",
    lat: coords.lat,
    lng: coords.lng,
    photo: plant.photos?.[0]?.url || "",
  };
}
