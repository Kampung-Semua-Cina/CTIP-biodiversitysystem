-- =====================================================================
-- Security fix: approve_observation() could be called without signing in.
--
-- 1. The role check was
--        if public.my_role() not in ('officer', 'admin') then raise ...
--    my_role() returns NULL for a visitor who is not signed in, or for a
--    deactivated account. "NULL not in (...)" is NULL, not true, so the
--    check was skipped and the approval went through. coalesce() turns a
--    missing role into '' so it is rejected.
--
-- 2. Supabase grants EXECUTE on every new public function to anon and
--    authenticated directly, so the earlier "revoke ... from public" did
--    not stop visitors calling these through /rest/v1/rpc/. This revokes
--    them explicitly.
--    - Trigger functions: nobody needs to call them directly. Triggers
--      still fire after the revoke, because Postgres only checks EXECUTE
--      when the trigger is created, not each time it runs.
--    - my_role(): signed-in users keep it (the RLS policies call it).
--      No anon policy uses it.
--    - approve_observation(): signed-in users only; the function itself
--      decides who is an officer or admin.
--
-- 3. Drops update_updated_at(), which is not in any migration and is not
--    used by any trigger (set_updated_at() is the one in use). It was
--    probably created in the SQL Editor.
--
-- Safe to run more than once. Does not change any data.
-- =====================================================================

-- 1. Fixed approval function (same as 20261008000100 apart from the check)
create or replace function public.approve_observation(p_obs_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
begin
  -- Only active officers and admins. A missing role (not signed in, no
  -- profile, or deactivated) counts as forbidden.
  if coalesce(public.my_role(), '') not in ('officer', 'admin') then
    raise exception 'Forbidden: Only officers and admins can approve observations';
  end if;

  -- Find the version being approved. "for update" locks the row so the
  -- botanist cannot edit it between this check and the review being saved.
  select version into v_version
  from public.observations
  where id = p_obs_id and not is_deleted
  for update;

  if not found then
    raise exception 'Observation % not found', p_obs_id;
  end if;

  -- The trg_apply_review_decision trigger sets the status to 'approved'.
  insert into public.observation_reviews (observation_id, reviewer_id, observation_version, decision, comment)
  values (p_obs_id, auth.uid(), v_version, 'approve', p_comment);
end;
$$;

revoke execute on function public.approve_observation(uuid, text) from public, anon;
grant  execute on function public.approve_observation(uuid, text) to authenticated;

-- 2. my_role(): signed-in users only
revoke execute on function public.my_role() from public, anon;
grant  execute on function public.my_role() to authenticated;

-- Trigger functions: not callable through the API by anyone
revoke execute on function public.apply_review_decision()    from public, anon, authenticated;
revoke execute on function public.audit_changes()            from public, anon, authenticated;
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.notify_on_alert_assigned() from public, anon, authenticated;
revoke execute on function public.notify_on_alert_created()  from public, anon, authenticated;
revoke execute on function public.notify_on_comment()        from public, anon, authenticated;
revoke execute on function public.notify_on_review()         from public, anon, authenticated;

-- 3. Unused leftover function
drop function if exists public.update_updated_at();
