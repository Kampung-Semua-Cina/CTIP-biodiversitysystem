// apps/shared/StoreProvider.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreContext } from "./store.js";
import { seed, DEMO_USER, DEMO_EMAILS, DEMO_PASSWORD, initialProfiles } from "./data.js";
import { nextTagIds } from "./selectors.js";
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
} from "./api.js";

const ACTIVE_DEMO_PASSWORD =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEMO_PASSWORD) ||
  (typeof process !== "undefined" && (process.env?.VITE_DEMO_PASSWORD || process.env?.DEMO_PASSWORD)) ||
  DEMO_PASSWORD ||
  "Niah@1234";

// Shown wherever a page needs the Express API and cannot reach it.
export const API_DOWN = "Cannot reach the API server. Start it with npm run api (needs services/api/.env).";
const API_CHECK_MS = 30000;

// Database store fully integrated with Supabase and the backend API.
// Live Supabase tables (species, specimens, observations, qr_tags, alerts, profiles, etc.)
// are queried on load and updated directly on mutations.
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

  // Fetch live tables from Supabase and assemble into client state
  const fetchFromSupabase = useCallback(async (quiet = true) => {
    try {
      const sb = getSupabase();

      const [
        spRes,
        smRes,
        tagRes,
        specRes,
        obsRes,
        photoRes,
        revRes,
        commRes,
        alertRes,
        anRes,
        nodeRes,
        notifRes,
        auditRes,
        profRes,
      ] = await Promise.all([
        sb.from("species").select("*").order("created_at", { ascending: true }),
        sb.from("species_media").select("*").order("sort_order", { ascending: true }),
        sb.from("qr_tags").select("*").order("qr_id", { ascending: true }),
        sb.from("specimens").select("*"), // deleted ones too: their tags stay taken
        sb.from("observations").select("*").eq("is_deleted", false).order("observed_at", { ascending: false }),
        sb.from("observation_photos").select("*").order("created_at", { ascending: true }),
        sb.from("observation_reviews").select("*").order("created_at", { ascending: false }),
        sb.from("observation_comments").select("*").order("created_at", { ascending: true }),
        sb.from("alerts").select("*").order("created_at", { ascending: false }),
        sb.from("alert_notes").select("*").order("created_at", { ascending: true }),
        sb.from("sensor_nodes").select("*").order("created_at", { ascending: true }),
        sb.from("notifications").select("*").order("created_at", { ascending: false }),
        sb.from("audit_logs").select("*").order("changed_at", { ascending: false }),
        sb.from("profiles").select("*"),
      ]);

      // A tag counts as used when a plant is on it. If plants or tags failed to
      // load, keep what we had: an empty plant list would show every tag as unused.
      const coreError = specRes.error || tagRes.error || obsRes.error;
      if (coreError) throw coreError;

      const photoRows = photoRes.data || [];
      const obsRows = obsRes.data || [];
      const allSpecRows = specRes.data || [];
      const specRows = allSpecRows.filter((s) => !s.is_deleted);

      // Resolve signed URLs for private observation photos
      const privatePaths = photoRows
        .map((ph) => ph.s3_key)
        .filter((k) => k && !k.startsWith("http://") && !k.startsWith("https://") && !k.startsWith("blob:") && !k.startsWith("data:"));

      const signedMap = new Map();
      if (privatePaths.length > 0) {
        try {
          const { data: signedItems } = await sb.storage
            .from("observation-photos")
            .createSignedUrls(privatePaths, 3600 * 24);

          (signedItems || []).forEach((item) => {
            if (item?.signedUrl) signedMap.set(item.path, item.signedUrl);
          });
        } catch (signErr) {
          console.warn("createSignedUrls warning:", signErr);
        }
      }

      const photosByObs = new Map();
      for (const ph of photoRows) {
        const list = photosByObs.get(ph.observation_id) || [];
        let url = ph.s3_key;
        if (signedMap.has(ph.s3_key)) {
          url = signedMap.get(ph.s3_key);
        }
        list.push({
          id: ph.id,
          observation_id: ph.observation_id,
          url,
          created_at: ph.created_at,
          is_primary: false,
        });
        photosByObs.set(ph.observation_id, list);
      }

      const obsBySpecimen = new Map();
      for (const o of obsRows) {
        const list = obsBySpecimen.get(o.specimen_id) || [];
        list.push(o);
        obsBySpecimen.set(o.specimen_id, list);
      }

      const plants = specRows.map((s) => {
        const specObs = obsBySpecimen.get(s.id) || [];
        const photos = specObs.flatMap((o) => photosByObs.get(o.id) || []);
        return {
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
          photos,
        };
      });

      // The database allows one plant per tag, deleted plants included.
      const assignedTagIds = new Set(allSpecRows.map((s) => s.qr_id).filter(Boolean));
      const tags = (tagRes.data || []).map((t) => ({
        qr_id: t.qr_id,
        status: assignedTagIds.has(t.qr_id) ? "assigned" : (t.status === "unassigned" ? "unused" : t.status),
        batch_label: t.batch_label,
        created_by: t.created_by,
        created_at: t.created_at,
      }));

      const reviews = (revRes.data || []).map((r) => ({
        id: r.id,
        observation_id: r.observation_id,
        reviewer_id: r.reviewer_id,
        observation_ver: r.observation_version,
        decision: r.decision,
        comment: r.comment || "",
        created_at: r.created_at,
      }));

      const species_media = (smRes.data || []).map((m) => {
        let url = m.s3_key;
        if (url && !url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("blob:") && !url.startsWith("data:")) {
          const { data } = sb.storage.from("species-media").getPublicUrl(m.s3_key);
          url = data?.publicUrl || url;
        }
        return {
          id: m.id,
          species_id: m.species_id,
          url,
          caption: m.caption || "",
          credit: m.credit || null,
          is_primary: m.is_primary,
          sort_order: m.sort_order,
          uploaded_by: m.uploaded_by,
          created_at: m.created_at,
        };
      });

      const alertNotes = (anRes.data || []).map((an) => ({
        id: an.id,
        alert_id: an.alert_id,
        author_id: an.author_id,
        note: an.note,
        created_at: an.created_at,
      }));

      const audit = (auditRes.data || []).map((a) => ({
        id: a.id,
        changed_by: a.changed_by,
        table_name: a.table_name,
        record_id: a.record_id,
        action: a.action.toLowerCase(),
        old_value: a.old_value,
        new_value: a.new_value,
        changed_at: a.changed_at,
      }));

      const nodes = (nodeRes.data || []).map((n) => ({
        id: n.id,
        name: n.name || `Node ${n.id.slice(0, 4)}`,
        specimen_id: n.specimen_id,
        status: n.status,
        thresholds: n.thresholds,
        last_seen: n.last_seen,
      }));

      setDb((prevDb) => {
        let mergedProfiles = prevDb.profiles || initialProfiles;
        if (profRes.data && profRes.data.length > 0) {
          const pMap = new Map(mergedProfiles.map((p) => [p.id, p]));
          for (const pr of profRes.data) {
            pMap.set(pr.id, { ...(pMap.get(pr.id) || {}), ...pr });
          }
          mergedProfiles = Array.from(pMap.values());
        }

        return {
          ...prevDb,
          species: spRes.data || [],
          species_media,
          plants,
          observations: obsRows,
          tags,
          reviews,
          comments: commRes.data || [],
          alerts: alertRes.data || [],
          alertNotes,
          nodes,
          notifications: notifRes.data || [],
          audit,
          profiles: mergedProfiles,
        };
      });

      if (!quiet) notify("Synchronized with Supabase");
    } catch (err) {
      console.warn("fetchFromSupabase error:", err);
    }
  }, [notify]);

  // Synchronize with backend API (/v1) and Supabase
  const syncWithBackend = useCallback(async (quiet = false) => {
    setIsSyncing(true);
    try {
      await fetchFromSupabase(quiet);

      const ping = await pingBackend();
      if (!ping.online) {
        // Supabase pages still work; species and the review queue need the API.
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
  }, [fetchFromSupabase]);

  // Initial load: check Supabase session and fetch data
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
      fetchFromSupabase(true);
    }).catch(() => {
      if (mounted) fetchFromSupabase(true);
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
      fetchFromSupabase(true);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [fetchFromSupabase]);

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

  // New notifications without a reload: the signed-in person's rows (RLS
  // returns only their own), on the same 30 s beat and when the tab comes back.
  const refreshNotifications = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await getSupabase()
      .from("notifications").select("*").order("created_at", { ascending: false });
    if (error) return console.warn("refreshNotifications:", error.message);
    setDb((prev) => ({ ...prev, notifications: [...data, ...prev.notifications.filter((n) => n.user_id !== userId)] }));
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
      await fetchFromSupabase(true);
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
          await fetchFromSupabase(true);
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
      await fetchFromSupabase(true);
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

    const sb = getSupabase();
    try {
      const { error } = await sb.from("profiles").update(clean).eq("id", me.id);
      if (error) throw error;
      notify("Profile updated");
      await fetchFromSupabase(true);
      return { ok: true };
    } catch (err) {
      console.error("updateProfile error:", err);
      return { ok: false, message: err.message || err };
    }
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

  // Upload photo file or blob to Supabase Storage bucket and return storage path / s3_key
  const uploadPhotoFile = async (bucket, folderPath, photoObj) => {
    const sb = getSupabase();

    let fileToUpload = photoObj.file;
    if (!fileToUpload && photoObj.url && (photoObj.url.startsWith("blob:") || photoObj.url.startsWith("file://"))) {
      try {
        const res = await fetch(photoObj.url);
        fileToUpload = await res.blob();
      } catch (err) {
        console.warn("Could not fetch photo blob:", err);
      }
    }

    const photoId = photoObj.id || uid();
    if (!fileToUpload) {
      return { s3_key: photoObj.url || "", contentType: null, sizeBytes: null, photoId };
    }

    let ext = "jpg";
    if (fileToUpload.name) {
      ext = fileToUpload.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    } else if (fileToUpload.type) {
      ext = fileToUpload.type.split("/").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    }
    if (ext === "jpeg") ext = "jpg";

    const storagePath = `${folderPath}/${photoId}.${ext}`;
    const contentType = fileToUpload.type || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    const sizeBytes = fileToUpload.size || null;

    const upRes = await sb.storage
      .from(bucket)
      .upload(storagePath, fileToUpload, { contentType, upsert: true });

    // Fail instead of saving the phone's local blob: URL, which nobody else can open.
    if (upRes.error) throw upRes.error;

    return { s3_key: storagePath, contentType, sizeBytes, photoId };
  };

  // The plant already registered on a tag, if any: { id, registered_by, observations }.
  const findSpecimenByQr = async (qr_id) => {
    const { data, error } = await getSupabase()
      .from("specimens")
      .select("id, registered_by, observations(id)")
      .eq("qr_id", qr_id)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const tagInUse = (qr_id) =>
    Object.assign(new Error(`Tag ${qr_id} is already on another plant. Pick or scan an unused tag.`), { code: "TAG_IN_USE", retryable: false });

  // New plant on an unused tag: specimen, first observation, photos.
  // Each step runs once. The ids are made here, so a retry after a dropped
  // connection finds the row it already saved instead of adding a second one
  // (that second specimen insert is what raised "specimens_qr_id_key").
  // Returns { ok, ... } and never throws.
  const addPlant = async ({ qr_id, proposed_species, morphology, height_cm, notes, photos = [], lat, lng, gps_accuracy_m }) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const now = nowIso();
    const done = { specimenId: null, obsId: uid(), observation: false, photoRows: [] };
    const photoIds = photos.map((p) => p.id || uid());

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
            const { error } = await sb.from("specimens").insert({
              id: specimenId,
              qr_id,
              species_id: null,
              proposed_species_name: proposed_species || null,
              registered_by: authUid,
              lat,
              lng,
              gps_accuracy_m: gps_accuracy_m || null,
              endangered_override: false,
              is_deleted: false,
            });
            if (error?.code === "23505") throw tagInUse(qr_id); // someone took the tag a moment ago
            if (error?.code === "23503") {
              throw Object.assign(new Error(`Tag ${qr_id} is not in the tag list. Ask an officer to create it.`), { retryable: false });
            }
            if (error) throw error;
            done.specimenId = specimenId;
          }
        }

        // 2. First observation, waiting for review.
        if (!done.observation) {
          const { error } = await sb.from("observations").insert({
            id: done.obsId,
            specimen_id: done.specimenId,
            recorded_by: authUid,
            observed_at: now,
            height_cm: Number(height_cm) || null,
            morphology: morphology || null,
            notes: notes || null,
            lat,
            lng,
            gps_accuracy_m: gps_accuracy_m || null,
            status: "synced",
            version: 1,
            device_id: deviceId,
            last_synced_at: now,
          });
          if (error && error.code !== "23505") throw error; // 23505: saved on an earlier try
          done.observation = true;
        }

        // 3. Photos: upload each file once, then save the rows together.
        for (let i = done.photoRows.length; i < photos.length; i++) {
          const uploaded = await uploadPhotoFile("observation-photos", done.obsId, { ...photos[i], id: photoIds[i] });
          done.photoRows.push({
            id: uploaded.photoId,
            observation_id: done.obsId,
            s3_bucket: "observation-photos",
            s3_key: uploaded.s3_key,
            content_type: uploaded.contentType,
            size_bytes: uploaded.sizeBytes,
            upload_status: "uploaded",
          });
        }
        if (done.photoRows.length) {
          const { error } = await sb.from("observation_photos").upsert(done.photoRows, { onConflict: "id", ignoreDuplicates: true });
          if (error) throw error;
        }

        return { ok: true, id: done.specimenId, obsId: done.obsId };
      }, { maxRetries: 3 });

      notify(`Plant tagged with ${qr_id}`);
      await fetchFromSupabase(true);
      return result;
    } catch (err) {
      console.error("addPlant error:", err);
      notify(`Failed to add plant: ${err.message || err}`);
      await fetchFromSupabase(true); // so the tag list shows what the database now holds
      return { ok: false, error: err, message: err.message || String(err) };
    }
  };

  const addRevisit = async ({ specimen_id, height_cm, morphology, notes, photos, gps_accuracy_m }) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const now = nowIso();

    try {
      const { data: obsData, error: obsErr } = await sb.from("observations").insert({
        specimen_id,
        recorded_by: authUid,
        observed_at: now,
        height_cm: Number(height_cm) || null,
        morphology: morphology || null,
        notes: notes || null,
        gps_accuracy_m: gps_accuracy_m || null,
        status: "synced",
        version: 1,
        device_id: deviceId,
        last_synced_at: now,
      }).select().single();

      if (obsErr) throw obsErr;
      const obsId = obsData.id;

      // Upload and insert revisit photos
      if (photos && photos.length > 0) {
        const photoPayload = [];
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          const uploaded = await uploadPhotoFile("observation-photos", obsId, p);
          photoPayload.push({
            id: uploaded.photoId,
            observation_id: obsId,
            s3_bucket: "observation-photos",
            s3_key: uploaded.s3_key,
            content_type: uploaded.contentType,
            size_bytes: uploaded.sizeBytes,
            upload_status: "uploaded",
          });
        }
        const { error: photoErr } = await sb.from("observation_photos").insert(photoPayload);
        if (photoErr) throw photoErr;
      }

      notify("Revisit recorded");
      await fetchFromSupabase(true);
      return obsId;
    } catch (err) {
      console.error("addRevisit error:", err);
      notify(`Failed to record revisit: ${err.message || err}`);
      return null;
    }
  };

  const setPlantSpecies = async (plantId, speciesId) => {
    const sb = getSupabase();
    try {
      const { error } = await sb.from("specimens").update({ species_id: speciesId }).eq("id", plantId);
      if (error) throw error;
      notify("Species matched");
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("setPlantSpecies error:", err);
      notify(`Failed to update species: ${err.message || err}`);
    }
  };

  /* ---------- observations and review ---------- */
  // Send a draft or a record waiting for a signal. Returns { ok, message }.
  const syncObservation = async (id) => {
    const sb = getSupabase();
    const { data, error } = await sb.from("observations")
      .update({ status: "synced", last_synced_at: nowIso() })
      .eq("id", id)
      .in("status", ["draft", "queued"])
      .select("id");
    await fetchFromSupabase(true);
    if (error || !data?.length) {
      const message = error?.message || "This record can no longer be sent. Refresh and check its status.";
      console.warn("syncObservation error:", error);
      notify(`Failed to send record: ${message}`);
      return { ok: false, message };
    }
    notify("Record sent for review");
    return { ok: true };
  };

  // Send a returned record again, with the botanist's fixes and an optional
  // reply. `changes` may hold height_cm, morphology and notes.
  // The version goes up so the officer reviews the new one. Returns { ok, message }.
  const resubmit = async (id, message, changes = {}) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const obs = db.observations.find((o) => o.id === id);
    const edits = {};
    if ("height_cm" in changes) edits.height_cm = changes.height_cm === "" || changes.height_cm == null ? null : Number(changes.height_cm);
    if ("morphology" in changes) edits.morphology = changes.morphology?.trim() || null;
    if ("notes" in changes) edits.notes = changes.notes?.trim() || null;
    if (edits.height_cm != null && !(edits.height_cm >= 0)) return { ok: false, message: "Height must be a number of 0 or more" };

    try {
      // Only while still returned, so a stale screen cannot overwrite a decided record.
      const { data, error } = await sb.from("observations").update({
        ...edits,
        status: "synced",
        version: (obs?.version || 1) + 1,
        last_synced_at: nowIso(),
      }).eq("id", id).eq("status", "returned").select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("This record is no longer waiting for your changes. Refresh to see its status.");

      if (message && message.trim()) {
        const { error: commentErr } = await sb.from("observation_comments").insert({
          observation_id: id,
          author_id: authUid,
          body: message.trim(),
        });
        if (commentErr) console.warn("resubmit reply not saved:", commentErr); // the record itself was sent
      }
      notify("Record sent for review again");
      await fetchFromSupabase(true);
      return { ok: true };
    } catch (e) {
      console.warn("resubmit error:", e);
      notify(`Failed to send again: ${e.message || e}`);
      await fetchFromSupabase(true);
      return { ok: false, message: e.message || String(e) };
    }
  };

  const reviewObservation = async (id, decision, comment) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const obs = db.observations.find((o) => o.id === id);
    const token = authToken || getAuthToken() || (await sb.auth.getSession())?.data?.session?.access_token;
    const version = obs?.version || 1;
    const verb = { approve: "approved", return: "returned", reject: "rejected" }[decision] || decision;

    try {
      let routedViaApi = false;

      // 1. Primary path: Express API endpoint POST /v1/observations/:id/reviews (CTIP-86)
      if (token) {
        const apiRes = await submitReviewApi({
          observationId: id,
          decision,
          version,
          comment: comment ? comment.trim() : undefined,
          token,
        });

        if (apiRes.ok) {
          routedViaApi = true;
        } else if (!apiRes.offline) {
          // If API returned a non-offline error (e.g. 403 Forbidden, 409 Version Conflict, 422 Validation error),
          // DO NOT bypass the API; report the actual server validation / conflict error directly.
          const msg = apiRes.message || apiRes.code || "Review failed";
          notify(`Failed to submit review: ${msg}`);
          return { ok: false, error: msg };
        }
      }

      // 2. Fallback path if API server is offline or no API token:
      if (!routedViaApi) {
        // Attempt Supabase RPC review_observation (row-level locked)
        const { error: rpcErr } = await sb.rpc("review_observation", {
          p_obs_id: id,
          p_version: version,
          p_decision: decision,
          p_comment: comment && comment.trim() ? comment.trim() : null,
        });

        if (rpcErr) {
          // Fallback to table insert if RPC not installed
          const { error: revErr } = await sb.from("observation_reviews").insert({
            observation_id: id,
            reviewer_id: authUid,
            observation_version: version,
            decision,
            comment: comment || null,
          });
          if (revErr) throw revErr;
        }

        if (comment && comment.trim()) {
          await sb.from("observation_comments").insert({
            observation_id: id,
            author_id: authUid,
            body: comment.trim(),
          });
        }
      }

      notify(`Record ${verb}`);
      await fetchFromSupabase(true);
      return { ok: true };
    } catch (err) {
      console.error("reviewObservation error:", err);
      notify(`Failed to submit review: ${err.message || err}`);
      return { ok: false, error: err?.message || err };
    }
  };

  const getDistributionPoints = useCallback(async ({ speciesId, family } = {}) => {
    try {
      const sb = getSupabase();
      const token = authToken || getAuthToken() || (await sb.auth.getSession())?.data?.session?.access_token;
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
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;

    try {
      const { error } = await sb.from("observation_comments").insert({
        observation_id: id,
        author_id: authUid,
        body: body.trim(),
      });
      if (error) throw error;
      notify("Comment posted");
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("addComment error:", err);
      notify(`Failed to add comment: ${err.message || err}`);
    }
  };

  /* ---------- species ---------- */
  // The freshest token: Supabase refreshes the session, the stored one can be expired.
  const currentToken = async () =>
    (await getSupabase().auth.getSession())?.data?.session?.access_token || authToken || getAuthToken();

  // API rows replace the matching species in the store; others are kept as they are.
  const mergeSpecies = (rows) => setDb((prevDb) => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const kept = prevDb.species.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s));
    const added = rows.filter((r) => !prevDb.species.some((s) => s.id === r.id));
    return { ...prevDb, species: [...kept, ...added] };
  });

  // Staff species list through the API (CTIP-46): GET /v1/species. The API
  // only answers Officer and Admin. Deleted species are not in it, so the
  // "Recently deleted" rows loaded from Supabase stay.
  const loadStaffSpecies = useCallback(async () => {
    const res = noteOffline(await fetchStaffSpecies({ token: await currentToken() }));
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
    const token = await currentToken();
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
    const token = await currentToken();
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

  const togglePublish = async (id) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const sp = db.species.find((s) => s.id === id);
    if (!sp) return;
    const nextPub = !sp.is_published;

    setDb((prevDb) => ({
      ...prevDb,
      species: (prevDb.species || []).map((s) => (s.id === id ? { ...s, is_published: nextPub } : s)),
    }));
    notify(nextPub ? "Published species" : "Moved species to drafts");

    try {
      const { error } = await sb.from("species").update({
        is_published: nextPub,
        updated_by: authUid,
      }).eq("id", id);
      if (error) throw error;
      await fetchFromSupabase(true);
    } catch (err) {
      console.warn("togglePublish Supabase sync warning:", err?.message || err);
    }
  };

  const setSpeciesDeleted = async (id, is_deleted) => {
    if (!can(role, "species")) return false;
    setDb((prevDb) => ({
      ...prevDb,
      species: (prevDb.species || []).map((s) => (s.id === id ? { ...s, is_deleted } : s)),
    }));
    notify(is_deleted ? "Species deleted" : "Species restored");

    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;

    try {
      const { error } = await sb.from("species").update({
        is_deleted,
        updated_by: authUid,
      }).eq("id", id);
      if (error) throw error;
      await fetchFromSupabase(true);
      return true;
    } catch (err) {
      console.warn("deleteSpecies remote error:", err);
      return true;
    }
  };
  const deleteSpecies = (id) => setSpeciesDeleted(id, true);
  const restoreSpecies = (id) => setSpeciesDeleted(id, false);

  const setSpeciesMedia = async (speciesId, list) => {
    if (!can(role, "species")) return { ok: false, message: "Only officers and admins can change species photos" };
    const bad = list.map((p) => p.file && photoProblem(p.file)).find(Boolean);
    if (bad) return { ok: false, message: bad };
    const k = list.findIndex((p) => !p.caption?.trim());
    if (k >= 0) return { ok: false, message: `Add a caption to photo ${k + 1}` };
    if (list.some((p) => p.caption.trim().length > CAPTION_MAX)) return { ok: false, message: `Keep captions under ${CAPTION_MAX} characters` };

    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;

    try {
      // Upload first: if a file fails, the photos already saved are left alone.
      const payload = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const uploaded = await uploadPhotoFile("species-media", speciesId, p);
        payload.push({
          id: uploaded.photoId,
          species_id: speciesId,
          s3_bucket: "species-media",
          s3_key: uploaded.s3_key,
          caption: p.caption.trim(),
          credit: p.credit ?? null,
          is_primary: i === 0,
          sort_order: i,
          uploaded_by: authUid,
        });
      }
      const { error: delErr } = await sb.from("species_media").delete().eq("species_id", speciesId);
      if (delErr) throw delErr;
      if (payload.length > 0) {
        const { error } = await sb.from("species_media").insert(payload);
        if (error) throw error;
      }
      notify("Species photos updated");
      await fetchFromSupabase(true);
      return { ok: true };
    } catch (err) {
      console.error("setSpeciesMedia error:", err);
      return { ok: false, message: `Photos not saved: ${err.message || err}` };
    }
  };

  /* ---------- users ---------- */
  const freeUsername = (email) => {
    const local = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 16);
    const base = local.length >= 3 ? local : local + "user";
    let name = base;
    for (let n = 2; usernameTaken(name); n++) name = base + n;
    return name;
  };

  const addUser = async ({ full_name, email, role: newRole, password }) => {
    const cleanEmail = email.trim().toLowerCase();
    if (db.profiles.some((p) => p.email?.toLowerCase() === cleanEmail)) {
      return { ok: false, message: "This email already has an account" };
    }
    const sb = getSupabase();
    let authUid = null;

    if (password) {
      try {
        const { data, error } = await sb.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name, role: newRole },
          },
        });

        if (error) {
          if (error.code === "signup_disabled" || error.message?.toLowerCase().includes("signups not allowed")) {
            return {
              ok: false,
              message: "Signups disabled in Supabase. In Supabase Dashboard, go to Authentication > Providers > Email, turn ON 'Allow new users to sign up' (and turn OFF 'Confirm email').",
            };
          }
          return { ok: false, message: error.message || "Failed to create authentication user" };
        }

        if (data?.user) {
          authUid = data.user.id;
        }
      } catch (err) {
        return { ok: false, message: err?.message || "Sign up error" };
      }
    }

    const id = authUid || uid();
    const now = nowIso();
    const newProfile = {
      id,
      full_name,
      username: freeUsername(cleanEmail),
      phone: "",
      avatar_url: null,
      email: cleanEmail,
      role: newRole,
      is_active: true,
      created_at: now,
    };

    if (authUid) {
      // Upsert profile in Supabase database so role and profile are immediately persisted
      try {
        await sb.from("profiles").upsert(newProfile, { onConflict: "id" });
      } catch (upsertErr) {
        console.warn("profiles upsert warning:", upsertErr);
      }
    } else {
      try {
        await sb.from("profiles").insert(newProfile);
      } catch {
        // offline / prototype fallback
      }
    }

    setDb((d) => ({
      ...d,
      profiles: [...d.profiles, newProfile],
    }));

    notify(`Account created for ${cleanEmail}`);
    await fetchFromSupabase(true);
    return { ok: true, id };
  };

  const updateUser = async (id, patch) => {
    const sb = getSupabase();
    try {
      const { error } = await sb.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
      notify("User updated");
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("updateUser error:", err);
      notify(`Failed to update user: ${err.message || err}`);
    }
  };

  /* ---------- monitoring ---------- */
  const ackAlert = async (id) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    try {
      const { error } = await sb.from("alerts").update({
        status: "acknowledged",
        acknowledged_by: authUid,
        acknowledged_at: nowIso(),
      }).eq("id", id);
      if (error) throw error;
      notify("Alert acknowledged");
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("ackAlert error:", err);
      notify(`Failed to acknowledge alert: ${err.message || err}`);
    }
  };

  const resolveAlert = async (id, outcome) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    try {
      const { error } = await sb.from("alerts").update({
        status: "resolved",
        outcome: outcome || "",
        resolved_by: authUid,
        resolved_at: nowIso(),
      }).eq("id", id);
      if (error) throw error;
      notify("Alert resolved");
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("resolveAlert error:", err);
      notify(`Failed to resolve alert: ${err.message || err}`);
    }
  };

  const assignAlert = async (id, assignee) => {
    const sb = getSupabase();
    try {
      const { error } = await sb.from("alerts").update({ assigned_to: assignee }).eq("id", id);
      if (error) throw error;
      notify("Alert assigned");
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("assignAlert error:", err);
      notify(`Failed to assign alert: ${err.message || err}`);
    }
  };

  const addAlertNote = async (id, note) => {
    if (!note || !note.trim()) return;
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    try {
      const { error } = await sb.from("alert_notes").insert({
        alert_id: id,
        author_id: authUid,
        note: note.trim(),
      });
      if (error) throw error;
      notify("Note added to alert");
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("addAlertNote error:", err);
      notify(`Failed to add alert note: ${err.message || err}`);
    }
  };

  const setThresholds = async (nodeId, thresholds) => {
    const sb = getSupabase();
    try {
      await sb.from("sensor_nodes").update({ thresholds }).eq("id", nodeId);
      setDb((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, thresholds } : n)) }));
      notify("Thresholds updated");
    } catch (e) {
      console.warn("setThresholds error:", e);
    }
  };

  /* ---------- notifications and tags ---------- */
  const markRead = async (id) => {
    const sb = getSupabase();
    try {
      await sb.from("notifications").update({ is_read: true }).eq("id", id);
      setDb((d) => ({ ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)) }));
    } catch {
      // fallback
    }
  };

  const markAllRead = async () => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    try {
      if (authUid) await sb.from("notifications").update({ is_read: true }).eq("user_id", authUid);
      setDb((d) => ({ ...d, notifications: d.notifications.map((n) => (n.user_id === userId ? { ...n, is_read: true } : n)) }));
    } catch {
      // fallback
    }
  };

  const generateTags = async (count, batch_label = "field") => {
    if (!can(role, "tags")) {
      notify("Only officers and admins can create QR tags");
      return [];
    }
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const ids = nextTagIds(db.tags, count);

    try {
      const payload = ids.map((qr_id) => ({
        qr_id,
        status: "unassigned",
        batch_label,
        created_by: authUid,
      }));
      const { error } = await sb.from("qr_tags").insert(payload);
      if (error) throw error;
      notify(`Generated ${ids.length} tag${ids.length > 1 ? "s" : ""}`);
      await fetchFromSupabase(true);
      return ids;
    } catch (err) {
      // No local stand-in tags: a tag that is not in the database cannot go on a plant.
      console.error("generateTags error:", err);
      notify(`Failed to create tags: ${err?.message || err}`);
      return [];
    }
  };

  const deleteTag = async (qr_id) => {
    const tag = db.tags.find((t) => t.qr_id === qr_id);
    if (!tag || tag.status !== "unused" || !can(role, "tags")) return false;
    const sb = getSupabase();

    setDb((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => t.qr_id !== qr_id),
    }));
    notify(`Tag ${qr_id} deleted`);

    try {
      const { error } = await sb.from("qr_tags").delete().eq("qr_id", qr_id);
      if (error) throw error;
      await fetchFromSupabase(true);
      return true;
    } catch (err) {
      console.warn("deleteTag Supabase sync warning:", err?.message || err);
      return true;
    }
  };

  const retireTag = async (qr_id) => {
    const sb = getSupabase();
    setDb((prev) => ({
      ...prev,
      tags: (prev.tags || []).map((t) => (t.qr_id === qr_id ? { ...t, status: "retired" } : t)),
    }));
    notify(`Tag ${qr_id} retired`);
    try {
      const { error } = await sb.from("qr_tags").update({ status: "retired" }).eq("qr_id", qr_id);
      if (error) throw error;
      await fetchFromSupabase(true);
    } catch (err) {
      console.warn("retireTag Supabase sync warning:", err?.message || err);
    }
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
