-- =====================================================================
-- CTIP-86: one safe way to approve, return (request changes) or reject an
-- observation. The API calls this; it is a generalised approve_observation().
--
-- Doing the checks and the insert in one function, with the observation row
-- locked ("for update"), means:
--   - the botanist cannot edit the record between the reviewer's check and
--     the decision being saved;
--   - two officers reviewing at the same moment cannot both succeed: the
--     second one sees the status has already changed.
--
-- The existing trg_apply_review_decision trigger then moves the status, and
-- trg_notify_on_review tells the botanist. observation_reviews keeps every
-- decision with the reviewer and the time (created_at).
--
-- Errors use our own SQLSTATE codes so the API can answer with the right
-- HTTP status:
--   42501  not an active officer or admin           -> 403
--   CTNF0  observation not found (or deleted)        -> 404
--   CTST0  observation is not waiting for review     -> 409
--   CTVR0  observation_version is stale              -> 409
--   CTRQ0  bad decision, or missing reason           -> 422
--
-- Safe to run more than once. Does not change any data.
-- =====================================================================

create or replace function public.review_observation(
  p_obs_id   uuid,
  p_version  int,
  p_decision text,
  p_comment  text
)
returns public.observation_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status  text;
  v_version int;
  v_review  public.observation_reviews;
begin
  -- coalesce: a missing role (not signed in, no profile, deactivated) is
  -- forbidden, not NULL (see 20261008063000_fix_approve_rpc_and_function_grants).
  if coalesce(public.my_role(), '') not in ('officer', 'admin') then
    raise exception 'Only officers and admins can review observations' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approve', 'return', 'reject') then
    raise exception 'decision must be approve, return or reject' using errcode = 'CTRQ0';
  end if;
  if p_decision in ('return', 'reject') and coalesce(btrim(p_comment), '') = '' then
    raise exception 'A reason is required to return or reject an observation' using errcode = 'CTRQ0';
  end if;

  select status, version into v_status, v_version
  from public.observations
  where id = p_obs_id and not is_deleted
  for update;

  if not found then
    raise exception 'Observation not found' using errcode = 'CTNF0';
  end if;
  -- 'synced' is "Needs review" in the apps.
  if v_status <> 'synced' then
    raise exception 'Observation is %, not waiting for review', v_status using errcode = 'CTST0';
  end if;
  if v_version <> p_version then
    raise exception 'Observation changed since you opened it (now version %)', v_version using errcode = 'CTVR0';
  end if;

  insert into public.observation_reviews (observation_id, reviewer_id, observation_version, decision, comment)
  values (p_obs_id, auth.uid(), v_version, p_decision, nullif(btrim(p_comment), ''))
  returning * into v_review;

  return v_review;
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon directly, so
-- revoke it explicitly. Signed-in users may call it; the function itself
-- decides who is an officer or admin.
revoke execute on function public.review_observation(uuid, int, text, text) from public, anon;
grant  execute on function public.review_observation(uuid, int, text, text) to authenticated;
