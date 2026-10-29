// apps/shared/data.js
// Database schema constants and the empty initial store state. Profiles and
// everything else are loaded from the API after sign-in.

// IUCN Red List categories, the only values the API accepts (CTIP-46).
export const CONSERVATION = [
  "least concern", "near threatened", "vulnerable", "endangered", "critically endangered",
  "extinct in the wild", "extinct", "data deficient", "not evaluated",
];
// Statuses whose exact locations are hidden from visitors. Matches the API (distribution.js).
export const THREATENED = ["endangered", "critically endangered"];
export const OBS_STATUS = ["draft", "queued", "synced", "returned", "approved", "rejected"];

export const seed = {
  profiles: [],
  species: [],
  species_media: [],
  plants: [],
  observations: [],
  reviews: [],
  comments: [],
  nodes: [],
  telemetry: {},
  alerts: [],
  alertNotes: [],
  notifications: [],
  tags: [],
  audit: [],
};
