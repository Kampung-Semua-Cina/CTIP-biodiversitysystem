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
    maxZoom: 18,
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
