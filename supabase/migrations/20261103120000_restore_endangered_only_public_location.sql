-- Undo 20261103000000_hide_vulnerable_plants (CTIP-71).
--
-- That migration made public_plant_by_tag() and public_plants() reduce the
-- location of every vulnerable plant. It was applied to the live database
-- before PR #46 was merged, and the matching API change was then reverted,
-- so the two disagreed: an officer could untick "Hide the exact location" for
-- a vulnerable plant and visitors still got the 1.1 km area.
--
-- This puts both functions back to the rule used everywhere else
-- (protectSpecimen() in services/api/src/distribution.js, plantView in
-- apps/shared/selectors.js): the officer's per-plant flag, or the species
-- status endangered / critically endangered. Vulnerable plants are hidden by
-- default through that flag, which the officer sets at review.
--
-- The definitions are the same as 20261030000000 and 20261031000000.
-- 20261103000000 stays in place because it is already recorded as applied.

create or replace function public.public_plant_by_tag(p_qr_id text)
returns table (
  qr_id            text,
  species_id       uuid,
  lat              double precision,
  lng              double precision,
  location_reduced boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with plant as (
    select s.qr_id, s.species_id, s.lat, s.lng,
           (s.endangered_override
             or lower(trim(sp.conservation_status)) in ('endangered', 'critically endangered')) as endangered
    from public.specimens s
    join public.species sp on sp.id = s.species_id
    where s.qr_id = p_qr_id
      and not s.is_deleted
      and sp.is_published
      and not sp.is_deleted
      and exists (
        select 1 from public.observations o
        where o.specimen_id = s.id and o.status = 'approved' and not o.is_deleted
      )
  )
  select qr_id,
         species_id,
         case when endangered and lat is not null then round(((floor(lat / 0.01) + 0.5) * 0.01)::numeric, 3)::double precision else lat end,
         case when endangered and lng is not null then round(((floor(lng / 0.01) + 0.5) * 0.01)::numeric, 3)::double precision else lng end,
         endangered
  from plant;
$$;

revoke execute on function public.public_plant_by_tag(text) from public;
grant  execute on function public.public_plant_by_tag(text) to anon, authenticated;

create or replace function public.public_plants()
returns table (
  id uuid,
  qr_id text,
  species_id uuid,
  lat double precision,
  lng double precision,
  gps_accuracy_m double precision,
  endangered_override boolean,
  is_deleted boolean,
  observation_id uuid,
  height_cm text,
  morphology text,
  observed_at text
)
language sql
stable
security definer
set search_path = public
as $$
  with plant as (
    select s.id, s.qr_id, s.species_id, s.lat, s.lng, s.gps_accuracy_m, s.endangered_override, s.is_deleted,
           o.id as observation_id, o.height_cm, o.morphology, o.observed_at::text,
           (s.endangered_override or lower(trim(sp.conservation_status)) in ('endangered', 'critically endangered')) as endangered
    from public.specimens s
    join public.species sp on sp.id = s.species_id
    join public.observations o on o.specimen_id = s.id
    where not s.is_deleted
      and sp.is_published
      and not sp.is_deleted
      and o.status = 'approved'
      and not o.is_deleted
  )
  select id,
         qr_id,
         species_id,
         case when endangered and lat is not null then round(((floor(lat / 0.01) + 0.5) * 0.01)::numeric, 3)::double precision else lat end,
         case when endangered and lng is not null then round(((floor(lng / 0.01) + 0.5) * 0.01)::numeric, 3)::double precision else lng end,
         case when endangered then 1100.0 else gps_accuracy_m end,
         endangered_override,
         is_deleted,
         observation_id,
         height_cm,
         morphology,
         observed_at
  from plant;
$$;

revoke execute on function public.public_plants() from public;
grant  execute on function public.public_plants() to anon, authenticated;
