import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { parseBody, UUID } from './validate.js';
import { detectImageType, stripMetadata, EXTENSIONS } from './images.js';

// Observation review (CTIP-86): the officer's review queue (CTIP-29) and the
// botanist's submission status (CTIP-45). Queries run as the signed-in user,
// so RLS shows botanists only their own observations; the handlers also
// filter by recorded_by for botanists, as a second guard.

const COLUMNS = `id, specimen_id, recorded_by, observed_at, height_cm, morphology, notes, lat, lng,
  gps_accuracy_m, status, version, device_id, last_synced_at, created_at, updated_at`;
const REVIEW_COLUMNS = 'id, observation_id, reviewer_id, observation_version, decision, comment, created_at';

const STATUSES = ['draft', 'queued', 'synced', 'returned', 'approved', 'rejected'];
const ListQuery = z.object({
  // "pending" = waiting for review, which is status synced ("Needs review" in the apps)
  status: z.enum([...STATUSES, 'pending']).transform((s) => (s === 'pending' ? 'synced' : s)).optional(),
  specimen_id: z.string().regex(UUID, 'must be a UUID').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const ReviewCreate = z.strictObject({
  decision: z.enum(['approve', 'return', 'reject']),
  observation_version: z.number().int().min(1),
  comment: z.string().trim().min(1).max(2000).optional(),
}).refine((r) => r.decision === 'approve' || r.comment, {
  path: ['comment'],
  message: 'A reason is required to return or reject an observation',
});

// Errors raised by public.review_observation() (migrations 20261026000000 and
// 20261029120000, which added the species check).
const RPC_ERRORS = {
  42501: [403, 'FORBIDDEN'],
  CTNF0: [404, 'NOT_FOUND'],
  CTST0: [409, 'WRONG_STATUS'],
  CTVR0: [409, 'VERSION_CONFLICT'],
  CTRQ0: [422, 'VALIDATION_ERROR'],
  CTSP0: [422, 'SPECIES_REQUIRED'],
};

const notFound = (res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Observation not found' });
const dbError = (res, error) => res.status(500).json({ code: 'DB_ERROR', message: error.message });

// Botanists only ever see what they recorded.
const visibleTo = (query, user) => (user.role === 'botanist' ? query.eq('recorded_by', user.id) : query);

async function findObservation(req) {
  return visibleTo(
    supabaseAs(req.user).from('observations').select(COLUMNS).eq('id', req.params.id).eq('is_deleted', false),
    req.user,
  ).maybeSingle();
}

export const observationHandlers = {
  // Review queue: GET /observations?status=pending. Botanist: their own, any status.
  'get /observations': async (req, res) => {
    const query = ListQuery.safeParse(req.query);
    if (!query.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Bad status, specimen_id, page or limit' });
    }
    const { status, specimen_id, page, limit } = query.data;
    let q = visibleTo(
      supabaseAs(req.user).from('observations').select(COLUMNS, { count: 'exact' }).eq('is_deleted', false),
      req.user,
    );
    if (status) q = q.eq('status', status);
    if (specimen_id) q = q.eq('specimen_id', specimen_id);
    // Oldest first when reviewing, so nothing waits forever; newest first otherwise.
    const { data, count, error } = await q
      .order('observed_at', { ascending: status === 'synced' })
      .range((page - 1) * limit, page * limit - 1);
    if (error) return dbError(res, error);
    res.json({ data, meta: { page, limit, total: count } });
  },

  'get /observations/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const { data, error } = await findObservation(req);
    if (error) return dbError(res, error);
    if (!data) return notFound(res);
    res.json(data);
  },

  // Every decision with reviewer and time. Botanists see why theirs was returned or rejected.
  'get /observations/:id/reviews': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const obs = await findObservation(req);
    if (obs.error) return dbError(res, obs.error);
    if (!obs.data) return notFound(res);
    const { data, error } = await supabaseAs(req.user)
      .from('observation_reviews')
      .select(REVIEW_COLUMNS)
      .eq('observation_id', req.params.id)
      .order('created_at');
    if (error) return dbError(res, error);
    res.json(data);
  },

  // Approve, return (request changes) or reject. Officer/Admin only (permissions.js);
  // the database function checks the role, status and version again in one locked step.
  'post /observations/:id/reviews': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const body = parseBody(ReviewCreate, req, res);
    if (!body) return;
    const { data, error } = await supabaseAs(req.user).rpc('review_observation', {
      p_obs_id: req.params.id,
      p_version: body.observation_version,
      p_decision: body.decision,
      p_comment: body.comment ?? null,
    });
    if (error) {
      const known = RPC_ERRORS[error.code];
      if (known) return res.status(known[0]).json({ code: known[1], message: error.message });
      return dbError(res, error);
    }
    if (body.decision === 'approve') {
      try {
        const db = supabaseAs(req.user);
        const { data: obs } = await db.from('observations').select('id, specimen_id').eq('id', req.params.id).maybeSingle();
        if (obs?.specimen_id) {
          const { data: spec } = await db.from('specimens').select('id, species_id').eq('id', obs.specimen_id).maybeSingle();
          if (spec?.species_id) {
            const { count } = await db.from('species_media').select('id', { count: 'exact', head: true }).eq('species_id', spec.species_id);
            if (!count) {
              const { data: photos } = await db.from('observation_photos')
                .select('id, s3_bucket, s3_key, caption')
                .eq('observation_id', req.params.id)
                .order('created_at', { ascending: true })
                .limit(1);
              if (photos && photos.length > 0) {
                const ph = photos[0];
                const { data: dlBlob } = await db.storage.from(ph.s3_bucket || 'observation-photos').download(ph.s3_key);
                if (dlBlob) {
                  const buf = Buffer.from(await dlBlob.arrayBuffer());
                  const type = detectImageType(buf) || 'image/jpeg';
                  const mediaId = crypto.randomUUID();
                  const targetKey = `${spec.species_id}/${mediaId}.${EXTENSIONS[type] || 'jpg'}`;
                  const stripped = stripMetadata(buf, type);
                  const uploadRes = await db.storage.from('species-media').upload(targetKey, stripped, { contentType: type, upsert: true });
                  if (!uploadRes.error) {
                    await db.from('species_media').insert({
                      id: mediaId,
                      species_id: spec.species_id,
                      s3_bucket: 'species-media',
                      s3_key: targetKey,
                      caption: ph.caption || 'Field observation photo',
                      is_primary: true,
                      sort_order: 0,
                      uploaded_by: req.user.id,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (autoErr) {
        console.warn('[API] Auto-sync species media notice:', autoErr);
      }
    }
    res.status(201).json(data);
  },
};
