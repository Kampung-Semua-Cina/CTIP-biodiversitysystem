-- =====================================================================
-- Fixes approve_observation(), which always recorded the review against
-- observation version 1 instead of the version actually being approved.
-- Replaces the function only. Does not change any data.
-- =====================================================================

create or replace function public.approve_observation(p_obs_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
begin
  -- Backend RBAC Check: Only officers/admins can run this
  if public.my_role() not in ('officer', 'admin') then
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

  -- Record the decision against that version. The trg_apply_review_decision
  -- trigger then sets the observation's status to 'approved', so it is not
  -- updated here as well (that would write two audit log rows per approval).
  insert into public.observation_reviews (observation_id, reviewer_id, observation_version, decision, comment)
  values (p_obs_id, auth.uid(), v_version, 'approve', p_comment);
end;
$$;
