import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { fail, dbError, UUID } from './validate.js';

// Distribution map data (CTIP-88, feeds CTIP-31 and CTIP-71). Threat T13:
// the exact spot of an endangered plant must never reach someone who is not
// allowed it, so coordinates are reduced here, in the API, before the JSON
// is built. The apps only ever receive the reduced numbers.

// Only these roles see exact locations of endangered plants (threat model:
// Officers "view maps", T18 limits exact exports to Officer/Admin).
export const EXACT_LOCATION_ROLES = ['officer', 'admin'];

// Same rule as apps/shared/selectors.js: the officer's per-plant flag, or the
// species' status. Compared without case so "Endangered" also counts.
const ENDANGERED_STATUSES = ['endangered', 'critically endangered'];
export const isEndangered = (specimen) =>
  specimen.endangered_override ||
  ENDANGERED_STATUSES.includes(specimen.species?.conservation_status?.trim().toLowerCase());

// Snap to the centre of a 0.01 degree grid square (about 1.1 km at Niah), so
// the point shows the area but not the plant. Every endangered plant in the
// same square gets the same point, so nothing can be averaged back out.
export const GRID_DEGREES = 0.01;
export const REDUCED_PRECISION_M = 1100;
const snap = (v) => Number(((Math.floor(v / GRID_DEGREES) + 0.5) * GRID_DEGREES).toFixed(3));

// The same rule for a specimen row sent anywhere else (the start-up load, a
// tag lookup). Any botanist can list every tag, so these would otherwise give
// away every endangered plant's spot. Two differences from the map: the
// botanist who registered the plant keeps its exact spot (they stood next to
// it), and a plant with no GPS keeps null coordinates. `status` is the
// species' conservation status, which a specimen row does not carry; pass
// undefined when the caller cannot see the species (RLS shows botanists only
// published ones), and the plant is treated as endangered, so it fails closed.
export function protectSpecimen(specimen, { role, userId, status }) {
  const statusUnknown = specimen.species_id != null && status === undefined;
  const reduce = (statusUnknown || isEndangered({ ...specimen, species: { conservation_status: status } }))
    && !EXACT_LOCATION_ROLES.includes(role)
    && specimen.registered_by !== userId;
  if (!reduce) return { ...specimen, location_reduced: false };
  return {
    ...specimen,
    lat: specimen.lat == null ? null : snap(specimen.lat),
    lng: specimen.lng == null ? null : snap(specimen.lng),
    gps_accuracy_m: REDUCED_PRECISION_M,
    location_reduced: true,
  };
}

export function toMapPoint(obs, role) {
  const specimen = obs.specimens;
  const species = specimen.species;
  const reduce = isEndangered(specimen) && !EXACT_LOCATION_ROLES.includes(role);
  return {
    observation_id: obs.id,
    specimen_id: specimen.id,
    qr_id: specimen.qr_id,
    species_id: species?.id ?? null,
    scientific_name: species?.scientific_name ?? null,
    common_name: species?.common_name ?? null,
    family: species?.family ?? null,
    conservation_status: species?.conservation_status ?? null,
    endangered: isEndangered(specimen),
    observed_at: obs.observed_at,
    lat: reduce ? snap(obs.lat) : obs.lat,
    lng: reduce ? snap(obs.lng) : obs.lng,
    location_reduced: reduce,
    precision_m: reduce ? REDUCED_PRECISION_M : obs.gps_accuracy_m,
  };
}

const DistributionQuery = z.object({
  species_id: z.string().regex(UUID, 'must be a UUID').optional(),
  family: z.string().trim().min(1).max(100).optional(),
});

export const distributionHandlers = {
  // One point per plant: its latest approved observation. Botanists only get
  // their own observations back (RLS "obs: read own or staff").
  'get /distribution': async (req, res) => {
    const query = DistributionQuery.safeParse(req.query);
    if (!query.success) {
      return fail(res, 422, 'VALIDATION_ERROR', 'species_id must be a UUID; family is text');
    }
    const { species_id, family } = query.data;
    let q = supabaseAs(req.user)
      .from('observations')
      .select(`id, observed_at, lat, lng, gps_accuracy_m,
        specimens!inner (id, qr_id, endangered_override, species_id,
          species (id, scientific_name, common_name, family, conservation_status))`)
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .eq('specimens.is_deleted', false)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('observed_at', { ascending: false });
    if (species_id) q = q.eq('specimens.species_id', species_id);
    const { data, error } = await q;
    if (error) return dbError(res, error);

    const latest = new Map();
    for (const obs of data) if (!latest.has(obs.specimens.id)) latest.set(obs.specimens.id, obs);
    const points = [...latest.values()]
      .filter((obs) => !family || obs.specimens.species?.family?.toLowerCase() === family.toLowerCase())
      .map((obs) => toMapPoint(obs, req.user.role));
    res.json({ data: points });
  },
};
