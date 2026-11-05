// Reading observations, shared by the field routes (field.js) and the review
// routes (observations.js), so the botanist guard lives in one place.

// The columns every observation answer carries.
export const OBS_COLUMNS = `id, specimen_id, recorded_by, observed_at, height_cm, morphology, notes, lat, lng,
  gps_accuracy_m, status, version, device_id, last_synced_at, created_at, updated_at`;

// Botanists only ever see what they recorded. RLS says the same; this is the
// API's own second guard.
export const visibleTo = (query, user) => (user.role === 'botanist' ? query.eq('recorded_by', user.id) : query);

// The observation named in req.params.id, if this user may see it.
export const findObservation = (db, req) => visibleTo(
  db.from('observations').select(OBS_COLUMNS).eq('id', req.params.id).eq('is_deleted', false),
  req.user,
).maybeSingle();
