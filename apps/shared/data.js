// apps/shared/data.js
// Database schema constants and the initial store state. Profiles and
// live records are loaded from the API after sign-in.
// Public plants ensure visitors can view published specimens and the map
// without needing to sign in and out first (CTIP-33 / visitor catalogue).

// IUCN Red List categories, the only values the API accepts (CTIP-46).
export const CONSERVATION = [
  "least concern", "near threatened", "vulnerable", "endangered", "critically endangered",
  "extinct in the wild", "extinct", "data deficient", "not evaluated",
];
// A new species, before anything is typed into the form.
export const BLANK_SPECIES = {
  scientific_name: "", common_name: "", family: "", genus: "", description: "",
  conservation_status: "least concern", cultural_significance: "",
};

// Statuses whose exact locations are hidden from visitors. Matches the API (distribution.js).
export const THREATENED = ["endangered", "critically endangered"];

// One rule and one wording for hiding a plant's exact location, on the website and
// in the app. The GPS reading is always kept for officers; only the public view
// changes, and the plant's details and photos stay visible.
// Endangered: always on. Vulnerable: on by default. Anything else: the officer's choice.
// `choice` is what the officer ticked on this screen (null until they change it).
export const HIDE_LOCATION_LABEL = "Hide the exact location from the public";
export function hideLocationRule(status, override, choice = null) {
  const locked = THREATENED.includes(status);
  const byDefault = status === "vulnerable";
  const first = locked ? "Always on for endangered species. " : byDefault ? "On by default for vulnerable species. " : "";
  return {
    locked,
    on: locked || (choice ?? (!!override || byDefault)),
    hint: `${first}Plant details and photos stay visible.`,
  };
}

// The same two sentences everywhere a plant's location is not shown exactly.
export const REDUCED_LOCATION_NOTE = "Approximate area, about 1.1 km across. The exact spot is protected.";
export const HIDDEN_LOCATION_NOTE = "Location hidden to protect this plant.";

// What a field photo can be tagged as showing. The API accepts only these.
export const PHOTO_TRAITS = ["Whole plant", "Tree trunk", "Bark", "Leaf", "Flower", "Fruit", "Seed", "Root"];
export const PHOTO_CAPTION_MAX = 200;
export const OBS_STATUS = ["draft", "queued", "synced", "returned", "approved", "rejected"];

export const initialPublicPlants = [
  {
    id: "ae8b1560-cd9f-4d81-93ec-c607287be60b",
    qr_id: "NIAH-0007",
    species_id: "856575c4-4982-49a6-95b5-88eb3a0b7f6e",
    lat: 3.8031,
    lng: 113.7762,
    gps_accuracy_m: 10,
    endangered_override: false,
    is_deleted: false,
    photos: [{ url: "https://cgtvoirktzqjqaosslfh.supabase.co/storage/v1/object/public/observation-photos/c9bda904-ad4c-416f-ad92-eb2bb3bde23d/391d3123-9ba3-4b3c-9c32-e0cf1ac97f38.png" }],
  },
  {
    id: "a357cc4a-17f4-45ef-b26e-3824557425f9",
    qr_id: "NIAH-0018",
    species_id: "adef4969-7b3a-404e-8803-505cd5923661",
    lat: 3.8031,
    lng: 113.7762,
    gps_accuracy_m: 10,
    endangered_override: false,
    is_deleted: false,
    photos: [{ url: "https://cgtvoirktzqjqaosslfh.supabase.co/storage/v1/object/public/observation-photos/9277c963-fcc5-465b-a3ab-00a19a337473/60b2abeb-753a-48bc-9141-b2cef31934f8.png" }],
  },
  {
    id: "082df666-9be2-47e2-9827-5df1cad1da74",
    qr_id: "NIAH-0022",
    species_id: "856575c4-4982-49a6-95b5-88eb3a0b7f6e",
    lat: 3.8031,
    lng: 113.7762,
    gps_accuracy_m: 10,
    endangered_override: false,
    is_deleted: false,
    photos: [{ url: "https://cgtvoirktzqjqaosslfh.supabase.co/storage/v1/object/public/observation-photos/b5baa38b-0727-4155-a449-f0d2833c75f1/6a578819-6a9b-4bf5-8ef3-05b42d4811a5.png" }],
  },
  {
    id: "5a3ea444-3d33-4c27-889b-371eb6d80021",
    qr_id: "NIAH-0031",
    species_id: "adef4969-7b3a-404e-8803-505cd5923661",
    lat: 3.8031,
    lng: 113.7762,
    gps_accuracy_m: 10,
    endangered_override: false,
    is_deleted: false,
    photos: [{ url: "https://cgtvoirktzqjqaosslfh.supabase.co/storage/v1/object/public/observation-photos/917c291b-2c89-48fe-ab62-4d3fddb08e70/8ab79be3-9a1e-4489-9542-8a8f1d9091e8.jpg" }],
  },
  {
    id: "40286f46-e171-417f-911a-4d7de60425db",
    qr_id: "NIAH-0032",
    species_id: "29916744-f6a0-4ee1-bef3-45e3cc407509",
    lat: 1.53211717330677,
    lng: 110.357498917043,
    gps_accuracy_m: 82,
    endangered_override: false,
    is_deleted: false,
    photos: [{ url: "https://cgtvoirktzqjqaosslfh.supabase.co/storage/v1/object/public/observation-photos/c331b42d-9f36-44d1-b40b-b29e9479d974/69fe8db7-53c3-483e-9ce5-456bf71d5c07.jpg" }],
  },
  {
    id: "0095c710-9f1b-4a7e-9e29-72e1a637fe24",
    qr_id: "NIAH-0021",
    species_id: "856575c4-4982-49a6-95b5-88eb3a0b7f6e",
    lat: 3.8031,
    lng: 113.7762,
    gps_accuracy_m: 10,
    endangered_override: false,
    is_deleted: false,
    photos: [{ url: "https://cgtvoirktzqjqaosslfh.supabase.co/storage/v1/object/public/observation-photos/cdd6e814-7afb-47b5-ba8a-055168ba3b83/9eb89742-7324-4bf3-b623-dbf847bb260a.jpg" }],
  },
  {
    id: "e3d74293-d116-413c-b9c0-465ecbcd49e9",
    qr_id: "NIAH-0036",
    species_id: "2a71fee7-cb51-42cf-8c66-d578ceb92797",
    lat: 1.48666,
    lng: 110.32359,
    gps_accuracy_m: 100,
    endangered_override: false,
    is_deleted: false,
    photos: [{ url: "https://cgtvoirktzqjqaosslfh.supabase.co/storage/v1/object/public/observation-photos/d2db9e0e-4d9c-4866-91ae-3307f5ff5066/40ac7894-5616-4f83-aa80-7a23e751a71b.jpg" }],
  },
];

export const initialPublicObservations = [
  { id: "c9bda904-ad4c-416f-ad92-eb2bb3bde23d", specimen_id: "ae8b1560-cd9f-4d81-93ec-c607287be60b", status: "approved", height_cm: 245, morphology: "wgwggew", observed_at: "2026-10-27T14:09:58.219Z", is_deleted: false },
  { id: "9277c963-fcc5-465b-a3ab-00a19a337473", specimen_id: "a357cc4a-17f4-45ef-b26e-3824557425f9", status: "approved", height_cm: 18, morphology: "18", observed_at: "2026-10-28T12:54:11.437Z", is_deleted: false },
  { id: "b5baa38b-0727-4155-a449-f0d2833c75f1", specimen_id: "082df666-9be2-47e2-9827-5df1cad1da74", status: "approved", height_cm: 12456, morphology: "awdawd ", observed_at: "2026-10-28T15:37:19.064Z", is_deleted: false },
  { id: "917c291b-2c89-48fe-ab62-4d3fddb08e70", specimen_id: "5a3ea444-3d33-4c27-889b-371eb6d80021", status: "approved", height_cm: 12345678, morphology: "flag", observed_at: "2026-10-28T16:03:08.382Z", is_deleted: false },
  { id: "c331b42d-9f36-44d1-b40b-b29e9479d974", specimen_id: "40286f46-e171-417f-911a-4d7de60425db", status: "approved", height_cm: 210, morphology: "Single tall spathe, purple inside", observed_at: "2026-10-29T08:20:49.527Z", is_deleted: false },
  { id: "cdd6e814-7afb-47b5-ba8a-055168ba3b83", specimen_id: "0095c710-9f1b-4a7e-9e29-72e1a637fe24", status: "approved", height_cm: 12345, morphology: "awda", observed_at: "2026-10-29T15:48:15.522Z", is_deleted: false },
  { id: "d2db9e0e-4d9c-4866-91ae-3307f5ff5066", specimen_id: "e3d74293-d116-413c-b9c0-465ecbcd49e9", status: "approved", height_cm: 699, morphology: "Peat swamp hardwood with pale, fine-grained timber.", observed_at: "2026-10-30T14:27:42.075Z", is_deleted: false },
];

export const seed = {
  profiles: [],
  species: [],
  species_media: [],
  zones: [],
  plants: initialPublicPlants,
  observations: initialPublicObservations,
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
