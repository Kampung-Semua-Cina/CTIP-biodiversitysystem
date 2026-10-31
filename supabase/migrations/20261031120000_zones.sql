-- Zones for the Reports filter (CTIP-109).
--
-- A zone is one square of the 0.01 degree grid (about 1.1 km across at Niah),
-- the same grid protectSpecimen() in services/api/src/distribution.js snaps
-- endangered plants to. That is what keeps the filter safe: knowing a plant's
-- zone tells you exactly what its reduced location already tells you, and never
-- more. Do not add zones smaller than, or not lined up with, this grid without
-- changing how the filter treats endangered plants.
--
-- A plant's zone comes from its GPS, so botanists enter nothing and no client
-- can set it. A plant with no GPS fix has no zone. A square gets its row the
-- first time a plant is recorded in it. `name` can later be changed to a place
-- name the park uses, through a new migration, without touching any plant.

create table if not exists public.zones (
  id          text primary key,            -- 'N3.81-E113.77', the square's south-west corner
  name        text not null,
  min_lat     numeric(5, 2) not null,      -- the square runs 0.01 degrees north and east of here
  min_lng     numeric(5, 2) not null,
  created_at  timestamptz not null default now()
);

-- Which grid line a coordinate sits on. The division must stay in double
-- precision so it lands in the same square as Math.floor(v / 0.01) in the API.
create or replace function public.zone_corner(v double precision)
returns numeric language sql immutable set search_path = '' as $$
  select floor(v / 0.01::double precision)::numeric * 0.01
$$;

create or replace function public.zone_id_for(lat double precision, lng double precision)
returns text language sql immutable set search_path = '' as $$
  select case when public.zone_corner(lat) < 0 then 'S' else 'N' end || abs(public.zone_corner(lat))::text
      || '-'
      || case when public.zone_corner(lng) < 0 then 'W' else 'E' end || abs(public.zone_corner(lng))::text
$$;

-- Squares that already hold plants, before the column's foreign key needs them.
insert into public.zones (id, name, min_lat, min_lng)
select distinct public.zone_id_for(lat, lng),
       replace(public.zone_id_for(lat, lng), '-', ' '),
       public.zone_corner(lat),
       public.zone_corner(lng)
from public.specimens
where lat is not null and lng is not null
on conflict (id) do nothing;

-- Generated, so it always follows lat/lng and cannot be written by anyone.
-- Adding it fills every existing plant without touching updated_at or the audit log.
alter table public.specimens
  add column if not exists zone_id text
  generated always as (public.zone_id_for(lat, lng)) stored
  references public.zones (id);

create index if not exists specimens_zone_id_idx on public.specimens (zone_id);

-- A plant in a new square adds the square. Security definer because no client
-- may write to zones: this trigger is the only way a row is added.
create or replace function public.add_specimen_zone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lat is not null and new.lng is not null then
    insert into public.zones (id, name, min_lat, min_lng)
    values (public.zone_id_for(new.lat, new.lng),
            replace(public.zone_id_for(new.lat, new.lng), '-', ' '),
            public.zone_corner(new.lat),
            public.zone_corner(new.lng))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_add_specimen_zone on public.specimens;
create trigger trg_add_specimen_zone before insert or update of lat, lng on public.specimens
  for each row execute function public.add_specimen_zone();

revoke execute on function public.add_specimen_zone() from public, anon, authenticated;

-- The list of squares goes only to the roles allowed exact locations. There are
-- no write policies on purpose.
alter table public.zones enable row level security;

drop policy if exists "zones: staff read" on public.zones;
create policy "zones: staff read" on public.zones for select to authenticated
  using (public.my_role() in ('officer', 'admin'));
