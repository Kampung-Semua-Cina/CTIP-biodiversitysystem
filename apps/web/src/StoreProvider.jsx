// apps/web/src/StoreProvider.jsx
import { useRef, useState } from "react";
import { StoreContext } from "./store.js";
import { seed, seedPasswords, DEMO_USER, DEFAULT_PW } from "./data.js";
import { nextTagIds } from "./selectors.js";
import { can } from "./permissions.js";
import { uid, nowIso } from "./utils.js";

// Holds the sample database in memory. Every change a page makes goes through
// one of the actions below, so it is easy to swap each one for a Supabase call.
export default function StoreProvider({ children }) {
  const [db, setDb] = useState(seed);
  const [passwords, setPasswords] = useState(seedPasswords); // stands in for Supabase Auth
  const [userId, setUserId] = useState(null);
  const [toast, setToast] = useState("");
  const timer = useRef(null);

  const me = db.profiles.find((p) => p.id === userId) || null;
  const role = me ? me.role : "visitor";

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

  const officerIds = () => db.profiles.filter((p) => p.role === "officer" && p.is_active).map((p) => p.id);

  /* ---------- session ---------- */
  const setRole = (key) => setUserId(key === "visitor" ? null : DEMO_USER[key]);
  const logout = () => setUserId(null);
  // Supabase: supabase.auth.signInWithPassword({ email, password }), then read profiles.is_active.
  // Staff can type their username instead of their email; it is looked up to the email first.
  const login = (email, password) => {
    const key = email.trim().toLowerCase();
    const user = db.profiles.find((p) => p.email.toLowerCase() === key || p.username?.toLowerCase() === key);
    if (!user || passwords[user.id] !== password) return { ok: false, message: "Email, username or password is incorrect" };
    if (!user.is_active) return { ok: false, message: "This account is turned off. Ask an admin to turn it on." };
    return { ok: true, id: user.id, first: password === DEFAULT_PW };
  };
  const signIn = (id) => setUserId(id);

  // Supabase: check the current password with signInWithPassword, then supabase.auth.updateUser({ password }).
  // Only the email and the new password are asked for (no current password).
  const changePassword = (email, next) => {
    const user = db.profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return { ok: false, message: "No staff account uses this email" };
    if (!user.is_active) return { ok: false, message: "This account is turned off. Ask an admin to turn it on." };
    if (next.length < 8) return { ok: false, message: "Use at least 8 characters for the new password" };
    setPasswords((pw) => ({ ...pw, [user.id]: next }));
    setDb((d) => ({ ...d, audit: [{ ...auditRow("profiles", user.id, "update", null, { password: "changed" }), changed_by: user.id }, ...d.audit] }));
    return { ok: true, id: user.id };
  };

  /* ---------- own account ---------- */
  // Usernames: 3-20 lowercase letters, numbers, dots or underscores, unique across all staff.
  const USERNAME = /^[a-z0-9._]{3,20}$/;
  const usernameTaken = (name, exceptId) => db.profiles.some((p) => p.id !== exceptId && p.username?.toLowerCase() === name.toLowerCase());

  // Supabase: supabase.from("profiles").update(patch).eq("id", me.id); photo goes to Storage first.
  const updateProfile = (patch) => {
    if (!me) return { ok: false, message: "Sign in first" };
    const clean = { ...patch };
    if ("full_name" in clean) {
      clean.full_name = clean.full_name.trim().replace(/\s+/g, " ");
      if (!clean.full_name) return { ok: false, message: "Enter your name" };
    }
    if ("username" in clean) {
      clean.username = clean.username.trim().toLowerCase();
      if (!USERNAME.test(clean.username)) return { ok: false, message: "Username needs 3-20 letters, numbers, dots or underscores" };
      if (usernameTaken(clean.username, me.id)) return { ok: false, message: "This username is already taken" };
    }
    if ("phone" in clean) {
      clean.phone = clean.phone.trim();
      if (clean.phone && !/^\+?[0-9 -]{7,15}$/.test(clean.phone)) return { ok: false, message: "Enter a valid phone number" };
    }
    const changed = Object.keys(clean).filter((k) => clean[k] !== me[k]);
    if (!changed.length) return { ok: true, unchanged: true };
    // Photos are big data URLs, so the audit row only says that it changed.
    const show = (src) => Object.fromEntries(changed.map((k) => [k, k === "avatar_url" ? (src[k] ? "photo" : null) : src[k]]));
    const row = auditRow("profiles", me.id, "update", show(me), show(clean));
    setDb((d) => ({ ...d, profiles: d.profiles.map((p) => (p.id === me.id ? { ...p, ...clean } : p)), audit: [row, ...d.audit] }));
    return { ok: true };
  };

  // Supabase: re-check the current password with signInWithPassword, then supabase.auth.updateUser({ password }).
  const changeMyPassword = (current, next) => {
    if (!me) return { ok: false, message: "Sign in first" };
    if (passwords[me.id] !== current) return { ok: false, message: "Your current password is incorrect" };
    if (next.length < 8) return { ok: false, message: "Use at least 8 characters for the new password" };
    if (next === current) return { ok: false, message: "Choose a password different from your current one" };
    setPasswords((pw) => ({ ...pw, [me.id]: next }));
    setDb((d) => ({ ...d, audit: [auditRow("profiles", me.id, "update", null, { password: "changed" }), ...d.audit] }));
    return { ok: true };
  };

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

  // observation_comments insert. Like the notify_on_comment trigger in the database,
  // the botanist who recorded the observation is notified when someone else posts.
  const addComment = (id, body) => {
    const obs = db.observations.find((o) => o.id === id);
    const comment = { id: uid(), observation_id: id, author_id: userId, body, created_at: nowIso() };
    const notes_ = obs && obs.recorded_by !== userId
      ? [noteRow(obs.recorded_by, "comment_reply", "New comment on your observation", body, "observations", id)]
      : [];
    setDb((d) => ({ ...d, comments: [...d.comments, comment], notifications: [...notes_, ...d.notifications] }));
  };

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

  // Soft delete and undo. Only officers and admins; the API will enforce this too.
  // Returns false when the role is not allowed.
  const setSpeciesDeleted = (id, is_deleted) => {
    if (!can(role, "species")) return false;
    const sp = db.species.find((s) => s.id === id);
    const row = auditRow("species", id, is_deleted ? "delete" : "restore",
      { scientific_name: sp.scientific_name, is_deleted: !is_deleted }, { is_deleted });
    setDb((d) => ({ ...d, species: d.species.map((s) => (s.id === id ? { ...s, is_deleted } : s)), audit: [row, ...d.audit] }));
    return true;
  };
  const deleteSpecies = (id) => setSpeciesDeleted(id, true);
  const restoreSpecies = (id) => setSpeciesDeleted(id, false);

  /* ---------- users ---------- */
  // New accounts start with the part of the email before "@" as the username (made unique).
  const freeUsername = (email) => {
    const local = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 16);
    const base = local.length >= 3 ? local : local + "user";
    let name = base;
    for (let n = 2; usernameTaken(name); n++) name = base + n;
    return name;
  };
  const addUser = ({ full_name, email, role: newRole }) => {
    if (db.profiles.some((p) => p.email.toLowerCase() === email.trim().toLowerCase())) return false;
    const id = uid();
    const now = nowIso();
    const row = auditRow("profiles", id, "insert", null, { email, role: newRole });
    setPasswords((pw) => ({ ...pw, [id]: DEFAULT_PW }));
    setDb((d) => ({
      ...d,
      profiles: [...d.profiles, { id, full_name, username: freeUsername(email), phone: "", avatar_url: null, email: email.trim(), role: newRole, is_active: true, created_at: now }],
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
    // Deleted tags count too, so a number that may already be printed is never handed out again.
    // Supabase: a database sequence does this.
    const deleted = db.audit.filter((a) => a.table_name === "qr_tags" && a.action === "delete").map((a) => ({ qr_id: a.record_id }));
    const ids = nextTagIds([...db.tags, ...deleted], count);
    const now = nowIso();
    setDb((d) => ({
      ...d,
      tags: [...d.tags, ...ids.map((qr_id) => ({ qr_id, status: "unused", batch_label, created_by: userId, created_at: now }))],
    }));
    return ids;
  };

  // Only tags never put on a plant can be deleted, so no specimen ever points at a missing tag.
  const deleteTag = (qr_id) => {
    const tag = db.tags.find((t) => t.qr_id === qr_id);
    if (!tag || tag.status !== "unused" || !can(role, "tags")) return false;
    const row = auditRow("qr_tags", qr_id, "delete", { status: tag.status, batch_label: tag.batch_label }, null);
    setDb((d) => ({ ...d, tags: d.tags.filter((t) => t.qr_id !== qr_id), audit: [row, ...d.audit] }));
    return true;
  };

  const retireTag = (qr_id) =>
    setDb((d) => ({ ...d, tags: d.tags.map((t) => (t.qr_id === qr_id ? { ...t, status: "retired" } : t)) }));

  const value = {
    db, me, role, toast, notify,
    setRole, logout, login, signIn, changePassword, updateProfile, changeMyPassword,
    setPlantPhotos, addPlant, setPlantSpecies,
    syncObservation, resubmit, reviewObservation, addComment,
    saveSpecies, togglePublish, deleteSpecies, restoreSpecies,
    addUser, updateUser,
    ackAlert, resolveAlert, assignAlert, addAlertNote, setThresholds,
    markRead, markAllRead, generateTags, retireTag, deleteTag,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
