// apps/web/tests/helpers/mockApi.js
// A fake API in the browser, so specs need no sign-in and never touch the live database.
export const ME = "11111111-1111-4111-8111-111111111111";
export const BOTANIST = "22222222-2222-4222-8222-222222222222";
export const SPECIES = "33333333-3333-4333-8333-333333333333";
export const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const iso = (minutes) => new Date(Date.UTC(2026, 9, 30, 8, minutes)).toISOString();

export const jwt = () => {
  const claims = { sub: ME, email: "officer@example.com", user_role: "officer", exp: Math.floor(Date.now() / 1000) + 3600 };
  return `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;
};

export const specimen = (n, extra = {}) => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${n}`, qr_id: `NIAH-000${n}`, species_id: null, proposed_species_name: `Guessed plant ${n}`,
  registered_by: BOTANIST, lat: 3.8, lng: 113.77, gps_accuracy_m: 5, endangered_override: false, is_deleted: false, updated_at: iso(n), ...extra,
});
export const observation = (n, extra = {}) => ({
  id: `bbbbbbbb-0000-4000-8000-00000000000${n}`, specimen_id: specimen(n).id, recorded_by: BOTANIST, status: "synced", version: 1,
  observed_at: iso(n), last_synced_at: iso(n), updated_at: iso(n), device_id: "phone", height_cm: 40 + n, morphology: "Broad leaves", notes: "Near the path", lat: 3.8, lng: 113.77, ...extra,
});
export const photo = (n) => ({ id: `cccccccc-0000-4000-8000-00000000000${n}`, observation_id: observation(n).id, url: PIXEL, s3_key: `k${n}`, created_at: iso(n) });
export const species = (extra = {}) => ({
  id: SPECIES, scientific_name: "Nepenthes rajah", common_name: "Giant pitcher", family: "Nepenthaceae", genus: "Nepenthes",
  conservation_status: "least concern", is_published: true, is_deleted: false, updated_at: iso(1), ...extra,
});

export function mockApi(page, state) {
  const requests = [];
  return page.route("**/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/v1/, "");
    const method = req.method();
    const body = req.postDataJSON?.() ?? null;
    if (method !== "GET") state.writes.push({ method, path, body });
    requests.push(path);
    const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

    if (path === "/workspace") {
      if (state.workspaceDelay) await new Promise((r) => setTimeout(r, state.workspaceDelay));
      state.workspaceLoads++;
      return json({
        species: state.species, species_media: [], qr_tags: [], specimens: state.specimens, observations: state.observations,
        observation_photos: state.photos, observation_reviews: [], observation_comments: [], alerts: state.alerts || [], alert_notes: [], sensor_nodes: state.sensorNodes || [],
        notifications: [], audit_logs: [],
        profiles: [
          { id: ME, full_name: "Olive Officer", email: "officer@example.com", role: "officer", is_active: true },
          { id: BOTANIST, full_name: "Bo Tanist", email: "bo@example.com", role: "botanist", is_active: true },
        ],
        zones: [],
      });
    }
    if (path === "/public/workspace") {
      // Like the real route: every list is present, most of them empty.
      return json({
        species: state.species, species_media: [], qr_tags: [], specimens: [], observations: [], observation_photos: [], observation_reviews: [],
        observation_comments: [], alerts: [], alert_notes: [], sensor_nodes: [], notifications: [], audit_logs: [], profiles: [], zones: [],
        ...state.publicWorkspace,
      });
    }
    if (path === "/observations") {
      const status = new URL(req.url()).searchParams.get("status");
      const wanted = status === "pending" ? "synced" : status;
      return json({ data: state.observations.filter((o) => o.status === wanted), meta: { total: state.observations.filter((o) => o.status === wanted).length } });
    }
    if (path === "/distribution") return json({ data: state.points });
    if (path === "/species" && method === "POST") {
      const made = species({ ...body, id: "44444444-4444-4444-8444-444444444444", is_published: false });
      state.species = [...state.species, made];
      return json(made, 201);
    }
    if (/^\/species\/[^/]+\/publish$/.test(path)) {
      const id = path.split("/")[2];
      state.species = state.species.map((s) => (s.id === id ? { ...s, is_published: body.is_published } : s));
      return json(state.species.find((s) => s.id === id));
    }
    if (/^\/specimens\/[^/]+$/.test(path) && method === "PATCH") {
      const id = path.split("/")[2];
      state.specimens = state.specimens.map((s) => (s.id === id ? { ...s, ...body } : s));
      return json(state.specimens.find((s) => s.id === id));
    }
    if (/\/reviews$/.test(path)) {
      const id = path.split("/")[2];
      state.observations = state.observations.map((o) => (o.id === id ? { ...o, status: "approved" } : o));
      return json({ ok: true }, 201);
    }
    return json({ data: [] });
  });
}

export const newState = (over = {}) => ({
  writes: [], workspaceLoads: 0, workspaceDelay: 0, points: [],
  species: [species()], specimens: [specimen(1)], observations: [observation(1)], photos: [photo(1)], ...over,
});

export async function open(page, state, hash) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("daun_session", JSON.stringify(session));
  }, { access_token: jwt(), refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: ME, email: "officer@example.com" } });
  await page.route(/(tile\.openstreetmap|arcgisonline|opentopomap)/, (r) => r.abort());
  await mockApi(page, state);
  await page.goto("/" + hash);
}

// The same site for a visitor: no saved session.
export async function openAsVisitor(page, state, hash) {
  await page.route(/(tile\.openstreetmap|arcgisonline|opentopomap)/, (r) => r.abort());
  await mockApi(page, state);
  await page.goto("/" + hash);
}
