-- =====================================================================
-- CTIP-29 / CTIP-86: an observation can only be approved once its plant is
-- linked to a species. The web review page already asked for this; now the
-- database function the API calls enforces it too, so a direct API call (or
-- a direct call to the function) cannot approve a record with no species.
--
-- Same function as 20261026000000_review_observation_rpc.sql, plus one check:
--   CTSP0  approving, but the plant has no species, or its species was
--          deleted                                    -> API 422 SPECIES_REQUIRED
-- Return and reject do not need a species: a wrong guess is a common reason
-- to return a record.
--
-- It also closes the two other ways a decision could be written without
-- these checks (bugs.md M2):
--   - the "reviews: insert" policy let an officer insert into
--     observation_reviews directly, skipping the lock, version, status and
--     species checks. review_observation() is security definer, so it still
--     inserts; nobody else can.
--   - the older approve_observation() has no species check and is no longer
--     used by the apps or the API; signed-in users can no longer call it.
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
  v_status   text;
  v_version  int;
  v_specimen uuid;
  v_species  uuid;
  v_review   public.observation_reviews;
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

  select status, version, specimen_id into v_status, v_version, v_specimen
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

  -- The plant row is locked too, so the species cannot be cleared between
  -- this check and the decision being saved.
  if p_decision = 'approve' then
    select s.id into v_species
    from public.specimens sp
    left join public.species s on s.id = sp.species_id and not s.is_deleted
    where sp.id = v_specimen
    for update of sp;
    if v_species is null then
      raise exception 'Confirm the species before approving' using errcode = 'CTSP0';
    end if;
  end if;

  insert into public.observation_reviews (observation_id, reviewer_id, observation_version, decision, comment)
  values (p_obs_id, auth.uid(), v_version, p_decision, nullif(btrim(p_comment), ''))
  returning * into v_review;

  return v_review;
end;
$$;

-- create or replace keeps the grants, but repeat them so this file is
-- correct on its own.
revoke execute on function public.review_observation(uuid, int, text, text) from public, anon;
grant  execute on function public.review_observation(uuid, int, text, text) to authenticated;

-- Decisions are written only by review_observation().
drop policy if exists "reviews: insert" on public.observation_reviews;

-- Superseded by review_observation(); kept so older migrations still apply.
revoke execute on function public.approve_observation(uuid, text) from public, anon, authenticated;
