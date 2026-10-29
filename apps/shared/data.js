// apps/shared/data.js
// Database schema constants, staff profiles, and clean initial store state.

// Demo user identifier mapping used by the "View as" switch: role key -> profiles.id
export const DEMO_USER = {
  botanist: "b534e73d-1431-43c5-8383-5c68cee64b96",
  officer: "a6a215b0-2b03-4f0e-9a1d-52da140525a4",
  admin: "b8372536-a1c4-41d6-8b14-d700b6379949",
};

export const DEMO_EMAILS = {
  botanist: "botanist123@gmail.com",
  officer: "officer123@gmail.com",
  admin: "admin123456@gmail.com",
};

export const DEMO_PASSWORD = "Niah@1234";

// IUCN Red List categories, the only values the API accepts (CTIP-46).
export const CONSERVATION = [
  "least concern", "near threatened", "vulnerable", "endangered", "critically endangered",
  "extinct in the wild", "extinct", "data deficient", "not evaluated",
];
// Statuses whose exact locations are hidden from visitors. Matches the API (distribution.js).
export const THREATENED = ["endangered", "critically endangered"];
export const OBS_STATUS = ["draft", "queued", "synced", "returned", "approved", "rejected"];

export const initialProfiles = [
  { id: "b8372536-a1c4-41d6-8b14-d700b6379949", full_name: "Admin User", username: "admin", phone: "", avatar_url: null, email: "admin123456@gmail.com", role: "admin", is_active: true, created_at: "2026-10-07T00:00:00Z" },
  { id: "a6a215b0-2b03-4f0e-9a1d-52da140525a4", full_name: "Conservation Officer", username: "officer", phone: "", avatar_url: null, email: "officer123@gmail.com", role: "officer", is_active: true, created_at: "2026-10-07T00:00:00Z" },
  { id: "b534e73d-1431-43c5-8383-5c68cee64b96", full_name: "Field Botanist", username: "botanist", phone: "", avatar_url: null, email: "botanist123@gmail.com", role: "botanist", is_active: true, created_at: "2026-10-07T00:00:00Z" },
  { id: "f444107e-6519-4dfc-aff1-40724daf634d", full_name: "Test User", username: "test", phone: "", avatar_url: null, email: "test123@gmail.com", role: "officer", is_active: false, created_at: "2026-10-07T00:00:00Z" },
];

export const seed = {
  profiles: initialProfiles,
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
