// Sample data shaped like the database tables (see database_schema_documentation.pdf).
// Every key below is a table name or a column name from the schema, so when the
// Supabase tables are connected each list can be replaced by a query.
// All plant names, people and readings here are made up for the demo.

const IMG = [
  "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=70",
  "https://images.unsplash.com/photo-1466781783364-36c955e42a7f?auto=format&fit=crop&w=800&q=70",
  "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=70",
  "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&q=70",
];

export const DEFAULT_PW = "Niah@1234";

// Demo sign-in used by the "View as" switch: role key -> profiles.id
export const DEMO_USER = { botanist: "u2", officer: "u4", admin: "u1" };

export const CONSERVATION = ["least concern", "near threatened", "vulnerable", "endangered"];
export const OBS_STATUS = ["draft", "queued", "synced", "returned", "approved", "rejected"];

// 24 hourly readings for a sensor node (fixed numbers, so the demo looks the same every time)
const readings = (base, amp, spikeAt, spike, moist) =>
  Array.from({ length: 24 }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 9, 6, 2 + i)).toISOString(),
    temperature: +(base + Math.sin(i / 3.8) * amp + (i === spikeAt ? spike : 0)).toFixed(1),
    soil_moisture: +(moist - i * 0.2 + Math.cos(i / 4) * 1.6).toFixed(1),
  }));

export const seed = {
  profiles: [
    { id: "u1", full_name: "Ahmad Faizal", email: "admin@sfc.my", role: "admin", is_active: true, created_at: "2026-08-01T02:00:00Z" },
    { id: "u2", full_name: "Siti Aminah", email: "botanist@sfc.my", role: "botanist", is_active: true, created_at: "2026-08-03T02:00:00Z" },
    { id: "u3", full_name: "Jonathan Rajang", email: "jonathan@sfc.my", role: "botanist", is_active: true, created_at: "2026-08-03T03:00:00Z" },
    { id: "u4", full_name: "Dayang Norsyafiqah", email: "officer@sfc.my", role: "conservation_officer", is_active: true, created_at: "2026-08-02T02:00:00Z" },
    { id: "u5", full_name: "Lim Chee Wei", email: "cheewei@sfc.my", role: "botanist", is_active: false, created_at: "2026-08-10T02:00:00Z" },
  ],

  species: [
    { id: "sp1", scientific_name: "Nepenthes ampullaria", common_name: "Ampullaria pitcher plant", family: "Nepenthaceae", genus: "Nepenthes", description: "A pitcher plant of peat swamp and heath forest. It forms clusters of rounded ground pitchers that collect fallen leaves.", conservation_status: "least concern", cultural_significance: "Pitchers are sometimes used to cook rice in the forest.", is_published: true, is_deleted: false },
    { id: "sp2", scientific_name: "Nepenthes rafflesiana", common_name: "Raffles' pitcher plant", family: "Nepenthaceae", genus: "Nepenthes", description: "A climbing pitcher plant with large, barrel-shaped lower pitchers and a wide, ribbed rim.", conservation_status: "least concern", cultural_significance: "", is_published: true, is_deleted: false },
    { id: "sp3", scientific_name: "Rafflesia tuan-mudae", common_name: "Tuan Mudae's rafflesia", family: "Rafflesiaceae", genus: "Rafflesia", description: "A parasitic flowering plant with no leaves or stem. It is known for its very large, rare flower.", conservation_status: "endangered", cultural_significance: "Known locally as a flower that symbolises the rainforest.", is_published: true, is_deleted: false },
    { id: "sp4", scientific_name: "Shorea albida", common_name: "Alan batu", family: "Dipterocarpaceae", genus: "Shorea", description: "A tall peat swamp forest tree that often grows in dense stands.", conservation_status: "endangered", cultural_significance: "Valued for its timber.", is_published: true, is_deleted: false },
    { id: "sp5", scientific_name: "Cratoxylum arborescens", common_name: "Geronggang", family: "Hypericaceae", genus: "Cratoxylum", description: "A medium-sized tree of swamp forest with reddish young leaves.", conservation_status: "vulnerable", cultural_significance: "", is_published: false, is_deleted: false },
  ],

  // One row per tagged plant (specimens table) joined with its photos (observation_photos table).
  plants: [
    { id: "s1", qr_id: "NIAH-0001", species_id: "sp1", proposed_species: "", registered_by: "u2", lat: 3.8052, lng: 113.7731, gps_accuracy_m: 6.5, endangered_override: false, is_deleted: false,
      photos: [
        { id: "ph1", observation_id: "o1", url: IMG[0], created_at: "2026-09-02T03:10:00Z", is_primary: false },
        { id: "ph2", observation_id: "o1", url: IMG[1], created_at: "2026-09-02T03:12:00Z", is_primary: false },
        { id: "ph3", observation_id: "o7", url: IMG[2], created_at: "2026-10-01T04:00:00Z", is_primary: false },
      ] },
    { id: "s2", qr_id: "NIAH-0002", species_id: "sp3", proposed_species: "", registered_by: "u3", lat: 3.811, lng: 113.7802, gps_accuracy_m: 9.1, endangered_override: false, is_deleted: false,
      photos: [
        { id: "ph4", observation_id: "o2", url: IMG[1], created_at: "2026-09-05T02:30:00Z", is_primary: false },
        { id: "ph5", observation_id: "o2", url: IMG[3], created_at: "2026-09-05T02:35:00Z", is_primary: false },
      ] },
    { id: "s3", qr_id: "NIAH-0003", species_id: "sp4", proposed_species: "", registered_by: "u2", lat: 3.7981, lng: 113.769, gps_accuracy_m: 7.8, endangered_override: false, is_deleted: false,
      photos: [{ id: "ph6", observation_id: "o3", url: IMG[2], created_at: "2026-09-08T05:00:00Z", is_primary: false }] },
    { id: "s4", qr_id: "NIAH-0004", species_id: "sp2", proposed_species: "", registered_by: "u2", lat: 3.8023, lng: 113.7855, gps_accuracy_m: 5.2, endangered_override: false, is_deleted: false,
      photos: [
        { id: "ph7", observation_id: "o4", url: IMG[0], created_at: "2026-10-05T03:00:00Z", is_primary: false },
        { id: "ph8", observation_id: "o4", url: IMG[3], created_at: "2026-10-05T03:04:00Z", is_primary: false },
      ] },
    { id: "s5", qr_id: "NIAH-0005", species_id: "sp5", proposed_species: "", registered_by: "u2", lat: 3.8075, lng: 113.765, gps_accuracy_m: 12.4, endangered_override: false, is_deleted: false,
      photos: [{ id: "ph9", observation_id: "o5", url: IMG[1], created_at: "2026-10-03T06:00:00Z", is_primary: false }] },
    { id: "s6", qr_id: "NIAH-0006", species_id: null, proposed_species: "Unknown palm (Calamus?)", registered_by: "u2", lat: 3.795, lng: 113.779, gps_accuracy_m: 10.0, endangered_override: false, is_deleted: false,
      photos: [{ id: "ph10", observation_id: "o6", url: IMG[2], created_at: "2026-10-06T04:20:00Z", is_primary: false }] },
  ],

  observations: [
    { id: "o1", specimen_id: "s1", recorded_by: "u2", observed_at: "2026-09-02T03:05:00Z", height_cm: 180, morphology: "Climbing stem with clustered rounded green pitchers near the ground.", notes: "Growing at the edge of a peat swamp clearing.", gps_accuracy_m: 6.5, status: "approved", version: 1, device_id: "android-01", last_synced_at: "2026-09-02T09:00:00Z" },
    { id: "o2", specimen_id: "s2", recorded_by: "u3", observed_at: "2026-09-05T02:20:00Z", height_cm: 4, morphology: "Single open flower, about 60 cm across, on a host vine root.", notes: "Flower is open. Keep visitors away from the area.", gps_accuracy_m: 9.1, status: "approved", version: 1, device_id: "android-02", last_synced_at: "2026-09-05T08:00:00Z" },
    { id: "o3", specimen_id: "s3", recorded_by: "u2", observed_at: "2026-09-08T04:50:00Z", height_cm: 2200, morphology: "Straight trunk, buttress roots, narrow crown.", notes: "One of several trees in this stand.", gps_accuracy_m: 7.8, status: "approved", version: 1, device_id: "android-01", last_synced_at: "2026-09-08T10:00:00Z" },
    { id: "o4", specimen_id: "s4", recorded_by: "u2", observed_at: "2026-10-05T02:55:00Z", height_cm: 320, morphology: "Barrel-shaped lower pitchers with red-brown speckles.", notes: "Several pitchers are damaged by insects.", gps_accuracy_m: 5.2, status: "synced", version: 1, device_id: "android-01", last_synced_at: "2026-10-05T11:00:00Z" },
    { id: "o5", specimen_id: "s5", recorded_by: "u2", observed_at: "2026-10-03T05:50:00Z", height_cm: 900, morphology: "Medium tree with reddish young leaves.", notes: "Could not see the underside of the leaves.", gps_accuracy_m: 12.4, status: "returned", version: 1, device_id: "android-01", last_synced_at: "2026-10-03T12:00:00Z" },
    { id: "o6", specimen_id: "s6", recorded_by: "u2", observed_at: "2026-10-06T04:10:00Z", height_cm: 650, morphology: "Climbing palm with spiny leaf sheaths.", notes: "Species not confirmed in the field.", gps_accuracy_m: 10.0, status: "synced", version: 1, device_id: "android-01", last_synced_at: "2026-10-06T10:00:00Z" },
    { id: "o7", specimen_id: "s1", recorded_by: "u2", observed_at: "2026-10-01T03:50:00Z", height_cm: 185, morphology: "Two new pitchers have formed since the last visit.", notes: "", gps_accuracy_m: 6.1, status: "draft", version: 1, device_id: "android-01", last_synced_at: null },
    { id: "o8", specimen_id: "s2", recorded_by: "u2", observed_at: "2026-10-04T02:10:00Z", height_cm: 4, morphology: "Flower is starting to decay.", notes: "Recorded offline, waiting to sync.", gps_accuracy_m: 9.4, status: "queued", version: 1, device_id: "android-01", last_synced_at: null },
  ],

  reviews: [
    { id: "r1", observation_id: "o1", reviewer_id: "u4", observation_ver: 1, decision: "approve", comment: "", created_at: "2026-09-03T02:00:00Z" },
    { id: "r2", observation_id: "o2", reviewer_id: "u4", observation_ver: 1, decision: "approve", comment: "", created_at: "2026-09-06T02:00:00Z" },
    { id: "r3", observation_id: "o3", reviewer_id: "u4", observation_ver: 1, decision: "approve", comment: "", created_at: "2026-09-09T02:00:00Z" },
    { id: "r4", observation_id: "o5", reviewer_id: "u4", observation_ver: 1, decision: "return", comment: "Please add a photo of the leaf underside.", created_at: "2026-10-04T02:00:00Z" },
  ],

  comments: [
    { id: "c1", observation_id: "o5", author_id: "u4", body: "Please add a photo of the leaf underside.", created_at: "2026-10-04T02:00:00Z" },
    { id: "c2", observation_id: "o5", author_id: "u2", body: "Will add it on my next visit.", created_at: "2026-10-04T05:00:00Z" },
  ],

  nodes: [
    { id: "n1", name: "Node 1", specimen_id: "s2", status: "active", thresholds: { temp_max: 33, moisture_min: 40 }, last_seen: "2026-10-07T07:40:00Z" },
    { id: "n2", name: "Node 2", specimen_id: "s3", status: "active", thresholds: { temp_max: 34, moisture_min: 35 }, last_seen: "2026-10-07T07:41:00Z" },
    { id: "n3", name: "Node 3", specimen_id: "s1", status: "offline", thresholds: { temp_max: 34, moisture_min: 35 }, last_seen: "2026-10-05T14:10:00Z" },
  ],

  telemetry: {
    n1: readings(28.5, 2.2, 15, 6, 58),
    n2: readings(27.8, 1.8, 99, 0, 52),
    n3: readings(28.0, 2.0, 99, 0, 47).slice(0, 14),
  },

  alerts: [
    { id: "a1", node_id: "n1", type: "Temperature spike", reading: { temperature: 36.4, soil_moisture: 44.2 }, severity: "high", status: "open", assigned_to: "u4", acknowledged_by: null, acknowledged_at: null, outcome: "", created_at: "2026-10-07T01:12:00Z" },
    { id: "a2", node_id: "n2", type: "Movement near plant", reading: { motion: true, temperature: 27.9 }, severity: "medium", status: "acknowledged", assigned_to: "u4", acknowledged_by: "u1", acknowledged_at: "2026-10-06T10:20:00Z", outcome: "", created_at: "2026-10-06T10:05:00Z" },
    { id: "a3", node_id: "n2", type: "Vibration anomaly", reading: { vibration: 0.8 }, severity: "low", status: "resolved", assigned_to: "u4", acknowledged_by: "u4", acknowledged_at: "2026-10-04T08:20:00Z", outcome: "False alarm - wildlife", created_at: "2026-10-04T08:00:00Z" },
  ],

  alertNotes: [
    { id: "an1", alert_id: "a2", author_id: "u1", note: "Asked a ranger to check the trail this afternoon.", created_at: "2026-10-06T10:30:00Z" },
    { id: "an2", alert_id: "a3", author_id: "u4", note: "Ranger found animal tracks near the node.", created_at: "2026-10-04T09:10:00Z" },
  ],

  notifications: [
    { id: "nt1", user_id: "u2", type: "review_returned", title: "Record returned", body: "NIAH-0005 needs a photo of the leaf underside.", related_table: "observations", related_id: "o5", is_read: false, created_at: "2026-10-04T02:00:00Z" },
    { id: "nt2", user_id: "u2", type: "review_approved", title: "Record approved", body: "NIAH-0003 is now published.", related_table: "observations", related_id: "o3", is_read: true, created_at: "2026-09-09T02:00:00Z" },
    { id: "nt3", user_id: "u4", type: "observation_submitted", title: "New record to review", body: "NIAH-0004 was synced from the field.", related_table: "observations", related_id: "o4", is_read: false, created_at: "2026-10-05T11:00:00Z" },
    { id: "nt4", user_id: "u4", type: "alert_assigned", title: "Alert assigned to you", body: "Temperature spike at Node 1.", related_table: "alerts", related_id: "a1", is_read: false, created_at: "2026-10-07T01:13:00Z" },
    { id: "nt5", user_id: "u1", type: "alert_open", title: "New alert", body: "Temperature spike at Node 1 (high).", related_table: "alerts", related_id: "a1", is_read: false, created_at: "2026-10-07T01:13:00Z" },
  ],

  tags: [
    { qr_id: "NIAH-0001", status: "assigned", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0002", status: "assigned", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0003", status: "assigned", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0004", status: "assigned", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0005", status: "assigned", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0006", status: "assigned", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0007", status: "unused", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0008", status: "unused", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0009", status: "unused", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
    { qr_id: "NIAH-0010", status: "retired", batch_label: "2026-08-A", created_by: "u4", created_at: "2026-08-20T02:00:00Z" },
  ],

  audit: [
    { id: "au1", changed_by: "u4", table_name: "observations", record_id: "o3", action: "update", old_value: { status: "synced" }, new_value: { status: "approved" }, changed_at: "2026-09-09T02:00:00Z" },
    { id: "au2", changed_by: "u4", table_name: "observations", record_id: "o5", action: "update", old_value: { status: "synced" }, new_value: { status: "returned" }, changed_at: "2026-10-04T02:00:00Z" },
    { id: "au3", changed_by: "u1", table_name: "profiles", record_id: "u5", action: "update", old_value: { is_active: true }, new_value: { is_active: false }, changed_at: "2026-10-02T03:00:00Z" },
  ],
};
