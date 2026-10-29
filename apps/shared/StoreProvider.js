// apps/shared/StoreProvider.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreContext } from "./store.js";
import { seed, DEMO_USER, DEMO_EMAILS, DEMO_PASSWORD, initialProfiles } from "./data.js";
import { visiblePlants, shownCoords } from "./selectors.js";
import { can } from "./permissions.js";
import { uid, nowIso, photoProblem, CAPTION_MAX, withExponentialRetry } from "./utils.js";
import { getSupabase } from "./supabase.js";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  fetchPublicSpecies,
  fetchPublicSpeciesById,
  fetchMe,
  pingBackend,
  submitReviewApi,
  fetchDistribution,
  fetchStaffSpecies,
  createSpeciesApi,
  updateSpeciesApi,
  fetchObservations,
  uploadSpeciesMediaApi,
  updateSpeciesMediaApi,
  deleteSpeciesMediaApi,
  fetchWorkspace,
  updateMeApi,
  createProfileApi,
  updateProfileApi,
  findSpecimenByQrApi,
  createSpecimenApi,
  updateSpecimenApi,
  createObservationApi,
  submitObservationApi,
  addCommentApi,
  uploadObservationPhotoApi,
  filePart,
  publishSpeciesApi,
  deleteSpeciesApi,
  restoreSpeciesApi,
  createTagBatchApi,
  deleteTagApi,
  retireTagApi,
  assignAlertApi,
  acknowledgeAlertApi,
  resolveAlertApi,
  addAlertNoteApi,
  setThresholdsApi,
  fetchNotificationsApi,
  markReadApi,
  markAllReadApi,
} from "./api.js";

const ACTIVE_DEMO_PASSWORD =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEMO_PASSWORD) ||
  (typeof process !== "undefined" && (process.env?.VITE_DEMO_PASSWORD || process.env?.DEMO_PASSWORD)) ||
  DEMO_PASSWORD ||
  "Niah@1234";

// Shown wherever a page needs the Express API and cannot reach it.
export const API_DOWN = "Cannot reach the API server. Start it with npm run api (needs services/api/.env).";
const API_CHECK_MS = 30000;

// The freshest token: Supabase Auth refreshes the session, the stored one can be expired.
const sessionToken = async () =>
  (await getSupabase().auth.getSession())?.data?.session?.access_token || getAuthToken();

// App state, loaded from and saved through the Express API (services/api).
// Supabase is used here only for Auth (sign in, sign out, passwords, the
// session token the API checks); every table and file goes through the API,
// which checks the role and runs each query as the user so RLS applies too.
export default function StoreProvider({ children, deviceId = "mobile" }) {
  const [db, setDb] = useState(seed);
  const [userId, setUserId] = useState(null);
  const [toast, setToast] = useState("");
  const [apiStatus, setApiStatus] = useState("checking");
  const [apiError, setApiError] = useState(null);
  const [authToken, setAuthTokenState] = useState(getAuthToken());
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendSpeciesCount, setBackendSpeciesCount] = useState(0);
  const timer = useRef(null);

  const [prototypeRole, setPrototypeRole] = useState(null);

  const effectiveRole = prototypeRole !== null
    ? prototypeRole
    : (userId ? (db.profiles.find((p) => p.id === userId)?.role || "visitor") : "visitor");

  const me = useMemo(() => {
    if (effectiveRole === "visitor") return null;
    const byId = userId ? db.profiles.find((p) => p.id === userId) : null;
    if (byId) return byId;

    if (prototypeRole) {
      const targetEmail = DEMO_EMAILS[prototypeRole];
      const found =
        db.profiles.find((p) => p.email === targetEmail) ||
        db.profiles.find((p) => p.role === prototypeRole && p.is_active) ||
        db.profiles.find((p) => p.role === prototypeRole) ||
        initialProfiles.find((p) => p.email === targetEmail || p.role === prototypeRole);
      if (found) return found;
      return {
        id: DEMO_USER[prototypeRole] || `demo-${prototypeRole}`,
        full_name: `${prototypeRole.charAt(0).toUpperCase() + prototypeRole.slice(1)} (Demo)`,
        role: prototypeRole,
        email: DEMO_EMAILS[prototypeRole] || `${prototypeRole}@demo.local`,
        is_active: true,
      };
    }
    return null;
  }, [effectiveRole, prototypeRole, db.profiles, userId]);

  const role = effectiveRole;

  const notify = useCallback((message) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  // Load everything the pages show from the API (GET /v1/workspace, or
  // /v1/public/workspace for visitors) and shape it for the store.
  const loadFromApi = useCallback(async (quiet = true) => {
    const token = await sessionToken();
    const res = await fetchWorkspace({ token });
    // Not loaded: keep what we had. An empty plant list would show every tag as unused.
    if (!res.ok) {
      if (res.offline) { setApiStatus("offline"); setApiError(API_DOWN); }
      console.warn("loadFromApi:", res.message || res.code);
      return { ok: false, message: res.offline ? API_DOWN : res.message };
    }
    const w = res.data;

    const photosByObs = new Map();
    for (const ph of w.observation_photos) {
      const list = photosByObs.get(ph.observation_id) || [];
      list.push({
        id: ph.id,
        observation_id: ph.observation_id,
        url: ph.url || ph.s3_key,
        s3_bucket: ph.s3_bucket || "observation-photos",
        s3_key: ph.s3_key,
        created_at: ph.created_at,
        is_primary: false,
      });
      photosByObs.set(ph.observation_id, list);
    }

    const obsBySpecimen = new Map();
    for (const o of w.observations) {
      const list = obsBySpecimen.get(o.specimen_id) || [];
      list.push(o);
      obsBySpecimen.set(o.specimen_id, list);
    }

    const plants = w.specimens.filter((s) => !s.is_deleted).map((s) => ({
      id: s.id,
      qr_id: s.qr_id,
      species_id: s.species_id,
      proposed_species: s.proposed_species_name || "",
      registered_by: s.registered_by,
      lat: s.lat,
      lng: s.lng,
      gps_accuracy_m: s.gps_accuracy_m,
      endangered_override: s.endangered_override,
      is_deleted: s.is_deleted,
      photos: (obsBySpecimen.get(s.id) || []).flatMap((o) => photosByObs.get(o.id) || []),
    }));

    // The database allows one plant per tag, deleted plants included.
    const assignedTagIds = new Set(w.specimens.map((s) => s.qr_id).filter(Boolean));
    const tags = w.qr_tags.map((t) => ({
      qr_id: t.qr_id,
      status: assignedTagIds.has(t.qr_id) ? "assigned" : (t.status === "unassigned" ? "unused" : t.status),
      batch_label: t.batch_label,
      created_by: t.created_by,
      created_at: t.created_at,
    }));

    const reviews = w.observation_reviews.map((r) => ({
      id: r.id,
      observation_id: r.observation_id,
      reviewer_id: r.reviewer_id,
      observation_ver: r.observation_version,
      decision: r.decision,
      comment: r.comment || "",
      created_at: r.created_at,
    }));

    const species_media = w.species_media.map((m) => ({
      id: m.id,
      species_id: m.species_id,
      url: m.url || m.s3_key,
      s3_bucket: m.s3_bucket,
      s3_key: m.s3_key,
      caption: m.caption || "",
      credit: m.credit || null,
      is_primary: m.is_primary,
      sort_order: m.sort_order,
      uploaded_by: m.uploaded_by,
      created_at: m.created_at,
    }));

    const alertNotes = w.alert_notes.map((an) => ({
      id: an.id,
      alert_id: an.alert_id,
      author_id: an.author_id,
      note: an.note,
      created_at: an.created_at,
    }));

    const audit = w.audit_logs.map((a) => ({
      id: a.id,
      changed_by: a.changed_by,
      table_name: a.table_name,
      record_id: a.record_id,
      action: a.action.toLowerCase(),
      old_value: a.old_value,
      new_value: a.new_value,
      changed_at: a.changed_at,
    }));

    const nodes = w.sensor_nodes.map((n) => ({
      id: n.id,
      name: n.name || `Node ${n.id.slice(0, 4)}`,
      specimen_id: n.specimen_id,
      status: n.status,
      thresholds: n.thresholds,
      last_seen: n.last_seen,
    }));

    setDb((prevDb) => {
      let mergedProfiles = prevDb.profiles || initialProfiles;
      if (w.profiles.length > 0) {
        const pMap = new Map(mergedProfiles.map((p) => [p.id, p]));
        for (const pr of w.profiles) pMap.set(pr.id, { ...(pMap.get(pr.id) || {}), ...pr });
        mergedProfiles = Array.from(pMap.values());
      }
      return {
        ...prevDb,
        species: w.species,
        species_media,
        plants,
        observations: w.observations,
        tags,
        reviews,
        comments: w.observation_comments,
        alerts: w.alerts,
        alertNotes,
        nodes,
        notifications: w.notifications,
        audit,
        profiles: mergedProfiles,
      };
    });

    setApiStatus("connected");
    setApiError(null);
    if (!quiet) notify("Synchronized");
    return { ok: true };
  }, [notify]);

  // Reload everything from the API (/v1) and check the signed-in profile
  const syncWithBackend = useCallback(async (quiet = false) => {
    setIsSyncing(true);
    try {
      await loadFromApi(quiet);

      const ping = await pingBackend();
      if (!ping.online) {
        // Pages keep the last data loaded; nothing new can be saved until it is back.
        setApiStatus("offline");
        setApiError(API_DOWN);
        return { ok: true };
      }

      setApiStatus("connected");
      setApiError(null);

      // Public species from API
      const spRes = await fetchPublicSpecies();
      if (spRes.ok && Array.isArray(spRes.data)) {
        setBackendSpeciesCount(spRes.data.length);
      }

      // Check active user profile: GET /v1/me
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
        }
      }

      return { ok: true };
    } catch (err) {
      setApiError(err?.message || "Failed to sync with API");
      return { ok: false, error: err };
    } finally {
      setIsSyncing(false);
    }
  }, [loadFromApi]);

  // Initial load: pick up the Supabase Auth session, then load through the API
  useEffect(() => {
    let mounted = true;
    const sb = getSupabase();

    sb.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUserId(session.user.id);
        setAuthToken(session.access_token);
        setAuthTokenState(session.access_token);
      }
      loadFromApi(true);
    }).catch(() => {
      if (mounted) loadFromApi(true);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUserId(session.user.id);
        setAuthToken(session.access_token);
        setAuthTokenState(session.access_token);
        setPrototypeRole(null);
      } else {
        setPrototypeRole((current) => {
          if (!current || current === "visitor") {
            setUserId(null);
            clearAuthToken();
            setAuthTokenState(null);
          }
          return current;
        });
      }
      loadFromApi(true);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [loadFromApi]);

  // Is the Express API up? Checked on load, every 30 s and when the tab comes
  // back into view, so the "API down" notice appears and clears by itself.
  const checkApi = useCallback(async () => {
    const ping = await pingBackend();
    setApiStatus(ping.online ? "connected" : "offline");
    setApiError(ping.online ? null : API_DOWN);
    return ping.online;
  }, []);
  // A call that could not reach the API marks it down straight away.
  const noteOffline = (res) => {
    if (res?.offline) { setApiStatus("offline"); setApiError(API_DOWN); }
    return res;
  };
  useEffect(() => {
    checkApi();
    const id = setInterval(checkApi, API_CHECK_MS);
    const onVisible = () => { if (typeof document === "undefined" || document.visibilityState === "visible") checkApi(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkApi]);

  // One API call with the fresh token. A call that could not reach the API
  // marks it down; `message` is always something to show the user.
  const callApi = async (fn, ...args) => {
    const res = noteOffline(await fn(...args, { token: await sessionToken() }));
    if (res.ok) return res;
    const fields = res.details?.fields?.map((f) => f.path).filter(Boolean).join(", ");
    return { ...res, message: res.offline ? API_DOWN : `${res.message || res.code}${fields ? ` (${fields})` : ""}` };
  };

  // An API error as something withExponentialRetry understands: only "API
  // down", timeouts and server errors are worth trying again.
  const toError = (res) => Object.assign(new Error(res.message), {
    code: res.code, status: res.status, retryable: !!res.offline || res.status >= 500 || res.status === 429,
  });

  // New notifications without a reload, on the same 30 s beat and when the tab
  // comes back: GET /v1/notifications, the signed-in person's own.
  const refreshNotifications = useCallback(async () => {
    if (!userId) return;
    const res = await fetchNotificationsApi({ token: await sessionToken() });
    if (!res.ok) return console.warn("refreshNotifications:", res.message);
    setDb((prev) => ({ ...prev, notifications: [...res.data, ...prev.notifications.filter((n) => n.user_id !== userId)] }));
  }, [userId]);
  useEffect(() => {
    if (!userId) return undefined;
    const id = setInterval(refreshNotifications, API_CHECK_MS);
    const onVisible = () => { if (typeof document === "undefined" || document.visibilityState === "visible") refreshNotifications(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, refreshNotifications]);

  /* ---------- session & authentication ---------- */
  const setRole = async (key) => {
    const sb = getSupabase();
    if (key === "visitor") {
      setPrototypeRole("visitor");
      clearAuthToken();
      setAuthTokenState(null);
      setUserId(null);
      try {
        await sb.auth.signOut();
      } catch (e) {
        console.warn("signOut error:", e);
      }
      await loadFromApi(true);
      notify("Viewing as Visitor");
      return;
    }

    const targetEmail = DEMO_EMAILS[key];
    const password = ACTIVE_DEMO_PASSWORD;

    // Optimistically set prototype role so screen transitions are immediate
    setPrototypeRole(key);

    if (targetEmail && password) {
      try {
        const { data, error } = await sb.auth.signInWithPassword({
          email: targetEmail,
          password: password,
        });

        if (!error && data?.session) {
          setAuthToken(data.session.access_token);
          setAuthTokenState(data.session.access_token);
          if (data.session.user) {
            setUserId(data.session.user.id);
          }
          setPrototypeRole(null);
          await loadFromApi(true);
          notify(`Signed in as ${targetEmail} (${key})`);
          return;
        } else if (error) {
          console.warn("setRole signIn notice:", error.message);
        }
      } catch (err) {
        console.warn("setRole signIn exception:", err);
      }
    }

    // Offline / fallback resolution
    const match =
      db.profiles.find((p) => p.email === targetEmail || (p.role === key && p.is_active)) ||
      db.profiles.find((p) => p.role === key) ||
      initialProfiles.find((p) => p.email === targetEmail || p.role === key);
    if (match) {
      setUserId(match.id);
    }
    notify(`Viewing as ${key.charAt(0).toUpperCase() + key.slice(1)}`);
  };

  const logout = async () => {
    setPrototypeRole("visitor");
    const sb = getSupabase();
    clearAuthToken();
    setAuthTokenState(null);
    setUserId(null);
    try {
      await sb.auth.signOut();
    } catch (e) {
      console.warn("signOut error:", e);
    }
    notify("Signed out");
  };

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
      setPrototypeRole(null);
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

  // Staff login using Supabase Auth
  const login = async (email, password) => {
    const sb = getSupabase();
    let cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes("@")) {
      const found = db.profiles.find((p) => p.username?.toLowerCase() === cleanEmail);
      if (found?.email) cleanEmail = found.email.toLowerCase();
    }

    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) {
        return { ok: false, message: error.message || "Invalid email or password" };
      }
      const sessionUser = data.user;
      setAuthToken(data.session.access_token);
      setAuthTokenState(data.session.access_token);
      setUserId(sessionUser.id);
      setPrototypeRole(null);
      await loadFromApi(true);
      return { ok: true, id: sessionUser.id, first: false };
    } catch (err) {
      return { ok: false, message: err?.message || "Sign in failed" };
    }
  };

  const signIn = (id) => setUserId(id);

  const changePassword = async (email, next) => {
    if (next && next.length < 8) return { ok: false, message: "Use at least 8 characters for the new password" };
    const sb = getSupabase();
    try {
      const session = (await sb.auth.getSession())?.data?.session;
      if (session) {
        const { error } = await sb.auth.updateUser({ password: next });
        if (error) return { ok: false, message: error.message };
        return { ok: true };
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim());
        if (error) return { ok: false, message: error.message };
        return { ok: true, message: "Password reset link sent to your email" };
      }
    } catch (err) {
      return { ok: false, message: err?.message || "Failed to change password" };
    }
  };

  /* ---------- own account ---------- */
  const USERNAME = /^[a-z0-9._]{3,20}$/;
  const usernameTaken = (name, exceptId) => db.profiles.some((p) => p.id !== exceptId && p.username?.toLowerCase() === name.toLowerCase());

  const updateProfile = async (patch) => {
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

    const res = await callApi(updateMeApi, clean);
    if (!res.ok) return { ok: false, message: res.message };
    notify("Profile updated");
    await loadFromApi(true);
    return { ok: true };
  };

  const changeMyPassword = async (current, next) => {
    if (!me) return { ok: false, message: "Sign in first" };
    if (next.length < 8) return { ok: false, message: "Use at least 8 characters for the new password" };
    if (next === current) return { ok: false, message: "Choose a password different from your current one" };
    const sb = getSupabase();
    try {
      if (me.email && current) {
        const { error: verifyErr } = await sb.auth.signInWithPassword({
          email: me.email,
          password: current,
        });
        if (verifyErr) {
          return { ok: false, message: "Your current password is incorrect" };
        }
      }
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) return { ok: false, message: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || "Failed to change password" };
    }
  };

  /* ---------- plants and photos ---------- */
  const setPlantPhotos = (plantId, photos) => {
    setDb((d) => ({
      ...d,
      plants: d.plants.map((p) => (p.id === plantId ? { ...p, photos } : p)),
    }));
  };

  // The plant already registered on a tag, if any: { id, registered_by, observations }.
  const findSpecimenByQr = async (qr_id) => {
    const res = await callApi(findSpecimenByQrApi, qr_id);
    if (res.ok) return res.data;
    if (res.status === 404) return null;
    throw toError(res);
  };

  const tagInUse = (qr_id) =>
    Object.assign(new Error(`Tag ${qr_id} is already on another plant. Pick or scan an unused tag.`), { code: "TAG_IN_USE", retryable: false });

  // New plant on an unused tag: specimen, first observation, photos, each
  // through the API. Each step runs once. The ids are made here, so a retry
  // after a dropped connection gets back the row it already saved instead of
  // adding a second one. Returns { ok, ... } and never throws.
  const addPlant = async ({ qr_id, proposed_species, morphology, height_cm, notes, photos = [], lat, lng, gps_accuracy_m }) => {
    const authUid = userId || (await getSupabase().auth.getUser())?.data?.user?.id;
    const done = { specimenId: null, obsId: uid(), observation: false, photos: 0 };
    const photoIds = photos.map((p) => p.id || uid());
    const must = (res) => { if (!res.ok) throw toError(res); return res.data; };

    try {
      const result = await withExponentialRetry(async () => {
        // 1. Specimen. The database marks the tag assigned (migration 20261028000000).
        if (!done.specimenId) {
          const existing = await findSpecimenByQr(qr_id);
          if (existing) {
            // Our own plant left without an observation by an earlier failed send: finish it.
            if (existing.registered_by !== authUid || existing.observations?.length) throw tagInUse(qr_id);
            done.specimenId = existing.id;
          } else {
            const specimenId = uid();
            const res = await callApi(createSpecimenApi, {
              id: specimenId,
              qr_id,
              proposed_species_name: proposed_species || null,
              lat: lat ?? null,
              lng: lng ?? null,
              gps_accuracy_m: gps_accuracy_m || null,
            });
            if (res.code === "TAG_IN_USE") throw tagInUse(qr_id); // someone took the tag a moment ago
            if (res.code === "TAG_NOT_FOUND") throw Object.assign(new Error(res.message), { retryable: false });
            done.specimenId = must(res).id;
          }
        }

        // 2. First observation, waiting for review.
        if (!done.observation) {
          must(await callApi(createObservationApi, observationBody({
            id: done.obsId, specimen_id: done.specimenId, height_cm, morphology, notes, lat, lng, gps_accuracy_m,
          })));
          done.observation = true;
        }

        // 3. Photos, one at a time; a retry carries on after the last one saved.
        for (; done.photos < photos.length; done.photos++) {
          must(await callApi(uploadObservationPhotoApi, done.obsId, { ...photos[done.photos], id: photoIds[done.photos] }));
        }

        return { ok: true, id: done.specimenId, obsId: done.obsId };
      }, { maxRetries: 3 });

      notify(`Plant tagged with ${qr_id}`);
      await loadFromApi(true);
      return result;
    } catch (err) {
      console.error("addPlant error:", err);
      notify(`Failed to add plant: ${err.message || err}`);
      await loadFromApi(true); // so the tag list shows what the database now holds
      return { ok: false, error: err, message: err.message || String(err) };
    }
  };

  // POST /v1/observations body; the API sets recorded_by, version and the sync time.
  const observationBody = ({ id, specimen_id, height_cm, morphology, notes, lat, lng, gps_accuracy_m }) => ({
    id,
    specimen_id,
    observed_at: nowIso(),
    height_cm: height_cm === "" || height_cm == null || Number.isNaN(Number(height_cm)) ? null : Number(height_cm),
    morphology: morphology || null,
    notes: notes || null,
    lat: lat ?? null,
    lng: lng ?? null,
    gps_accuracy_m: gps_accuracy_m || null,
    status: "synced",
    device_id: deviceId,
  });

  const addRevisit = async ({ specimen_id, height_cm, morphology, notes, photos = [], gps_accuracy_m }) => {
    const obsId = uid();
    try {
      const res = await callApi(createObservationApi, observationBody({ id: obsId, specimen_id, height_cm, morphology, notes, gps_accuracy_m }));
      if (!res.ok) throw toError(res);
      for (const p of photos) {
        const up = await callApi(uploadObservationPhotoApi, obsId, { ...p, id: p.id || uid() });
        if (!up.ok) throw toError(up);
      }
      notify("Revisit recorded");
      await loadFromApi(true);
      return obsId;
    } catch (err) {
      console.error("addRevisit error:", err);
      notify(`Failed to record revisit: ${err.message || err}`);
      await loadFromApi(true);
      return null;
    }
  };

  const setPlantSpecies = async (plantId, speciesId) => {
    const res = await callApi(updateSpecimenApi, plantId, { species_id: speciesId });
    if (!res.ok) return notify(`Failed to update species: ${res.message}`);
    notify("Species matched");
    await loadFromApi(true);
  };

  /* ---------- observations and review ---------- */
  // Send a draft or a record waiting for a signal: POST /v1/observations/:id/submit.
  // Returns { ok, message }.
  const syncObservation = async (id) => {
    const res = await callApi(submitObservationApi, id);
    await loadFromApi(true);
    if (!res.ok) {
      const message = res.code === "WRONG_STATUS" ? "This record can no longer be sent. Refresh and check its status." : res.message;
      notify(`Failed to send record: ${message}`);
      return { ok: false, message };
    }
    notify("Record sent for review");
    return { ok: true };
  };

  // Send a returned record again, with the botanist's fixes and an optional
  // reply. `changes` may hold height_cm, morphology and notes. The API raises
  // the version so the officer reviews the new one. Returns { ok, message }.
  const resubmit = async (id, message, changes = {}) => {
    const body = {};
    if ("height_cm" in changes) body.height_cm = changes.height_cm === "" || changes.height_cm == null ? null : Number(changes.height_cm);
    if ("morphology" in changes) body.morphology = changes.morphology?.trim() || null;
    if ("notes" in changes) body.notes = changes.notes?.trim() || null;
    if (body.height_cm != null && !(body.height_cm >= 0)) return { ok: false, message: "Height must be a number of 0 or more" };
    if (message && message.trim()) body.comment = message.trim();

    const res = await callApi(submitObservationApi, id, body);
    await loadFromApi(true);
    if (!res.ok) {
      const msg = res.code === "WRONG_STATUS" ? "This record is no longer waiting for your changes. Refresh to see its status." : res.message;
      notify(`Failed to send again: ${msg}`);
      return { ok: false, message: msg };
    }
    notify("Record sent for review again");
    return { ok: true };
  };

  // Approve, return or reject: through the API only (CTIP-29: "only Officer and
  // Admin can decide, enforced by the API"). There is no direct-to-database
  // fallback any more: the old one skipped the version check (docs/updates/rick3-bugs.md, M2).
  // When the API is down the decision is not saved, and the officer is told.
  const reviewObservation = async (id, decision, comment) => {
    const obs = db.observations.find((o) => o.id === id);
    const token = await sessionToken();
    const verb = { approve: "approved", return: "returned", reject: "rejected" }[decision] || decision;
    if (!token) {
      notify("Sign in again to review records");
      return { ok: false, error: "NO_TOKEN" };
    }

    const res = noteOffline(await submitReviewApi({
      observationId: id,
      decision,
      version: obs?.version || 1,
      comment: comment ? comment.trim() : undefined,
      token,
    }));
    if (!res.ok) {
      const msg = res.offline ? `${API_DOWN} The decision was not saved.`
        : res.code === "VERSION_CONFLICT" ? "The botanist changed this record since you opened it. Look at it again, then decide."
        : res.code === "WRONG_STATUS" ? "This record is no longer waiting for review. Someone may have decided already."
        : `Failed to submit review: ${res.message || res.code}`;
      notify(msg);
      await loadFromApi(true);
      return { ok: false, error: res.code, message: msg };
    }

    notify(`Record ${verb}`);
    await loadFromApi(true);
    return { ok: true };
  };

  const getDistributionPoints = useCallback(async ({ speciesId, family } = {}) => {
    try {
      const token = await sessionToken();
      if (token) {
        const res = await fetchDistribution({ speciesId, family, token });
        if (res.ok && Array.isArray(res.data)) {
          return { ok: true, points: res.data, source: "api" };
        }
      }
    } catch (e) {
      console.warn("fetchDistribution API error, falling back to local:", e);
    }

    // Local fallback: protect endangered plants for non-staff
    const plants = visiblePlants(db, role);
    const points = plants
      .filter((p) => !speciesId || p.species_id === speciesId || p.species?.id === speciesId)
      .filter((p) => !family || (p.species?.family || "").toLowerCase() === family.toLowerCase())
      .map((p) => {
        const c = shownCoords(p, role);
        if (!c) return null;
        return {
          observation_id: p.last_observation_id || null,
          specimen_id: p.id,
          qr_id: p.qr_id,
          species_id: p.species?.id || p.species_id || null,
          scientific_name: p.scientific || p.species?.scientific || null,
          common_name: p.name || p.species?.name || null,
          family: p.species?.family || null,
          conservation_status: p.species?.conservation_status || null,
          endangered: !!p.endangered,
          lat: c.lat,
          lng: c.lng,
          location_reduced: false,
          photos: p.photos || [],
        };
      })
      .filter(Boolean);

    return { ok: true, points, source: "local" };
  }, [authToken, db, role]);

  const addComment = async (id, body) => {
    if (!body || !body.trim()) return;
    const res = await callApi(addCommentApi, id, body.trim());
    if (!res.ok) return notify(`Failed to add comment: ${res.message}`);
    notify("Comment posted");
    await loadFromApi(true);
  };

  /* ---------- species ---------- */
  // API rows replace the matching species in the store; others are kept as they are.
  const mergeSpecies = (rows) => setDb((prevDb) => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const kept = prevDb.species.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s));
    const added = rows.filter((r) => !prevDb.species.some((s) => s.id === r.id));
    return { ...prevDb, species: [...kept, ...added] };
  });

  // Staff species list through the API (CTIP-46): GET /v1/species. The API
  // only answers Officer and Admin. Deleted species are not in it, so the
  // "Recently deleted" rows from the start-up load stay.
  const loadStaffSpecies = useCallback(async () => {
    const res = noteOffline(await fetchStaffSpecies({ token: await sessionToken() }));
    if (!res.ok) return { ok: false, message: res.offline ? API_DOWN : res.message };
    setDb((prevDb) => {
      const byId = new Map(prevDb.species.map((s) => [s.id, s]));
      return {
        ...prevDb,
        species: [...res.data.map((r) => ({ ...byId.get(r.id), ...r })), ...prevDb.species.filter((s) => s.is_deleted)],
      };
    });
    return { ok: true };
  }, [authToken]);

  // Create or edit through the API (CTIP-46): POST /v1/species or PATCH /v1/species/:id.
  // The API checks the role and the IUCN status and records who edited it.
  // No Supabase fallback: that would skip the API's checks.
  const saveSpecies = async (sp) => {
    const token = await sessionToken();
    const res = noteOffline(sp.id ? await updateSpeciesApi(sp.id, sp, { token }) : await createSpeciesApi(sp, { token }));
    if (!res.ok) {
      const fields = res.details?.fields?.map((f) => f.path).join(", ");
      const message = res.offline
        ? API_DOWN
        : `${res.message}${fields ? ` (${fields})` : ""}`;
      notify(`Failed to save species: ${message}`);
      return { ok: false, message };
    }
    mergeSpecies([res.data]);
    notify(`Species "${res.data.scientific_name}" ${sp.id ? "updated" : "created"}`);
    return { ok: true, species: res.data };
  };

  // Review queue through the API (CTIP-29, CTIP-86): GET /v1/observations.
  // "pending" is what waits for a decision; the others are for looking back.
  const loadReviewQueue = useCallback(async () => {
    const token = await sessionToken();
    const results = await Promise.all(
      ["pending", "returned", "approved", "rejected"].map(async (status) => noteOffline(await fetchObservations({ status, token }))),
    );
    const failed = results.find((r) => !r.ok);
    if (failed) {
      return {
        ok: false,
        message: failed.offline ? API_DOWN : failed.message,
      };
    }
    return { ok: true, observations: results.flatMap((r) => r.data) };
  }, [authToken]);

  // Publish for visitors or move back to drafts: POST /v1/species/:id/publish.
  const togglePublish = async (id) => {
    const sp = db.species.find((s) => s.id === id);
    if (!sp) return;
    const res = await callApi(publishSpeciesApi, id, !sp.is_published);
    if (!res.ok) return notify(`Failed to change publishing: ${res.message}`);
    mergeSpecies([res.data]);
    notify(res.data.is_published ? "Published species" : "Moved species to drafts");
  };

  // Soft delete (DELETE /v1/species/:id) or undo it (POST /v1/species/:id/restore).
  const setSpeciesDeleted = async (id, is_deleted) => {
    if (!can(role, "species")) return false;
    const res = await callApi(is_deleted ? deleteSpeciesApi : restoreSpeciesApi, id);
    if (!res.ok) {
      notify(`Failed to ${is_deleted ? "delete" : "restore"} species: ${res.message}`);
      return false;
    }
    setDb((prevDb) => ({
      ...prevDb,
      species: prevDb.species.map((s) => (s.id === id ? { ...s, is_deleted } : s)),
    }));
    notify(is_deleted ? "Species deleted" : "Species restored");
    return true;
  };
  const deleteSpecies = (id) => setSpeciesDeleted(id, true);
  const restoreSpecies = (id) => setSpeciesDeleted(id, false);

  // Species gallery (CTIP-85), through the API only: it checks each file's real
  // type and size and removes location metadata before storing it. Only what
  // changed is sent: new photos are uploaded first, then captions and order
  // are updated, then removed photos are deleted. A failure part way leaves the
  // photos already saved in place (no "delete all, insert again").
  const setSpeciesMedia = async (speciesId, list) => {
    if (!can(role, "species")) return { ok: false, message: "Only officers and admins can change species photos" };
    const bad = list.map((p) => p.file && photoProblem(p.file)).find(Boolean);
    if (bad) return { ok: false, message: bad };
    const k = list.findIndex((p) => !p.caption?.trim());
    if (k >= 0) return { ok: false, message: `Add a caption to photo ${k + 1}` };
    if (list.some((p) => p.caption.trim().length > CAPTION_MAX)) return { ok: false, message: `Keep captions under ${CAPTION_MAX} characters` };

    const token = await sessionToken();
    const before = new Map(db.species_media.filter((m) => m.species_id === speciesId).map((m) => [m.id, m]));
    const failed = (res, what) => {
      noteOffline(res);
      return { ok: false, message: res.offline ? API_DOWN : `${what}: ${res.message || res.code}` };
    };

    try {
      // 1. New photos. A field photo picked from an observation has no file, only
      //    its (24-hour) link: download it and upload a real copy, so the gallery
      //    never depends on a link that expires.
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (before.has(p.id)) continue;
        const file = await filePart(p);
        if (!file) return { ok: false, message: `Photo ${i + 1} could not be read. Remove it and add it again.` };
        const res = await uploadSpeciesMediaApi(speciesId, file,
          { caption: p.caption.trim(), credit: p.credit || null, is_primary: i === 0, sort_order: i }, { token });
        if (!res.ok) return failed(res, `Photo ${i + 1} not saved`);
      }

      // 2. Photos already saved: only send the fields that changed.
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const old = before.get(p.id);
        if (!old) continue;
        const changes = {};
        if (old.caption !== p.caption.trim()) changes.caption = p.caption.trim();
        if ((old.credit || null) !== (p.credit || null)) changes.credit = p.credit || null;
        if (!!old.is_primary !== (i === 0)) changes.is_primary = i === 0;
        if (old.sort_order !== i) changes.sort_order = i;
        if (!Object.keys(changes).length) continue;
        const res = await updateSpeciesMediaApi(speciesId, p.id, changes, { token });
        if (!res.ok) return failed(res, `Photo ${i + 1} not updated`);
      }

      // 3. Photos taken out of the gallery: the API removes the record and the file.
      for (const id of before.keys()) {
        if (list.some((p) => p.id === id)) continue;
        const res = await deleteSpeciesMediaApi(speciesId, id, { token });
        if (!res.ok && res.status !== 404) return failed(res, "A photo was not removed");
      }

      notify("Species photos updated");
      return { ok: true };
    } catch (err) {
      console.error("setSpeciesMedia error:", err);
      return { ok: false, message: `Photos not saved: ${err.message || err}` };
    } finally {
      await loadFromApi(true); // show what was really saved, also after a failure part way
    }
  };

  /* ---------- users ---------- */
  // New account through the API (POST /v1/profiles, Admin). Without a password
  // the API sends the person an email to choose their own.
  const addUser = async ({ full_name, email, role: newRole, password }) => {
    const cleanEmail = email.trim().toLowerCase();
    if (db.profiles.some((p) => p.email?.toLowerCase() === cleanEmail)) {
      return { ok: false, message: "This email already has an account" };
    }
    const res = await callApi(createProfileApi, { full_name: full_name.trim(), email: cleanEmail, role: newRole, ...(password ? { password } : {}) });
    if (!res.ok) return { ok: false, message: res.message };
    notify(res.data.invited ? `Invitation sent to ${cleanEmail}` : `Account created for ${cleanEmail}`);
    await loadFromApi(true);
    return { ok: true, id: res.data.id, invited: res.data.invited };
  };

  const updateUser = async (id, patch) => {
    const res = await callApi(updateProfileApi, id, patch);
    if (!res.ok) return notify(`Failed to update user: ${res.message}`);
    notify("User updated");
    await loadFromApi(true);
  };

  /* ---------- monitoring ---------- */
  const ackAlert = async (id) => {
    const res = await callApi(acknowledgeAlertApi, id);
    if (!res.ok) return notify(`Failed to acknowledge alert: ${res.message}`);
    notify("Alert acknowledged");
    await loadFromApi(true);
  };

  const resolveAlert = async (id, outcome) => {
    const res = await callApi(resolveAlertApi, id, outcome || "");
    if (!res.ok) return notify(`Failed to resolve alert: ${res.message}`);
    notify("Alert resolved");
    await loadFromApi(true);
  };

  const assignAlert = async (id, assignee) => {
    const res = await callApi(assignAlertApi, id, assignee || null);
    if (!res.ok) return notify(`Failed to assign alert: ${res.message}`);
    notify("Alert assigned");
    await loadFromApi(true);
  };

  const addAlertNote = async (id, note) => {
    if (!note || !note.trim()) return;
    const res = await callApi(addAlertNoteApi, id, note.trim());
    if (!res.ok) return notify(`Failed to add alert note: ${res.message}`);
    notify("Note added to alert");
    await loadFromApi(true);
  };

  const setThresholds = async (nodeId, thresholds) => {
    const res = await callApi(setThresholdsApi, nodeId, thresholds);
    if (!res.ok) return notify(`Failed to update thresholds: ${res.message}`);
    setDb((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, thresholds } : n)) }));
    notify("Thresholds updated");
  };

  /* ---------- notifications and tags ---------- */
  const markRead = async (id) => {
    const res = await callApi(markReadApi, id);
    if (res.ok) setDb((d) => ({ ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)) }));
  };

  const markAllRead = async () => {
    const res = await callApi(markAllReadApi);
    if (res.ok) setDb((d) => ({ ...d, notifications: d.notifications.map((n) => (n.user_id === userId ? { ...n, is_read: true } : n)) }));
  };

  // The API picks the next free ids (POST /v1/qr-tags/batch). No local stand-in
  // tags: a tag that is not in the database cannot go on a plant.
  const generateTags = async (count, batch_label = "field") => {
    if (!can(role, "tags")) {
      notify("Only officers and admins can create QR tags");
      return [];
    }
    const res = await callApi(createTagBatchApi, count, batch_label);
    if (!res.ok) {
      notify(`Failed to create tags: ${res.message}`);
      return [];
    }
    const ids = res.data.map((t) => t.qr_id);
    notify(`Generated ${ids.length} tag${ids.length > 1 ? "s" : ""}`);
    await loadFromApi(true);
    return ids;
  };

  const deleteTag = async (qr_id) => {
    const tag = db.tags.find((t) => t.qr_id === qr_id);
    if (!tag || tag.status !== "unused" || !can(role, "tags")) return false;
    const res = await callApi(deleteTagApi, qr_id);
    if (!res.ok) {
      notify(`Failed to delete tag: ${res.message}`);
      return false;
    }
    setDb((prev) => ({ ...prev, tags: prev.tags.filter((t) => t.qr_id !== qr_id) }));
    notify(`Tag ${qr_id} deleted`);
    return true;
  };

  const retireTag = async (qr_id) => {
    const res = await callApi(retireTagApi, qr_id);
    if (!res.ok) return notify(`Failed to retire tag: ${res.message}`);
    setDb((prev) => ({ ...prev, tags: prev.tags.map((t) => (t.qr_id === qr_id ? { ...t, status: "retired" } : t)) }));
    notify(`Tag ${qr_id} retired`);
  };

  const value = {
    db, me, role, toast, notify,
    setRole, logout, login, signIn, changePassword, updateProfile, changeMyPassword,
    setPlantPhotos, addPlant, addRevisit, setPlantSpecies,
    syncObservation, resubmit, reviewObservation, addComment,
    saveSpecies, loadStaffSpecies, loadReviewQueue, togglePublish, deleteSpecies, restoreSpecies, setSpeciesMedia,
    addUser, updateUser,
    ackAlert, resolveAlert, assignAlert, addAlertNote, setThresholds,
    markRead, markAllRead, generateTags, retireTag, deleteTag,
    apiStatus, apiError, authToken, isSyncing, backendSpeciesCount,
    refreshFromBackend: () => syncWithBackend(false),
    loginWithToken,
    getBackendSpeciesById,
    getDistributionPoints,
  };

  return React.createElement(StoreContext.Provider, { value }, children);
}
