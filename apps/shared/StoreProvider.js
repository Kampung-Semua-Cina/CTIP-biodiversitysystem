// apps/shared/StoreProvider.js
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StoreContext } from "./store.js";
import { seed, seedPasswords, DEMO_USER, DEFAULT_PW } from "./data.js";
import { nextTagIds } from "./selectors.js";
import { can } from "./permissions.js";
import { uid, nowIso, photoProblem, CAPTION_MAX } from "./utils.js";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  fetchPublicSpecies,
  fetchPublicSpeciesById,
  fetchMe,
  pingBackend,
} from "./api.js";

// Holds the sample database in memory with seamless integration to the backend API.
// Live backend data from /v1/public/species and /v1/me synchronizes when available,
// falling back gracefully to local sample data when offline or not yet implemented.
// deviceId is written on new records ("web" or "mobile").
export default function StoreProvider({ children, deviceId = "mobile" }) {
  const [db, setDb] = useState(seed);
  const [passwords, setPasswords] = useState(seedPasswords); // stands in for Supabase Auth
  const [userId, setUserId] = useState(null);
  const [toast, setToast] = useState("");
  const [apiStatus, setApiStatus] = useState("checking"); // "checking" | "connected" | "offline"
  const [apiError, setApiError] = useState(null);
  const [authToken, setAuthTokenState] = useState(getAuthToken());
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendSpeciesCount, setBackendSpeciesCount] = useState(0);
  const timer = useRef(null);

  const me = db.profiles.find((p) => p.id === userId) || null;
  const role = me ? me.role : "visitor";

  const notify = (message) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 2600);
  };

  const syncWithBackend = useCallback(async (quiet = false) => {
    setIsSyncing(true);
    try {
      const ping = await pingBackend();
      if (!ping.online) {
        setApiStatus("offline");
        setApiError(ping.message || "Backend API is offline");
        if (!quiet) notify("Backend API is offline — using local sample data");
        return { ok: false, offline: true };
      }

      setApiStatus("connected");
      setApiError(null);

      // 1. Fetch live public species: GET /v1/public/species
      const spRes = await fetchPublicSpecies();
      if (spRes.ok && Array.isArray(spRes.data)) {
        setBackendSpeciesCount(spRes.data.length);
        setDb((prevDb) => {
          const map = new Map(prevDb.species.map((s) => [s.scientific_name.toLowerCase(), s]));
          for (const item of spRes.data) {
            const key = item.scientific_name?.toLowerCase();
            const existing = map.get(key) || prevDb.species.find((s) => s.id === item.id);
            if (existing) {
              map.set(key, {
                ...existing,
                ...item,
                is_published: true,
                is_deleted: false,
              });
            } else {
              map.set(key, {
                id: item.id || uid(),
                scientific_name: item.scientific_name,
                common_name: item.common_name || "",
                family: item.family || "",
                genus: item.genus || item.scientific_name.split(" ")[0] || "",
                description: item.description || "",
                conservation_status: item.conservation_status || "least concern",
                cultural_significance: item.cultural_significance || "",
                is_published: true,
                is_deleted: false,
              });
            }
          }
          return { ...prevDb, species: Array.from(map.values()) };
        });
      }

      // 2. If token exists, sync active user profile: GET /v1/me
      const curToken = getAuthToken();
      if (curToken) {
        const meRes = await fetchMe(curToken);
        if (meRes.ok && meRes.data) {
          const profile = meRes.data;
          setDb((prevDb) => {
            const exists = prevDb.profiles.some((p) => p.id === profile.id);
            return {
              ...prevDb,
              profiles: exists
                ? prevDb.profiles.map((p) => (p.id === profile.id ? { ...p, ...profile } : p))
                : [...prevDb.profiles, profile],
            };
          });
          setUserId(profile.id);
        } else if (meRes.code === "TOKEN_EXPIRED") {
          clearAuthToken();
          setAuthTokenState(null);
          setUserId(null);
          if (!quiet) notify("Backend session expired. Please sign in again.");
        }
      }

      if (!quiet) notify("Synchronized with Backend API");
      return { ok: true };
    } catch (err) {
      setApiStatus("offline");
      setApiError(err?.message || "Failed to sync with API");
      return { ok: false, error: err };
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    syncWithBackend(true);
  }, [syncWithBackend]);

  const auditRow = (table_name, record_id, action, old_value, new_value) => ({
    id: uid(), changed_by: userId, table_name, record_id, action, old_value, new_value, changed_at: nowIso(),
  });

  const noteRow = (user_id, type, title, body, related_table, related_id) => ({
    id: uid(), user_id, type, title, body, related_table, related_id, is_read: false, created_at: nowIso(),
  });

  const officerIds = () => db.profiles.filter((p) => p.role === "officer" && p.is_active).map((p) => p.id);

  /* ---------- session ---------- */
  const setRole = (key) => {
    clearAuthToken();
    setAuthTokenState(null);
    setUserId(key === "visitor" ? null : DEMO_USER[key]);
  };

  const logout = () => {
    clearAuthToken();
    setAuthTokenState(null);
    setUserId(null);
  };

  // Authenticate using a Supabase JWT / Access Token against GET /v1/me
  const loginWithToken = async (token) => {
    if (!token || !token.trim()) return { ok: false, message: "Provide an access token" };
    const cleanToken = token.trim();
    setIsSyncing(true);
    try {
      const res = await fetchMe(cleanToken);
      if (!res.ok) {
        const msg = res.message || "Failed to authenticate with backend API";
        notify(msg);
        return { ok: false, message: msg, code: res.code };
      }
      const profile = res.data;
      setAuthToken(cleanToken);
      setAuthTokenState(cleanToken);
      setDb((prevDb) => {
        const exists = prevDb.profiles.some((p) => p.id === profile.id);
        return {
          ...prevDb,
          profiles: exists
            ? prevDb.profiles.map((p) => (p.id === profile.id ? { ...p, ...profile } : p))
            : [...prevDb.profiles, profile],
        };
      });
      setUserId(profile.id);
      setApiStatus("connected");
      notify(`Signed in as ${profile.full_name || profile.email} (${profile.role})`);
      return { ok: true, profile };
    } catch (err) {
      const msg = err?.message || "Error connecting to backend API";
      notify(msg);
      return { ok: false, message: msg };
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch full details of one species: GET /v1/public/species/:id
  const getBackendSpeciesById = async (id) => {
    if (!id) return null;
    try {
      const res = await fetchPublicSpeciesById(id);
      if (res.ok && res.data) {
        const detail = res.data;
        setDb((prevDb) => {
          const updatedSpecies = prevDb.species.map((s) => (s.id === detail.id ? { ...s, ...detail } : s));
          let updatedMedia = prevDb.species_media;
          if (Array.isArray(detail.media) && detail.media.length > 0) {
            const otherMedia = prevDb.species_media.filter((m) => m.species_id !== detail.id);
            updatedMedia = [...otherMedia, ...detail.media];
          }
          return { ...prevDb, species: updatedSpecies, species_media: updatedMedia };
        });
        return detail;
      }
      return null;
    } catch {
      return null;
    }
  };

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
      photos: (photos || []).map((p) => ({ id: uid(), observation_id: obsId, url: p.url, created_at: now, is_primary: false })),
    };
    const obs = {
      id: obsId, specimen_id: specimenId, recorded_by: userId, observed_at: now, height_cm: Number(height_cm) || null,
      morphology, notes, gps_accuracy_m, status: "synced", version: 1, device_id: deviceId, last_synced_at: now,
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

  // A return visit to a plant that is already tagged: a new observation of the same specimen.
  // Supabase: insert into observations (and observation_photos) with a client idempotency key.
  const addRevisit = ({ specimen_id, height_cm, morphology, notes, photos, gps_accuracy_m }) => {
    const obsId = uid();
    const now = nowIso();
    const plant = db.plants.find((p) => p.id === specimen_id);
    const obs = {
      id: obsId, specimen_id, recorded_by: userId, observed_at: now, height_cm: Number(height_cm) || null,
      morphology, notes, gps_accuracy_m, status: "synced", version: 1, device_id: deviceId, last_synced_at: now,
    };
    const added = (photos || []).map((p) => ({ id: uid(), observation_id: obsId, url: p.url, created_at: now, is_primary: false }));
    const notes_ = officerIds().map((id) => noteRow(id, "observation_submitted", "New record to review", `${plant?.qr_id || "A plant"} was revisited.`, "observations", obsId));
    setDb((d) => ({
      ...d,
      plants: d.plants.map((p) => (p.id === specimen_id ? { ...p, photos: [...(p.photos || []), ...added] } : p)),
      observations: [...d.observations, obs],
      notifications: [...notes_, ...d.notifications],
      audit: [auditRow("observations", obsId, "insert", null, { specimen_id, status: "synced" }), ...d.audit],
    }));
    return obsId;
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
      reviews: [...d.reviews, { id: uid(), observation_id: id, reviewer_id: userId, observation_ver: obs?.version || 1, decision, comment, created_at: now }],
      comments: comment ? [...d.comments, { id: uid(), observation_id: id, author_id: userId, body: comment, created_at: now }] : d.comments,
      notifications: obs ? [noteRow(obs.recorded_by, `review_${verb}`, `Record ${verb}`, `${plant?.qr_id || "Your record"}${comment ? `: ${comment}` : ""}`, "observations", id), ...d.notifications] : d.notifications,
      audit: [auditRow("observations", id, "update", { status: obs?.status }, { status }), ...d.audit],
    }));
  };

  // observation_comments insert
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
    const row = auditRow("species", id, "update", { is_published: sp?.is_published }, { is_published: !sp?.is_published });
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

  // Saves a species' captioned catalogue photos in the order given; the first is the cover photo.
  // API (CTIP-46): for each new photo, POST /v1/species/:id/media { content_type, size_bytes, caption, is_primary, sort_order },
  // then PUT the file to the returned upload.url (species-media/{species_id}/{media_id}).
  // The API checks the role, file type and size again; Storage rejects anything over its bucket limits.
  const setSpeciesMedia = (speciesId, list) => {
    if (!can(role, "species")) return { ok: false, message: "Only officers and admins can change species photos" };
    const bad = list.map((p) => p.file && photoProblem(p.file)).find(Boolean);
    if (bad) return { ok: false, message: bad };
    const k = list.findIndex((p) => !p.caption?.trim());
    if (k >= 0) return { ok: false, message: `Add a caption to photo ${k + 1}` };
    if (list.some((p) => p.caption.trim().length > CAPTION_MAX)) return { ok: false, message: `Keep captions under ${CAPTION_MAX} characters` };

    const now = nowIso();
    const rows = list.map((p, i) => ({
      id: p.id, species_id: speciesId, url: p.url, caption: p.caption.trim(), credit: p.credit ?? null,
      is_primary: i === 0, sort_order: i, uploaded_by: p.uploaded_by ?? userId, created_at: p.created_at ?? now,
    }));
    const row = auditRow("species_media", speciesId, "update", null, { count: rows.length, added: list.filter((p) => p.file).length });
    setDb((d) => ({
      ...d,
      species_media: [...d.species_media.filter((m) => m.species_id !== speciesId), ...rows],
      audit: [row, ...d.audit],
    }));
    return { ok: true };
  };

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
    const old_value = before ? Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])) : null;
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
    setPlantPhotos, addPlant, addRevisit, setPlantSpecies,
    syncObservation, resubmit, reviewObservation, addComment,
    saveSpecies, togglePublish, deleteSpecies, restoreSpecies, setSpeciesMedia,
    addUser, updateUser,
    ackAlert, resolveAlert, assignAlert, addAlertNote, setThresholds,
    markRead, markAllRead, generateTags, retireTag, deleteTag,
    apiStatus, apiError, authToken, isSyncing, backendSpeciesCount,
    refreshFromBackend: () => syncWithBackend(false),
    loginWithToken,
    getBackendSpeciesById,
  };

  // Written without JSX so the web (Vite) and mobile (Metro) can both load this .js file.
  return React.createElement(StoreContext.Provider, { value }, children);
}
