-- Visitor public plants and observation photos (CTIP-33 / visitor catalogue)
--
-- Enables public unauthenticated visitors to read published plants and their
-- observation photos with endangered plant coordinates snapped to 0.01 grid,
-- matching protectSpecimen() in services/api/src/distribution.js.

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

create or replace function public.public_observation_photos()
returns table (
  id uuid,
  observation_id uuid,
  s3_key text,
  s3_bucket text,
  created_at text
)
language sql
stable
security definer
set search_path = public
as $$
  select ph.id, ph.observation_id, ph.s3_key, ph.s3_bucket, ph.created_at::text
  from public.observation_photos ph
  join public.observations o on o.id = ph.observation_id
  join public.specimens s on s.id = o.specimen_id
  join public.species sp on sp.id = s.species_id
  where not s.is_deleted
    and sp.is_published
    and not sp.is_deleted
    and o.status = 'approved'
    and not o.is_deleted;
$$;

revoke execute on function public.public_observation_photos() from public;
grant  execute on function public.public_observation_photos() to anon, authenticated;
