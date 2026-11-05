import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { parseBody, fail, dbError, UUID } from './validate.js';

// Discussion board (#/discussion). Threads work like email: the owner shares
// one with people and/or role groups and makes it public or private. Who can
// read what is decided by RLS (migration 20261104120000_discussion_board), so
// every query runs as the signed-in user. The API checks the shape of each
// request; a thread the caller cannot read answers 404, never 403, so the
// answer says nothing about threads that are not theirs.

const notFound = (res) => fail(res, 404, 'NOT_FOUND', 'Discussion not found');

const ROLES = ['botanist', 'officer', 'admin'];
const id = z.string().regex(UUID, 'must be a UUID');
const ids = (max) => z.array(id).max(max).transform((list) => [...new Set(list)]);
const roles = z.array(z.enum(ROLES)).max(3).transform((list) => [...new Set(list)]);
const body = z.string().trim().min(1).max(5000);

const DiscussionCreate = z.strictObject({
  id: id.optional(), // client-made, so a retry never makes a second thread
  title: z.string().trim().min(1).max(200),
  body,
  visibility: z.enum(['public', 'private']).default('private'),
  share_users: ids(100).default([]),
  share_roles: roles.default([]),
  mentions: ids(20).default([]),
  observation_id: id.nullable().optional(),
}).refine((b) => b.visibility === 'public' || b.share_users.length || b.share_roles.length,
  { message: 'Share a private discussion with at least one person or group', path: ['share_users'] });

const DiscussionUpdate = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  share_users: ids(100).optional(),
  share_roles: roles.optional(),
}).refine((b) => Object.keys(b).length > 0, 'Send at least one field to change');

const PostCreate = z.strictObject({
  id: id.optional(),
  body,
  mentions: ids(20).default([]),
});

const POST_COLUMNS = 'id, discussion_id, author_id, body, mentions, created_at';

// One thread with its audience and posts, as the caller may see them.
async function loadThread(db, discussionId) {
  const thread = await db.from('discussions').select('*').eq('id', discussionId).maybeSingle();
  if (thread.error || !thread.data) return thread;
  const [audience, posts] = await Promise.all([
    db.from('discussion_audience').select('*').eq('discussion_id', discussionId),
    db.from('discussion_posts').select(POST_COLUMNS).eq('discussion_id', discussionId).order('created_at'),
  ]);
  const error = audience.error || posts.error;
  if (error) return { error };
  return { data: { ...thread.data, audience: audience.data, posts: posts.data } };
}

export const discussionHandlers = {
  'post /discussions': async (req, res) => {
    const b = parseBody(DiscussionCreate, req, res);
    if (!b) return;
    const db = supabaseAs(req.user);
    const { data, error } = await db.rpc('create_discussion', {
      p_id: b.id ?? null,
      p_title: b.title,
      p_body: b.body,
      p_visibility: b.visibility,
      p_user_ids: b.share_users,
      p_roles: b.share_roles,
      p_mentions: b.mentions,
      p_observation_id: b.observation_id ?? null,
    });

    if (error?.code === '23505' && b.id) {
      // Sent before (a retry): hand back the thread already saved.
      const saved = await loadThread(db, b.id);
      if (saved.error) return dbError(res, saved.error);
      if (!saved.data || saved.data.owner_id !== req.user.id) return fail(res, 409, 'ID_IN_USE', 'That id is already used');
      return res.status(200).json(saved.data);
    }
    if (error?.code === '42501') return fail(res, 403, 'FORBIDDEN', 'You cannot start this discussion');
    if (error?.code === '23503') return fail(res, 422, 'UNKNOWN_REFERENCE', 'A person or record you chose does not exist');
    if (error) return dbError(res, error);

    const newId = (Array.isArray(data) ? data[0] : data)?.id;
    const created = await loadThread(db, newId);
    if (created.error) return dbError(res, created.error);
    if (!created.data) return dbError(res, { message: 'The new discussion could not be read back' });
    res.status(201).json(created.data);
  },

  'get /discussions/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const thread = await loadThread(supabaseAs(req.user), req.params.id);
    if (thread.error) return dbError(res, thread.error);
    if (!thread.data) return notFound(res);
    res.json(thread.data);
  },

  // Owner only: title, public/private and who it is shared with.
  'patch /discussions/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const b = parseBody(DiscussionUpdate, req, res);
    if (!b) return;
    const db = supabaseAs(req.user);
    const current = await db.from('discussions').select('id, owner_id').eq('id', req.params.id).maybeSingle();
    if (current.error) return dbError(res, current.error);
    if (!current.data) return notFound(res);
    if (current.data.owner_id !== req.user.id) return fail(res, 403, 'NOT_OWNER', 'Only the person who started this discussion can change it');

    const { error } = await db.rpc('update_discussion', {
      p_id: req.params.id,
      p_title: b.title ?? null,
      p_visibility: b.visibility ?? null,
      p_user_ids: b.share_users ?? null,
      p_roles: b.share_roles ?? null,
    });
    if (error?.code === '42501') return fail(res, 403, 'NOT_OWNER', 'Only the person who started this discussion can change it');
    if (error?.code === '23503') return fail(res, 422, 'UNKNOWN_REFERENCE', 'A person you chose does not exist');
    if (error) return dbError(res, error);

    const updated = await loadThread(db, req.params.id);
    if (updated.error) return dbError(res, updated.error);
    if (!updated.data) return notFound(res); // made private and the owner is still the reader, so this is unexpected
    res.json(updated.data);
  },

  // The owner, or an admin (moderation). Posts and audience go with it.
  'delete /discussions/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const db = supabaseAs(req.user);
    const current = await db.from('discussions').select('id, owner_id').eq('id', req.params.id).maybeSingle();
    if (current.error) return dbError(res, current.error);
    if (!current.data) return notFound(res);
    if (current.data.owner_id !== req.user.id && req.user.role !== 'admin') {
      return fail(res, 403, 'NOT_OWNER', 'Only the person who started this discussion or an admin can delete it');
    }
    const { data, error } = await db.from('discussions').delete().eq('id', req.params.id).select('id');
    if (error) return dbError(res, error);
    if (!data?.length) return fail(res, 403, 'NOT_OWNER', 'Only the person who started this discussion or an admin can delete it');
    res.status(204).end();
  },

  'post /discussions/:id/posts': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const b = parseBody(PostCreate, req, res);
    if (!b) return;
    const db = supabaseAs(req.user);
    const thread = await db.from('discussions').select('id').eq('id', req.params.id).maybeSingle();
    if (thread.error) return dbError(res, thread.error);
    if (!thread.data) return notFound(res);

    const row = { discussion_id: req.params.id, author_id: req.user.id, body: b.body, mentions: b.mentions };
    if (b.id) row.id = b.id;
    const { data, error } = await db.from('discussion_posts').insert(row).select(POST_COLUMNS).single();
    if (error?.code === '23505' && b.id) {
      const saved = await db.from('discussion_posts').select(POST_COLUMNS).eq('id', b.id).maybeSingle();
      if (saved.error) return dbError(res, saved.error);
      if (!saved.data || saved.data.author_id !== req.user.id) return fail(res, 409, 'ID_IN_USE', 'That id is already used');
      return res.status(200).json(saved.data);
    }
    if (error?.code === '42501') return notFound(res);
    if (error) return dbError(res, error);
    res.status(201).json(data);
  },
};
