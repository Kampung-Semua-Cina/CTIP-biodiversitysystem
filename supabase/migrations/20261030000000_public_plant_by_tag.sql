-- Visitor QR page (CTIP-33): look up one published plant by its tag.
--
-- Visitors (anon) still cannot read public.specimens. A read policy for anon
-- would hand every exact location to anyone holding the publishable key,
-- which ships inside the apps, without going through the API. Instead this
-- function returns one plant at a time, only when it is public, and with the
-- location of an endangered plant already reduced here in the database.
--
-- A plant is public when (same rule as plantView in apps/shared/selectors.js):
--   - the plant is not deleted,
--   - it has a confirmed species that is published and not deleted,
--   - it has at least one approved, non-deleted observation.
--
-- Endangered: the officer's per-plant flag, or the species' status
-- (endangered / critically endangered, compared without case). Its location
-- is snapped to the centre of a 0.01 degree grid square, the same rule as
-- protectSpecimen() in services/api/src/distribution.js. The API applies
-- protectSpecimen() again on top; snapping twice gives the same point.
-- A plant with no GPS fix keeps null coordinates.

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

-- Supabase grants EXECUTE on new public functions to anon and authenticated
-- directly (see 20261008063000). Visitors need it here: the API calls this
-- with the publishable key.
revoke execute on function public.public_plant_by_tag(text) from public;
grant  execute on function public.public_plant_by_tag(text) to anon, authenticated;
