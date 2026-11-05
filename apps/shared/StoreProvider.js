// apps/shared/StoreProvider.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreContext } from "./store.js";
import { seed, initialPublicPlants, withStatusKey } from "./data.js";
import { visiblePlants, shownCoords } from "./selectors.js";
import { can } from "./permissions.js";
import { uid, nowIso, photoProblem, CAPTION_MAX, withExponentialRetry, keepPhotoUrl } from "./utils.js";
import {
  getAuthToken,
  setAuthToken,
  getSession,
  freshAuthToken,
  restoreSession,
  onSessionEnded,
  takeSessionFromUrl,
  signInApi,
  mfaEnrollApi,
  mfaVerifyApi,
  signOutApi,
  passwordResetApi,
  changePasswordApi,
  tokenClaims,
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
  deleteProfileApi,
  restoreProfileApi,
  findSpecimenByQrApi,
  createSpecimenApi,
  updateSpecimenApi,
  createObservationApi,
  submitObservationApi,
  addCommentApi,
  createDiscussionApi,
  fetchDiscussionApi,
  updateDiscussionApi,
  deleteDiscussionApi,
  addDiscussionPostApi,
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
  markReadApi,
  markAllReadApi,
} from "./api.js";

// Shown wherever a page needs the Express API and cannot reach it.
export const API_DOWN = "Cannot reach the API server (Render). Please check your network connection.";
const API_CHECK_MS = 30000;
const BASE_POLL_MS = 5000;
const MAX_POLL_MS = 60000;
const MISSES_FOR_DOWN = 2;
// How long a pop-up message stays on screen (web and mobile). Was 2.6 s, too short
// to read the longer messages, such as the email limit's wait time.
const TOAST_MS = 5600;

// The token to send: renewed through the API when it is about to expire.
const sessionToken = () => freshAuthToken();

const staffStart = { ...seed, plants: [], observations: [] };

// Who the saved session belongs to, known before anything has loaded.
const savedUserId = () => getSession()?.user?.id || tokenClaims(getAuthToken())?.sub || null;

// App state, loaded from and saved through the Express API (services/api).
// The apps never talk to Supabase directly (CTIP-114): signing in, sessions and
// passwords go through /v1/auth and /v1/me/password, and every table and file
// through the other endpoints, which check the role and run each query as the
// user so RLS applies too. The one exception is loading photos, from the
// short-lived Storage links the API hands out.
export default function StoreProvider({ children, deviceId = "mobile" }) {
  // The sample plants are for visitors. Staff are recognised straight away, so
  // they would see them (no species, far from real data) until their own load.
  const [db, setDb] = useState(() => (savedUserId() ? staffStart : seed));
  const [userId, setUserId] = useState(savedUserId);
  const [toast, setToast] = useState("");
  const [apiStatus, setApiStatus] = useState("checking");
  const [apiError, setApiError] = useState(null);
  const [authToken, setAuthTokenState] = useState(getAuthToken());
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendSpeciesCount, setBackendSpeciesCount] = useState(0);
  const timer = useRef(null);
  const lastWorkspace = useRef(null); // { owner, data, cursor } of the last staff load
  const pollAfter = useRef(BASE_POLL_MS); // what the API last said to wait
  const misses = useRef(0); // API answers missed in a row
  const loadsStarted = useRef(0);
  const newestLoadShown = useRef(0);
  // Goes up on sign-out and when the session ends (F-13). A load that was already
  // on its way for the previous user is then dropped, so it cannot bring their
  // staff data back after it was cleared.
  const sessionEpoch = useRef(0);

  // The role always comes from the signed-in user's profile (loaded through the
  // API); nobody signed in is a visitor. The prototype role switch that could
  // fake a role on the device was removed (CTIP-113, #36).
  // Until the profile arrives (Render can take 30 s to wake up) the access token
  // says who this is, so a page refresh never looks like being signed out. This
  // only chooses what to show: the API still checks every request.
  const me = useMemo(() => {
    if (!userId) return null;
    const loaded = db.profiles.find((p) => p.id === userId);
    if (loaded) return loaded;
    const session = getSession();
    const claims = tokenClaims(session?.access_token);
    if (!claims?.user_role) return null;
    const email = session?.user?.email || claims.email || "";
    return { id: userId, email, full_name: email, role: claims.user_role, is_active: true, loading: true };
  }, [db.profiles, userId]);
  const role = me?.role || "visitor";

  const notify = useCallback((message) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);


// Stable URL cache to avoid re-rendering images every polling cycle
const photoUrlCache = new Map();
const stablePhotoUrl = (key, freshUrl) => keepPhotoUrl(photoUrlCache, key, freshUrl);

// Compare two lists shallowly by checking lengths and item JSON representations
function collectionMatches(a = [], b = []) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    const itemB = b[i];
    if (itemA === itemB) continue;
    if (!itemA || !itemB) return false;
    if (itemA.id && itemB.id && itemA.id === itemB.id) {
      if (itemA.status !== itemB.status || itemA.is_read !== itemB.is_read || itemA.observed_at !== itemB.observed_at) {
        return false;
      }
    }
    if (JSON.stringify(itemA) !== JSON.stringify(itemB)) {
      return false;
    }
  }
  return true;
}

  // Is the API reachable? One slow or lost answer is not enough to say it is
  // down: the notice shows after MISSES_FOR_DOWN misses in a row, and any
  // answer from the API clears it.
  const markReachable = useCallback(() => {
    misses.current = 0;
    setApiStatus("connected");
    setApiError(null);
  }, []);
  const markMiss = useCallback(() => {
    misses.current += 1;
    if (misses.current >= MISSES_FOR_DOWN) {
      setApiStatus("offline");
      setApiError(API_DOWN);
    }
  }, []);

  // How long live updates should wait before the next poll: what the API last
  // said (5 s when the database is quick, up to 60 s when it is busy), longer
  // after misses, and a little random so open tabs do not all ask at once.
  const nextPollDelay = useCallback(() => {
    const base = Math.min(MAX_POLL_MS, pollAfter.current * 2 ** misses.current);
    return Math.round(base * (0.9 + Math.random() * 0.2));
  }, []);

  // Load everything the pages show from the API (GET /v1/workspace, or
  // /v1/public/workspace for visitors) and shape it for the store.
  // Staff send the cursor from their last load, so the API sends only the
  // lists that changed (or nothing), which are merged over the last load.
  const loadFromApi = useCallback(async (quiet = true) => {
    const started = ++loadsStarted.current;
    const epoch = sessionEpoch.current;
    const token = await sessionToken();
    const owner = token ? tokenClaims(token)?.sub || null : null;
    const prev = owner && lastWorkspace.current?.owner === owner ? lastWorkspace.current : null;
    const res = await fetchWorkspace({ token, cursor: prev?.cursor });
    // Signed out while this was loading: it holds the previous user's data (F-13).
    if (epoch !== sessionEpoch.current) return { ok: true };
    // A later load has already answered: this one is out of date, so drop it.
    // Otherwise a slow poll could undo a decision saved a moment ago.
    if (started < newestLoadShown.current) return { ok: true };
    newestLoadShown.current = started;
    // Not loaded: keep what we had. An empty plant list would show every tag as unused.
    if (!res.ok) {
      if (res.offline) markMiss();
      // VA-70: a password-only session (the 6-digit step was never finished):
      // sign out, so the person signs in again and gets the code step.
      if (res.code === "MFA_REQUIRED") {
        sessionEpoch.current += 1;
        setUserId(null);
        setAuthTokenState(null);
        await signOutApi();
        notify("Sign in again and enter the 6-digit code from your authenticator app.");
        return { ok: false, message: res.message }; // the next load shows the visitor view
      }
      console.warn("loadFromApi:", res.message || res.code);
      return { ok: false, message: res.offline ? API_DOWN : res.message };
    }
    markReachable();
    if (res.data?.poll_after_ms) pollAfter.current = res.data.poll_after_ms;

    let w = res.data;
    if (w?.partial) {
      // Only changes: there must be a load to put them on, or start again in full.
      if (!prev) {
        lastWorkspace.current = null;
        return { ok: false, message: "Partial update without a full load" };
      }
      if (w.unchanged) {
        lastWorkspace.current = { ...prev, cursor: w.cursor };
        return { ok: true, unchanged: true };
      }
      // The changed lists replace their old copies; a list that failed this time keeps what it had.
      const unavailable = w.unavailable || [];
      const lists = Object.fromEntries(Object.entries(w).filter(([name, rows]) => Array.isArray(rows) && name !== "unavailable" && !unavailable.includes(name)));
      w = { ...prev.data, ...lists, unavailable };
    }
    lastWorkspace.current = owner && res.data.cursor ? { owner, data: w, cursor: res.data.cursor } : null;
    // Every status in one form ("Endangered" -> "endangered"), so no comparison misses it.
    w = { ...w, species: (w.species || []).map(withStatusKey) };

    const photosByObs = new Map();
    for (const ph of w.observation_photos) {
      const list = photosByObs.get(ph.observation_id) || [];
      list.push({
        id: ph.id,
        observation_id: ph.observation_id,
        url: stablePhotoUrl(ph.id || ph.s3_key, ph.url || ph.s3_key),
        s3_bucket: ph.s3_bucket || "observation-photos",
        s3_key: ph.s3_key,
        created_at: ph.created_at,
        is_primary: false,
        caption: ph.caption || "",
        traits: ph.traits || [],
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
      location_reduced: !!s.location_reduced,
      updated_at: s.updated_at ?? null,
      zone_id: s.zone_id ?? null,
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
      url: stablePhotoUrl(m.id || m.s3_key, m.url || m.s3_key),
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
      let mergedProfiles = prevDb.profiles || [];
      if (w.profiles && w.profiles.length > 0) {
        const pMap = new Map(mergedProfiles.map((p) => [p.id, p]));
        for (const pr of w.profiles) pMap.set(pr.id, { ...(pMap.get(pr.id) || {}), ...pr });
        mergedProfiles = Array.from(pMap.values());
      }

      // If visitor and incoming plants are empty, preserve existing published plants or initialPublicPlants
      const finalPlants = (!token && plants.length === 0 && prevDb.plants?.length > 0)
        ? prevDb.plants
        : (plants.length > 0 ? plants : (!token ? (prevDb.plants?.length > 0 ? prevDb.plants : initialPublicPlants) : []));

      const finalObs = (!token && (!w.observations || w.observations.length === 0) && prevDb.observations?.length > 0)
        ? prevDb.observations
        : (w.observations || []);

      // Check if anything actually changed
      const spEqual = collectionMatches(prevDb.species, w.species);
      const mediaEqual = collectionMatches(prevDb.species_media, species_media);
      const plEqual = collectionMatches(prevDb.plants, finalPlants);
      const obsEqual = collectionMatches(prevDb.observations, finalObs);
      const tagsEqual = collectionMatches(prevDb.tags, tags);
      const revEqual = collectionMatches(prevDb.reviews, reviews);
      const comEqual = collectionMatches(prevDb.comments, w.observation_comments);
      const altEqual = collectionMatches(prevDb.alerts, w.alerts);
      const notesEqual = collectionMatches(prevDb.alertNotes, alertNotes);
      const nodesEqual = collectionMatches(prevDb.nodes, nodes);
      const notifsEqual = collectionMatches(prevDb.notifications, w.notifications);
      const auditEqual = collectionMatches(prevDb.audit, audit);
      const profEqual = collectionMatches(prevDb.profiles, mergedProfiles);
      const zones = w.zones || []; // an API not yet redeployed sends none
      const zonesEqual = collectionMatches(prevDb.zones, zones);
      // Discussion board (an API not yet redeployed sends none of these)
      const discussions = w.discussions || [];
      const discussionAudience = w.discussion_audience || [];
      const discussionPosts = w.discussion_posts || [];
      const directory = w.directory || [];
      const discEqual = collectionMatches(prevDb.discussions, discussions);
      const audEqual = collectionMatches(prevDb.discussionAudience, discussionAudience);
      const postsEqual = collectionMatches(prevDb.discussionPosts, discussionPosts);
      const dirEqual = collectionMatches(prevDb.directory, directory);

      const hasChanges = !spEqual || !mediaEqual || !plEqual || !obsEqual || !tagsEqual ||
        !revEqual || !comEqual || !altEqual || !notesEqual || !nodesEqual ||
        !notifsEqual || !auditEqual || !profEqual || !zonesEqual ||
        !discEqual || !audEqual || !postsEqual || !dirEqual;

      // Only change stuff if there's stuff to be changed (prevents image reloads / UI flickering)
      if (!hasChanges) {
        return prevDb;
      }

      return {
        ...prevDb,
        species: spEqual ? prevDb.species : w.species,
        species_media: mediaEqual ? prevDb.species_media : species_media,
        plants: plEqual ? prevDb.plants : finalPlants,
        observations: obsEqual ? prevDb.observations : finalObs,
        tags: tagsEqual ? prevDb.tags : tags,
        reviews: revEqual ? prevDb.reviews : reviews,
        comments: comEqual ? prevDb.comments : w.observation_comments,
        alerts: altEqual ? prevDb.alerts : w.alerts,
        alertNotes: notesEqual ? prevDb.alertNotes : alertNotes,
        nodes: nodesEqual ? prevDb.nodes : nodes,
        notifications: notifsEqual ? prevDb.notifications : w.notifications,
        audit: auditEqual ? prevDb.audit : audit,
        profiles: profEqual ? prevDb.profiles : mergedProfiles,
        zones: zonesEqual ? prevDb.zones : zones,
        discussions: discEqual ? prevDb.discussions : discussions,
        discussionAudience: audEqual ? prevDb.discussionAudience : discussionAudience,
        discussionPosts: postsEqual ? prevDb.discussionPosts : discussionPosts,
        directory: dirEqual ? prevDb.directory : directory,
      };
    });

    if (!quiet) notify("Synchronized");
    return { ok: true };
  }, [notify, markMiss, markReachable]);

  // Reload everything from the API (/v1) and check the signed-in profile
  const syncWithBackend = useCallback(async (quiet = false) => {
    setIsSyncing(true);
    try {
      await loadFromApi(quiet);

      const ping = await pingBackend();
      if (!ping.online) {
        // Pages keep the last data loaded; nothing new can be saved until it is back.
        markMiss();
        return { ok: true };
      }
      markReachable();

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

  // Initial load: the stored session (renewed if it is about to expire), or
  // the one a password-reset link brings in the address, then load through the API.
  useEffect(() => {
    let mounted = true;

    const fromLink = takeSessionFromUrl();
    if (fromLink && typeof window !== "undefined") {
      // Out of the address and the history, then on to setting a new password.
      const next = fromLink === "recovery" ? "#/login?reset=1" : fromLink === "expired" ? "#/login?expired=1" : "#/dashboard";
      window.history.replaceState(null, "", window.location.pathname + window.location.search + next);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }

    const off = onSessionEnded(() => {
      if (!mounted) return;
      setUserId(null);
      setAuthTokenState(null);
      lastWorkspace.current = null;
      sessionEpoch.current += 1;
      setDb(seed); // F-13: drop the staff data when the session ends
      notify("Your session has ended. Please sign in again.");
      loadFromApi(true);
    });

    (async () => {
      await restoreSession();
      const token = await sessionToken();
      if (!mounted) return;
      if (token) {
        setAuthTokenState(token);
        const id = savedUserId();
        if (id) {
          setDb((d) => (d === seed ? staffStart : d)); // the phone only finds its session here
          setUserId(id);
        }
      }
      await loadFromApi(true);
    })();

    return () => {
      mounted = false;
      off();
    };
  }, [loadFromApi, notify]);

  // Is the Express API up? Checked on load, every 30 s and when the tab comes
  // back into view, so the "API down" notice appears and clears by itself.
  // GET /v1/health never touches the database, so a busy database does not
  // look like a dead API. It also says how fast to poll.
  const checkApi = useCallback(async () => {
    const ping = await pingBackend();
    if (ping.online) {
      markReachable();
      if (ping.db?.poll_after_ms) pollAfter.current = ping.db.poll_after_ms;
    } else markMiss();
    return ping.online;
  }, [markMiss, markReachable]);
  // A call that could not reach the API counts as a miss; any answer clears them.
  const noteOffline = (res) => {
    if (res?.offline) markMiss();
    else if (res && res.status > 0) markReachable();
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
    let res = noteOffline(await fn(...args, { token: await sessionToken() }));
    // The token expired anyway (an earlier refresh could not reach the API, or the
    // laptop slept): renew it now and try once more.
    if (res.code === "TOKEN_EXPIRED") {
      const token = await freshAuthToken({ force: true });
      if (token) res = noteOffline(await fn(...args, { token }));
    }
    if (res.ok) return res;
    // A refused form says why for each field ("Gmail addresses have 6 to 30 ..."), not only which.
    const reasons = res.details?.fields?.map((f) => f.message).filter(Boolean).join(" ");
    const fields = reasons ? "" : res.details?.fields?.map((f) => f.path).filter(Boolean).join(", ");
    const detail = (reasons && res.code === "VALIDATION_ERROR" ? reasons : null) || res.message || res.code;
    const offlineMsg = (detail && detail !== "Cannot reach the API server" && detail !== "Cannot reach API server")
      ? `${API_DOWN} (${detail})`
      : API_DOWN;
    return { ...res, message: res.offline ? offlineMsg : `${detail}${fields ? ` (${fields})` : ""}` };
  };

  // An API error as something withExponentialRetry understands: only "API
  // down", timeouts and server errors are worth trying again.
  const toError = (res) => Object.assign(new Error(res.message), {
    code: res.code, status: res.status, retryable: !!res.offline || res.status >= 500 || res.status === 429,
  });

  /* ---------- session & authentication ---------- */
  const logout = async () => {
    lastWorkspace.current = null;
    setAuthTokenState(null);
    setUserId(null);
    // F-13: forget the staff data (exact endangered locations) straight away,
    // so the next person on this browser or phone cannot see it without a reload.
    sessionEpoch.current += 1;
    setDb(seed);
    await signOutApi();
    notify("Signed out");
    loadFromApi(true); // load the visitor view again
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

  // useCallback: SpeciesPage lists this in an effect's dependencies. As a plain
  // function it was new on every render, so each fetch re-rendered the page and
  // fetched again, about 5 requests a second while a species page was open.
  const getBackendSpeciesById = useCallback(async (id) => {
    if (!id) return null;
    try {
      const res = await fetchPublicSpeciesById(id);
      if (res.ok && res.data) {
        const detail = withStatusKey(res.data);
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
  }, []);

  // Staff login: POST /v1/auth/sign-in (the API signs in to Supabase Auth)
  const login = async (email, password) => {
    let cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes("@")) {
      const found = db.profiles.find((p) => p.username?.toLowerCase() === cleanEmail);
      if (found?.email) cleanEmail = found.email.toLowerCase();
    }

    if (!cleanEmail.includes("@")) return { ok: false, message: "Wrong email or password" };
    const res = noteOffline(await signInApi(cleanEmail, password));
    if (!res.ok) return { ok: false, message: res.offline ? API_DOWN : res.message || "Sign in failed" };
    const id = res.data.user?.id;
    // VA-70: the 6-digit step comes first ("verify"), or setting up the
    // authenticator app ("setup"). The page shows it, then calls mfaVerify().
    if (res.data.mfa === "verify" || res.data.mfa === "setup") return { ok: true, id, mfa: res.data.mfa, first: false };
    setAuthTokenState(res.data.access_token);
    setUserId(id);
    await loadFromApi(true);
    return { ok: true, id, first: false };
  };

  // VA-70: a QR code and set-up key for a new authenticator app.
  const mfaEnroll = async () => {
    const res = noteOffline(await mfaEnrollApi());
    if (!res.ok) return { ok: false, message: res.offline ? API_DOWN : res.message };
    return { ok: true, qr: res.data.qr_code, secret: res.data.secret };
  };

  // VA-70: the 6-digit code. On success the new (aal2) session is stored and
  // the staff data loads, as after a normal sign-in.
  const mfaVerify = async (code) => {
    const clean = String(code || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(clean)) return { ok: false, message: "Enter the 6-digit code from your authenticator app" };
    const res = noteOffline(await mfaVerifyApi(clean));
    if (!res.ok) return { ok: false, message: res.offline ? API_DOWN : res.message };
    const id = res.data.user?.id;
    setAuthTokenState(res.data.access_token);
    setUserId(id);
    await loadFromApi(true);
    return { ok: true, id };
  };

  // Left the 6-digit step without finishing: forget the password-only session.
  const mfaCancel = async () => {
    await signOutApi();
  };

  const signIn = (id) => setUserId(id);

  // Signed in through a password-reset link, with a new password: sets it.
  // Otherwise: emails a reset link to that address.
  const changePassword = async (email, next) => {
    if (next && getAuthToken()) {
      if (next.length < 8) return { ok: false, message: "Use at least 8 characters for the new password" };
      const res = await callApi(changePasswordApi, { new_password: next });
      return res.ok ? { ok: true } : { ok: false, message: res.message };
    }
    if (!email?.trim()) return { ok: false, message: "Enter your email" };
    const res = noteOffline(await passwordResetApi(email.trim().toLowerCase()));
    if (!res.ok) return { ok: false, message: res.offline ? API_DOWN : res.message };
    return { ok: true, message: "If that address has an account, a reset link is on its way. Check your email." };
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
    if (!current) return { ok: false, message: "Enter your current password" };
    const res = await callApi(changePasswordApi, { current_password: current, new_password: next });
    return res.ok ? { ok: true } : { ok: false, message: res.message };
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
    const authUid = userId || getSession()?.user?.id;
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

  const addRevisit = async ({ specimen_id, height_cm, morphology, notes, photos = [], lat, lng, gps_accuracy_m }) => {
    const obsId = uid();
    const photoIds = photos.map((p) => p.id || uid());
    let observationDone = false;
    let photosDone = 0;
    const must = (res) => { if (!res.ok) throw toError(res); return res.data; };

    try {
      const result = await withExponentialRetry(async () => {
        if (!observationDone) {
          must(await callApi(createObservationApi, observationBody({
            id: obsId,
            specimen_id,
            height_cm,
            morphology,
            notes,
            lat,
            lng,
            gps_accuracy_m,
          })));
          observationDone = true;
        }

        for (; photosDone < photos.length; photosDone++) {
          must(await callApi(uploadObservationPhotoApi, obsId, {
            ...photos[photosDone],
            id: photoIds[photosDone],
          }));
        }

        return obsId;
      }, { maxRetries: 3 });

      notify("Revisit recorded");
      await loadFromApi(true);
      return result;
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

  // Hide this plant's exact spot from visitors and other botanists, whatever its
  // species' status: the API and database treat the flag like an endangered species.
  const setPlantLocationHidden = async (plantId, endangered_override) => {
    const res = await callApi(updateSpecimenApi, plantId, { endangered_override });
    if (!res.ok) {
      notify(`Failed to update the location setting: ${res.message}`);
      return false;
    }
    notify(endangered_override ? "Exact location hidden from the public" : "Location no longer hidden");
    await loadFromApi(true);
    return true;
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

  /* ---------- discussion board ---------- */
  // A thread from the API ({ ...discussion, audience, posts }) replaces what the
  // store holds for it; everything else is kept.
  const mergeThread = useCallback((thread) => setDb((prev) => {
    const { audience = [], posts = [], ...row } = thread;
    const others = (list) => (list || []).filter((x) => x.discussion_id !== row.id);
    return {
      ...prev,
      discussions: [row, ...(prev.discussions || []).filter((d) => d.id !== row.id)],
      discussionAudience: [...others(prev.discussionAudience), ...audience],
      discussionPosts: [...others(prev.discussionPosts), ...posts],
    };
  }), []);

  const dropThread = useCallback((id) => setDb((prev) => ({
    ...prev,
    discussions: (prev.discussions || []).filter((d) => d.id !== id),
    discussionAudience: (prev.discussionAudience || []).filter((a) => a.discussion_id !== id),
    discussionPosts: (prev.discussionPosts || []).filter((p) => p.discussion_id !== id),
  })), []);

  // { title, body, visibility, share_users, share_roles, mentions, observation_id }.
  // Returns the new thread's id, or null. The client-made id makes a resend safe.
  const startDiscussion = async (thread) => {
    const res = await callApi(createDiscussionApi, { id: uid(), ...thread });
    if (!res.ok) { notify(`Could not start the discussion: ${res.message}`); return null; }
    mergeThread(res.data);
    notify("Discussion started");
    return res.data.id;
  };

  const replyToDiscussion = async (id, body, mentions = []) => {
    const res = await callApi(addDiscussionPostApi, id, { id: uid(), body, mentions });
    if (!res.ok) { notify(`Could not send: ${res.message}`); return false; }
    setDb((prev) => ({
      ...prev,
      discussionPosts: [...(prev.discussionPosts || []).filter((p) => p.id !== res.data.id), res.data],
      discussions: (prev.discussions || []).map((d) => (d.id === id ? { ...d, last_post_at: res.data.created_at } : d)),
    }));
    return true;
  };

  // Owner only: { title?, visibility?, share_users?, share_roles? }
  const updateDiscussion = async (id, changes) => {
    const res = await callApi(updateDiscussionApi, id, changes);
    if (!res.ok) { notify(`Could not save: ${res.message}`); return false; }
    mergeThread(res.data);
    notify("Discussion updated");
    return true;
  };

  const deleteDiscussion = async (id) => {
    const res = await callApi(deleteDiscussionApi, id);
    if (!res.ok) { notify(`Could not delete: ${res.message}`); return false; }
    dropThread(id);
    notify("Discussion deleted");
    return true;
  };

  // Fresh posts for an open thread. A thread that is gone or no longer shared
  // with this user is removed from the store.
  const refreshDiscussion = useCallback(async (id) => {
    const token = await sessionToken();
    if (!token) return;
    const res = await fetchDiscussionApi(id, { token });
    if (res.ok) mergeThread(res.data);
    else if (res.status === 404) dropThread(id);
  }, [mergeThread, dropThread]);

  /* ---------- species ---------- */
  // API rows replace the matching species in the store; others are kept as they are.
  const mergeSpecies = (apiRows) => setDb((prevDb) => {
    const rows = apiRows.map(withStatusKey);
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
        species: [...res.data.map((r) => withStatusKey({ ...byId.get(r.id), ...r })), ...prevDb.species.filter((s) => s.is_deleted)],
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
  const setSpeciesPublished = async (id, is_published) => {
    const res = await callApi(publishSpeciesApi, id, is_published);
    if (!res.ok) {
      notify(`Failed to change publishing: ${res.message}`);
      return false;
    }
    mergeSpecies([res.data]);
    notify(res.data.is_published ? "Published species" : "Moved species to drafts");
    return true;
  };
  const togglePublish = async (id) => {
    const sp = db.species.find((s) => s.id === id);
    if (sp) await setSpeciesPublished(id, !sp.is_published);
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
    if (!res.ok) return { ok: false, message: res.message, code: res.code, fields: res.details?.fields || [] };
    // The account exists, but Supabase's email limit stopped the invitation (admins get a notification too).
    if (res.data.email_limit) notify(res.data.email_limit.message);
    else notify(res.data.invited ? `Invitation sent to ${cleanEmail}` : `Account created for ${cleanEmail}`);
    await loadFromApi(true);
    return { ok: true, id: res.data.id, invited: res.data.invited };
  };

  const updateUser = async (id, patch) => {
    const res = await callApi(updateProfileApi, id, patch);
    if (!res.ok) return notify(`Failed to update user: ${res.message}`);
    notify("User updated");
    await loadFromApi(true);
  };

  // Deleted accounts are off at once and can be restored for 30 days.
  const deleteUser = async (id) => {
    const res = await callApi(deleteProfileApi, id);
    if (!res.ok) { notify(`Could not delete the user: ${res.message}`); return false; }
    notify(`User deleted. You can restore them until ${new Date(res.data.remove_at).toLocaleDateString()}.`);
    await loadFromApi(true);
    return true;
  };

  const restoreUser = async (id) => {
    const res = await callApi(restoreProfileApi, id);
    if (!res.ok) { notify(`Could not restore the user: ${res.message}`); return false; }
    notify("User restored. Turn the account on when they should sign in again.");
    await loadFromApi(true);
    return true;
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
  // Officers and admins print batches; a botanist with no printed tag to hand
  // makes one for the plant in front of them (CTIP-27).
  const generateTags = async (count, batch_label = "field") => {
    if (!can(role, "tags") && !(can(role, "add") && count === 1)) {
      notify("Only officers and admins can create batches of QR tags");
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
    logout, login, signIn, changePassword, updateProfile, changeMyPassword,
    mfaEnroll, mfaVerify, mfaCancel,
    setPlantPhotos, addPlant, addRevisit, setPlantSpecies, setPlantLocationHidden,
    syncObservation, resubmit, reviewObservation, addComment,
    startDiscussion, replyToDiscussion, updateDiscussion, deleteDiscussion, refreshDiscussion,
    saveSpecies, loadStaffSpecies, loadReviewQueue, togglePublish, setSpeciesPublished, deleteSpecies, restoreSpecies, setSpeciesMedia,
    addUser, updateUser, deleteUser, restoreUser,
    ackAlert, resolveAlert, assignAlert, addAlertNote, setThresholds,
    markRead, markAllRead, generateTags, retireTag, deleteTag,
    apiStatus, apiError, authToken, isSyncing, backendSpeciesCount,
    loadFromApi,
    pollFromBackend: () => loadFromApi(true),
    nextPollDelay,
    refreshFromBackend: () => syncWithBackend(false),
    loginWithToken,
    getBackendSpeciesById,
    getDistributionPoints,
  };

  return React.createElement(StoreContext.Provider, { value }, children);
}
