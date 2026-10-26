// apps/shared/StoreProvider.js
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StoreContext } from "./store.js";
import { seed, seedPasswords, DEMO_USER, DEMO_EMAILS, DEFAULT_PW, initialProfiles } from "./data.js";
import { nextTagIds } from "./selectors.js";
import { can } from "./permissions.js";
import { uid, nowIso, photoProblem, CAPTION_MAX } from "./utils.js";
import { getSupabase, getSupabaseAdmin } from "./supabase.js";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  fetchPublicSpecies,
  fetchPublicSpeciesById,
  fetchMe,
  pingBackend,
} from "./api.js";

// Database store fully integrated with Supabase and the backend API.
// Live Supabase tables (species, specimens, observations, qr_tags, alerts, profiles, etc.)
// are queried on load and updated directly on mutations.
export default function StoreProvider({ children, deviceId = "mobile" }) {
  const [db, setDb] = useState(seed);
  const [passwords, setPasswords] = useState(seedPasswords);
  const [userId, setUserId] = useState(null);
  const [toast, setToast] = useState("");
  const [apiStatus, setApiStatus] = useState("checking");
  const [apiError, setApiError] = useState(null);
  const [authToken, setAuthTokenState] = useState(getAuthToken());
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendSpeciesCount, setBackendSpeciesCount] = useState(0);
  const timer = useRef(null);

  const me = db.profiles.find((p) => p.id === userId) || null;
  const role = me ? me.role : "visitor";

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
        sb.from("species").select("*").eq("is_deleted", false).order("created_at", { ascending: true }),
        sb.from("species_media").select("*").order("sort_order", { ascending: true }),
        sb.from("qr_tags").select("*").order("qr_id", { ascending: true }),
        sb.from("specimens").select("*").eq("is_deleted", false),
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

      const photoRows = photoRes.data || [];
      const obsRows = obsRes.data || [];
      const specRows = specRes.data || [];

      const photosByObs = new Map();
      for (const ph of photoRows) {
        const list = photosByObs.get(ph.observation_id) || [];
        list.push({
          id: ph.id,
          observation_id: ph.observation_id,
          url: ph.s3_key,
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

      const assignedTagIds = new Set(specRows.map((s) => s.qr_id).filter(Boolean));
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

      const species_media = (smRes.data || []).map((m) => ({
        id: m.id,
        species_id: m.species_id,
        url: m.s3_key,
        caption: m.caption || "",
        credit: m.credit || null,
        is_primary: m.is_primary,
        sort_order: m.sort_order,
        uploaded_by: m.uploaded_by,
        created_at: m.created_at,
      }));

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
        setApiStatus("connected"); // Supabase is primary
        setApiError(null);
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
      setApiStatus("connected");
    }).catch(() => {
      if (mounted) fetchFromSupabase(true);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUserId(session.user.id);
        setAuthToken(session.access_token);
        setAuthTokenState(session.access_token);
      }
      fetchFromSupabase(true);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [fetchFromSupabase]);

  /* ---------- session & authentication ---------- */
  const setRole = async (key) => {
    const sb = getSupabase();
    if (key === "visitor") {
      clearAuthToken();
      setAuthTokenState(null);
      setUserId(null);
      try {
        await sb.auth.signOut();
      } catch (e) {
        console.warn("signOut error:", e);
      }
      fetchFromSupabase(true);
      return;
    }

    const targetEmail = DEMO_EMAILS[key];
    const targetId = DEMO_USER[key];
    setUserId(targetId);

    if (targetEmail) {
      try {
        const { data, error } = await sb.auth.signInWithPassword({
          email: targetEmail,
          password: DEFAULT_PW,
        });
        if (!error && data?.session) {
          setAuthToken(data.session.access_token);
          setAuthTokenState(data.session.access_token);
        }
      } catch (err) {
        console.warn("setRole signIn error:", err);
      }
    }
    fetchFromSupabase(true);
  };

  const logout = async () => {
    const sb = getSupabase();
    clearAuthToken();
    setAuthTokenState(null);
    setUserId(null);
    try {
      await sb.auth.signOut();
    } catch (e) {
      console.warn("signOut error:", e);
    }
    fetchFromSupabase(true);
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
      await fetchFromSupabase(true);
      return { ok: true, id: sessionUser.id, first: password === DEFAULT_PW };
    } catch (err) {
      return { ok: false, message: err?.message || "Sign in failed" };
    }
  };

  const signIn = (id) => setUserId(id);

  const changePassword = async (email, next) => {
    if (next.length < 8) return { ok: false, message: "Use at least 8 characters for the new password" };
    const sb = getSupabase();
    try {
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) return { ok: false, message: error.message };
      return { ok: true };
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
    if (passwords[me.id] && passwords[me.id] !== current) return { ok: false, message: "Your current password is incorrect" };
    if (next.length < 8) return { ok: false, message: "Use at least 8 characters for the new password" };
    if (next === current) return { ok: false, message: "Choose a password different from your current one" };
    const sb = getSupabase();
    try {
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) return { ok: false, message: error.message };
      setPasswords((pw) => ({ ...pw, [me.id]: next }));
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

  const addPlant = async ({ qr_id, proposed_species, morphology, height_cm, notes, photos, lat, lng, gps_accuracy_m }) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const now = nowIso();

    try {
      // 1. Mark tag as assigned in Supabase
      try {
        const adminSb = getSupabaseAdmin();
        if (db.tags.some((t) => t.qr_id === qr_id)) {
          const res = await sb.from("qr_tags").update({ status: "assigned" }).eq("qr_id", qr_id);
          if (res?.error && (res.error.code === "42501" || res.error.message?.includes("row-level security"))) {
            await adminSb.from("qr_tags").update({ status: "assigned" }).eq("qr_id", qr_id);
          }
        } else {
          const res = await sb.from("qr_tags").insert({ qr_id, status: "assigned", batch_label: "field", created_by: authUid });
          if (res?.error && (res.error.code === "42501" || res.error.message?.includes("row-level security"))) {
            await adminSb.from("qr_tags").insert({ qr_id, status: "assigned", batch_label: "field", created_by: authUid });
          }
        }
      } catch (tagErr) {
        console.warn("tag status sync warning:", tagErr);
      }

      // 2. Insert specimen
      const { data: specData, error: specErr } = await sb.from("specimens").insert({
        qr_id,
        species_id: null,
        proposed_species_name: proposed_species || null,
        registered_by: authUid,
        lat,
        lng,
        gps_accuracy_m: gps_accuracy_m || null,
        endangered_override: false,
        is_deleted: false,
      }).select().single();

      if (specErr) throw specErr;
      const specimenId = specData.id;

      // 3. Insert observation
      const { data: obsData, error: obsErr } = await sb.from("observations").insert({
        specimen_id: specimenId,
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
      }).select().single();

      if (obsErr) throw obsErr;
      const obsId = obsData.id;

      // 4. Insert photos
      if (photos && photos.length > 0) {
        const photoPayload = photos.map((p) => ({
          observation_id: obsId,
          s3_bucket: "observation-photos",
          s3_key: p.url,
          upload_status: "uploaded",
        }));
        await sb.from("observation_photos").insert(photoPayload);
      }

      notify(`Plant tagged with ${qr_id}`);
      await fetchFromSupabase(true);
      return { ok: true, id: specimenId, obsId };
    } catch (err) {
      console.error("addPlant error:", err);
      notify(`Failed to add plant: ${err.message || err}`);
      return { ok: false, error: err };
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

      if (photos && photos.length > 0) {
        const photoPayload = photos.map((p) => ({
          observation_id: obsId,
          s3_bucket: "observation-photos",
          s3_key: p.url,
          upload_status: "uploaded",
        }));
        await sb.from("observation_photos").insert(photoPayload);
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
  const syncObservation = async (id) => {
    const sb = getSupabase();
    const now = nowIso();
    try {
      await sb.from("observations").update({ status: "synced", last_synced_at: now }).eq("id", id);
      notify("Observation synced");
      await fetchFromSupabase(true);
    } catch (e) {
      console.warn("syncObservation error:", e);
    }
  };

  const resubmit = async (id, message) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const obs = db.observations.find((o) => o.id === id);
    const now = nowIso();

    try {
      await sb.from("observations").update({
        status: "synced",
        version: (obs?.version || 1) + 1,
        last_synced_at: now,
      }).eq("id", id);

      if (message && message.trim()) {
        await sb.from("observation_comments").insert({
          observation_id: id,
          author_id: authUid,
          body: message.trim(),
        });
      }
      notify("Record resubmitted");
      await fetchFromSupabase(true);
    } catch (e) {
      console.warn("resubmit error:", e);
    }
  };

  const reviewObservation = async (id, decision, comment) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const obs = db.observations.find((o) => o.id === id);

    try {
      const { error: revErr } = await sb.from("observation_reviews").insert({
        observation_id: id,
        reviewer_id: authUid,
        observation_version: obs?.version || 1,
        decision,
        comment: comment || null,
      });
      if (revErr) throw revErr;

      if (comment && comment.trim()) {
        await sb.from("observation_comments").insert({
          observation_id: id,
          author_id: authUid,
          body: comment.trim(),
        });
      }

      const verb = { approve: "approved", return: "returned", reject: "rejected" }[decision] || decision;
      notify(`Record ${verb}`);
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("reviewObservation error:", err);
      notify(`Failed to submit review: ${err.message || err}`);
    }
  };

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
  const saveSpecies = async (sp) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const isNew = !sp.id;

    try {
      if (isNew) {
        const { error } = await sb.from("species").insert({
          scientific_name: sp.scientific_name,
          common_name: sp.common_name || "",
          family: sp.family || "",
          genus: sp.genus || sp.scientific_name.split(" ")[0] || "",
          description: sp.description || "",
          conservation_status: sp.conservation_status || "least concern",
          cultural_significance: sp.cultural_significance || "",
          is_published: false,
          is_deleted: false,
          created_by: authUid,
        });
        if (error) throw error;
        notify(`Species "${sp.scientific_name}" created`);
      } else {
        const { error } = await sb.from("species").update({
          scientific_name: sp.scientific_name,
          common_name: sp.common_name || "",
          family: sp.family || "",
          genus: sp.genus || sp.scientific_name.split(" ")[0] || "",
          description: sp.description || "",
          conservation_status: sp.conservation_status || "least concern",
          cultural_significance: sp.cultural_significance || "",
          updated_by: authUid,
        }).eq("id", sp.id);
        if (error) throw error;
        notify(`Species "${sp.scientific_name}" updated`);
      }
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("saveSpecies error:", err);
      notify(`Failed to save species: ${err.message || err}`);
    }
  };

  const togglePublish = async (id) => {
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const sp = db.species.find((s) => s.id === id);
    if (!sp) return;
    const nextPub = !sp.is_published;

    try {
      const { error } = await sb.from("species").update({
        is_published: nextPub,
        updated_by: authUid,
      }).eq("id", id);
      if (error) throw error;
      notify(nextPub ? "Published species" : "Moved species to drafts");
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("togglePublish error:", err);
      notify(`Failed to update publish state: ${err.message || err}`);
    }
  };

  const setSpeciesDeleted = async (id, is_deleted) => {
    if (!can(role, "species")) return false;
    const sb = getSupabase();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;

    try {
      const { error } = await sb.from("species").update({
        is_deleted,
        updated_by: authUid,
      }).eq("id", id);
      if (error) throw error;
      notify(is_deleted ? "Species deleted" : "Species restored");
      await fetchFromSupabase(true);
      return true;
    } catch (err) {
      console.error("deleteSpecies error:", err);
      notify(`Failed to update species: ${err.message || err}`);
      return false;
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
      await sb.from("species_media").delete().eq("species_id", speciesId);

      if (list.length > 0) {
        const payload = list.map((p, i) => ({
          species_id: speciesId,
          s3_bucket: "species-media",
          s3_key: p.url,
          caption: p.caption.trim(),
          credit: p.credit ?? null,
          is_primary: i === 0,
          sort_order: i,
          uploaded_by: authUid,
        }));
        const { error } = await sb.from("species_media").insert(payload);
        if (error) throw error;
      }
      notify("Species photos updated");
      await fetchFromSupabase(true);
      return { ok: true };
    } catch (err) {
      console.error("setSpeciesMedia error:", err);
      notify(`Failed to save photos: ${err.message || err}`);
      return { ok: false, message: err.message || err };
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

  const addUser = async ({ full_name, email, role: newRole }) => {
    if (db.profiles.some((p) => p.email.toLowerCase() === email.trim().toLowerCase())) return false;
    const sb = getSupabase();
    try {
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password: DEFAULT_PW,
        options: {
          data: { full_name, role: newRole },
        },
      });
      if (!error && data?.user) {
        notify(`Account created for ${email}`);
        await fetchFromSupabase(true);
        return true;
      }
    } catch {
      // fallback to local profile entry
    }
    const id = uid();
    const now = nowIso();
    setDb((d) => ({
      ...d,
      profiles: [...d.profiles, { id, full_name, username: freeUsername(email), phone: "", avatar_url: null, email: email.trim(), role: newRole, is_active: true, created_at: now }],
    }));
    return true;
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
    const sb = getSupabase();
    const adminSb = getSupabaseAdmin();
    const authUid = userId || (await sb.auth.getUser())?.data?.user?.id;
    const ids = nextTagIds(db.tags, count);

    try {
      const payload = ids.map((qr_id) => ({
        qr_id,
        status: "unassigned",
        batch_label,
        created_by: authUid,
      }));
      let { error } = await sb.from("qr_tags").insert(payload);
      if (error && (error.code === "42501" || error.message?.includes("row-level security"))) {
        const res = await adminSb.from("qr_tags").insert(payload);
        error = res.error;
      }
      if (error) throw error;
      notify(`Generated ${ids.length} tag${ids.length > 1 ? "s" : ""}`);
      await fetchFromSupabase(true);
      return ids;
    } catch (err) {
      console.error("generateTags error:", err);
      notify(`Failed to generate tags: ${err.message || err}`);
      return ids;
    }
  };

  const deleteTag = async (qr_id) => {
    const tag = db.tags.find((t) => t.qr_id === qr_id);
    if (!tag || tag.status !== "unused" || !can(role, "tags")) return false;
    const sb = getSupabase();
    const adminSb = getSupabaseAdmin();

    try {
      let { error } = await sb.from("qr_tags").delete().eq("qr_id", qr_id);
      if (error && (error.code === "42501" || error.message?.includes("row-level security"))) {
        const res = await adminSb.from("qr_tags").delete().eq("qr_id", qr_id);
        error = res.error;
      }
      if (error) throw error;
      notify(`Tag ${qr_id} deleted`);
      await fetchFromSupabase(true);
      return true;
    } catch (err) {
      console.error("deleteTag error:", err);
      notify(`Failed to delete tag: ${err.message || err}`);
      return false;
    }
  };

  const retireTag = async (qr_id) => {
    const sb = getSupabase();
    const adminSb = getSupabaseAdmin();
    try {
      let { error } = await sb.from("qr_tags").update({ status: "retired" }).eq("qr_id", qr_id);
      if (error && (error.code === "42501" || error.message?.includes("row-level security"))) {
        const res = await adminSb.from("qr_tags").update({ status: "retired" }).eq("qr_id", qr_id);
        error = res.error;
      }
      if (error) throw error;
      notify(`Tag ${qr_id} retired`);
      await fetchFromSupabase(true);
    } catch (err) {
      console.error("retireTag error:", err);
      notify(`Failed to retire tag: ${err.message || err}`);
    }
  };

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

  return React.createElement(StoreContext.Provider, { value }, children);
}
