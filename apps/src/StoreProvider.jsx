import { useRef, useState } from "react";
import { StoreContext } from "./store.js";
import { seed, DEMO_USER, DEFAULT_PW } from "./data.js";
import { DB_TO_ROLE, ROLE_TO_DB } from "./permissions.js";
import { nextTagIds } from "./selectors.js";
import { uid, nowIso } from "./utils.js";

// Holds the sample database in memory. Every change a page makes goes through
// one of the actions below, so it is easy to swap each one for a Supabase call.
export default function StoreProvider({ children }) {
  const [db, setDb] = useState(seed);
  const [userId, setUserId] = useState(null);
  const [toast, setToast] = useState("");
  const timer = useRef(null);

  const me = db.profiles.find((p) => p.id === userId) || null;
  const role = me ? DB_TO_ROLE[me.role] : "visitor";

  const notify = (message) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 2600);
  };

  const auditRow = (table_name, record_id, action, old_value, new_value) => ({
    id: uid(), changed_by: userId, table_name, record_id, action, old_value, new_value, changed_at: nowIso(),
  });

  const noteRow = (user_id, type, title, body, related_table, related_id) => ({
    id: uid(), user_id, type, title, body, related_table, related_id, is_read: false, created_at: nowIso(),
  });

  const officerIds = () => db.profiles.filter((p) => p.role === "conservation_officer" && p.is_active).map((p) => p.id);

  /* ---------- session ---------- */
  const setRole = (key) => setUserId(key === "visitor" ? null : DEMO_USER[key]);
  const logout = () => setUserId(null);
  const login = (email, password) => {
    const user = db.profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || password.length < 4) return { ok: false, message: "Email or password is incorrect" };
    if (!user.is_active) return { ok: false, message: "This account is turned off. Ask an admin to turn it on." };
    return { ok: true, id: user.id, first: password === DEFAULT_PW };
  };
  const signIn = (id) => setUserId(id);

  /* ---------- plants and photos ---------- */
  const setPlantPhotos = (plantId, photos) => {
    const row = auditRow("observation_photos", plantId, "update", null, { count: photos.length, primary: photos[0]?.id });
    setDb((d) => ({
      ...d,
      plants: d.plants.map((p) => (p.id === plantId ? { ...p, photos } : p)),
      audit: [row, ...d.audit],
    }));
  };

  const addPlant = ({ qr_id, proposed_species, morphology, height_cm, notes, photos, lat, lng, gps_accuracy_m }) => {
    const specimenId = uid();
    const obsId = uid();
    const now = nowIso();
    const specimen = {
      id: specimenId, qr_id, species_id: null, proposed_species, registered_by: userId, lat, lng, gps_accuracy_m,
      endangered_override: false, is_deleted: false,
      photos: photos.map((p) => ({ id: uid(), observation_id: obsId, url: p.url, created_at: now, is_primary: false })),
    };
    const obs = {
      id: obsId, specimen_id: specimenId, recorded_by: userId, observed_at: now, height_cm: Number(height_cm) || null,
      morphology, notes, gps_accuracy_m, status: "synced", version: 1, device_id: "web", last_synced_at: now,
    };
    const notes_ = officerIds().map((id) => noteRow(id, "observation_submitted", "New record to review", `${qr_id} was added.`, "observations", obsId));
    setDb((d) => ({
      ...d,
      plants: [...d.plants, specimen],
      observations: [...d.observations, obs],
      tags: d.tags.some((t) => t.qr_id === qr_id)
        ? d.tags.map((t) => (t.qr_id === qr_id ? { ...t, status: "assigned" } : t))
        : [...d.tags, { qr_id, status: "assigned", batch_label: "field", created_by: userId, created_at: now }],
      notifications: [...notes_, ...d.notifications],
      audit: [auditRow("specimens", specimenId, "insert", null, { qr_id }), ...d.audit],
    }));
  };

  // The officer confirms which species a tagged plant is (specimens.species_id).
  const setPlantSpecies = (plantId, speciesId) => {
    const plant = db.plants.find((p) => p.id === plantId);
    const row = auditRow("specimens", plantId, "update", { species_id: plant?.species_id }, { species_id: speciesId });
    setDb((d) => ({
      ...d,
      plants: d.plants.map((p) => (p.id === plantId ? { ...p, species_id: speciesId } : p)),
      audit: [row, ...d.audit],
    }));
  };

  /* ---------- observations and review ---------- */
  const syncObservation = (id) => {
    const now = nowIso();
    const obs = db.observations.find((o) => o.id === id);
    const notes_ = officerIds().map((u) => noteRow(u, "observation_submitted", "New record to review", "A record was synced from the field.", "observations", id));
    setDb((d) => ({
      ...d,
      observations: d.observations.map((o) => (o.id === id ? { ...o, status: "synced", last_synced_at: now } : o)),
      notifications: [...notes_, ...d.notifications],
      audit: [auditRow("observations", id, "update", { status: obs?.status }, { status: "synced" }), ...d.audit],
    }));
  };

  const resubmit = (id, message) => {
    const now = nowIso();
    const notes_ = officerIds().map((u) => noteRow(u, "observation_submitted", "Record sent again", "A returned record was corrected.", "observations", id));
    setDb((d) => ({
      ...d,
      observations: d.observations.map((o) => (o.id === id ? { ...o, status: "synced", version: o.version + 1, last_synced_at: now } : o)),
      comments: message ? [...d.comments, { id: uid(), observation_id: id, author_id: userId, body: message, created_at: now }] : d.comments,
      notifications: [...notes_, ...d.notifications],
      audit: [auditRow("observations", id, "update", { status: "returned" }, { status: "synced" }), ...d.audit],
    }));
  };

  const reviewObservation = (id, decision, comment) => {
    const status = { approve: "approved", return: "returned", reject: "rejected" }[decision];
    const obs = db.observations.find((o) => o.id === id);
    const plant = db.plants.find((p) => p.id === obs?.specimen_id);
    const now = nowIso();
    const verb = { approve: "approved", return: "returned", reject: "rejected" }[decision];
    setDb((d) => ({
      ...d,
      observations: d.observations.map((o) => (o.id === id ? { ...o, status } : o)),
      reviews: [...d.reviews, { id: uid(), observation_id: id, reviewer_id: userId, observation_ver: obs.version, decision, comment, created_at: now }],
      comments: comment ? [...d.comments, { id: uid(), observation_id: id, author_id: userId, body: comment, created_at: now }] : d.comments,
      notifications: [noteRow(obs.recorded_by, `review_${verb}`, `Record ${verb}`, `${plant?.qr_id || "Your record"}${comment ? `: ${comment}` : ""}`, "observations", id), ...d.notifications],
      audit: [auditRow("observations", id, "update", { status: obs.status }, { status }), ...d.audit],
    }));
  };

  const addComment = (id, body) =>
    setDb((d) => ({ ...d, comments: [...d.comments, { id: uid(), observation_id: id, author_id: userId, body, created_at: nowIso() }] }));

  /* ---------- species ---------- */
  const saveSpecies = (sp) => {
    const isNew = !sp.id;
    const id = sp.id || uid();
    const row = auditRow("species", id, isNew ? "insert" : "update", null, { scientific_name: sp.scientific_name });
    setDb((d) => ({
      ...d,
      species: isNew
        ? [...d.species, { ...sp, id, is_published: false, is_deleted: false }]
        : d.species.map((s) => (s.id === id ? { ...s, ...sp } : s)),
      audit: [row, ...d.audit],
    }));
  };

  const togglePublish = (id) => {
    const sp = db.species.find((s) => s.id === id);
    const row = auditRow("species", id, "update", { is_published: sp.is_published }, { is_published: !sp.is_published });
    setDb((d) => ({ ...d, species: d.species.map((s) => (s.id === id ? { ...s, is_published: !s.is_published } : s)), audit: [row, ...d.audit] }));
  };

  const deleteSpecies = (id) => {
    const row = auditRow("species", id, "delete", { is_deleted: false }, { is_deleted: true });
    setDb((d) => ({ ...d, species: d.species.map((s) => (s.id === id ? { ...s, is_deleted: true } : s)), audit: [row, ...d.audit] }));
  };

  /* ---------- users ---------- */
  const addUser = ({ full_name, email, roleKey }) => {
    if (db.profiles.some((p) => p.email.toLowerCase() === email.trim().toLowerCase())) return false;
    const id = uid();
    const now = nowIso();
    const row = auditRow("profiles", id, "insert", null, { email, role: ROLE_TO_DB[roleKey] });
    setDb((d) => ({
      ...d,
      profiles: [...d.profiles, { id, full_name, email: email.trim(), role: ROLE_TO_DB[roleKey], is_active: true, created_at: now }],
      audit: [row, ...d.audit],
    }));
    return true;
  };

  const updateUser = (id, patch) => {
    const before = db.profiles.find((p) => p.id === id);
    const old_value = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]]));
    const row = auditRow("profiles", id, "update", old_value, patch);
    setDb((d) => ({ ...d, profiles: d.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)), audit: [row, ...d.audit] }));
  };

  /* ---------- monitoring ---------- */
  const ackAlert = (id) => {
    const now = nowIso();
    const row = auditRow("alerts", id, "update", { status: "open" }, { status: "acknowledged" });
    setDb((d) => ({ ...d, alerts: d.alerts.map((a) => (a.id === id ? { ...a, status: "acknowledged", acknowledged_by: userId, acknowledged_at: now } : a)), audit: [row, ...d.audit] }));
  };

  const resolveAlert = (id, outcome) => {
    const row = auditRow("alerts", id, "update", null, { status: "resolved", outcome });
    setDb((d) => ({ ...d, alerts: d.alerts.map((a) => (a.id === id ? { ...a, status: "resolved", outcome } : a)), audit: [row, ...d.audit] }));
  };

  const assignAlert = (id, assignee) => {
    const note = noteRow(assignee, "alert_assigned", "Alert assigned to you", "Please investigate this alert.", "alerts", id);
    setDb((d) => ({ ...d, alerts: d.alerts.map((a) => (a.id === id ? { ...a, assigned_to: assignee } : a)), notifications: [note, ...d.notifications] }));
  };

  const addAlertNote = (id, note) =>
    setDb((d) => ({ ...d, alertNotes: [...d.alertNotes, { id: uid(), alert_id: id, author_id: userId, note, created_at: nowIso() }] }));

  const setThresholds = (nodeId, thresholds) =>
    setDb((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, thresholds } : n)) }));

  /* ---------- notifications and tags ---------- */
  const markRead = (id) => setDb((d) => ({ ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)) }));
  const markAllRead = () => setDb((d) => ({ ...d, notifications: d.notifications.map((n) => (n.user_id === userId ? { ...n, is_read: true } : n)) }));

  const generateTags = (count, batch_label) => {
    const ids = nextTagIds(db.tags, count);
    const now = nowIso();
    setDb((d) => ({
      ...d,
      tags: [...d.tags, ...ids.map((qr_id) => ({ qr_id, status: "unused", batch_label, created_by: userId, created_at: now }))],
    }));
    return ids;
  };

  const retireTag = (qr_id) =>
    setDb((d) => ({ ...d, tags: d.tags.map((t) => (t.qr_id === qr_id ? { ...t, status: "retired" } : t)) }));

  const value = {
    db, me, role, toast, notify,
    setRole, logout, login, signIn,
    setPlantPhotos, addPlant, setPlantSpecies,
    syncObservation, resubmit, reviewObservation, addComment,
    saveSpecies, togglePublish, deleteSpecies,
    addUser, updateUser,
    ackAlert, resolveAlert, assignAlert, addAlertNote, setThresholds,
    markRead, markAllRead, generateTags, retireTag,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
