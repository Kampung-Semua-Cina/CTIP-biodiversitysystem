-- =====================================================================
-- Adds the extra sensor readings, node location and sensor images.
-- Safe to run more than once. Does not delete any data.
--
-- Folder convention for the new bucket (the API must upload using this path):
--   sensor-images/{node_id}/{image_id}.jpg
-- =====================================================================

-- 1. Extra readings: humidity, movement and (optional) GPS position
alter table public.telemetry
  add column if not exists humidity         double precision,
  add column if not exists motion_detected  boolean,
  add column if not exists lat              double precision,
  add column if not exists lng              double precision;

-- 2. Where each node was installed
alter table public.sensor_nodes
  add column if not exists lat  double precision,
  add column if not exists lng  double precision;

-- 3. Photos taken by a sensor node
create table if not exists public.sensor_images (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references public.sensor_nodes(id) on delete cascade,
  alert_id     uuid references public.alerts(id) on delete set null,
  captured_at  timestamptz not null default now(),
  s3_bucket    text not null default 'sensor-images',
  s3_key       text not null unique,
  size_bytes   int,
  created_at   timestamptz not null default now()
);

create index if not exists sensor_images_node_id_captured_at_idx
  on public.sensor_images (node_id, captured_at desc);

alter table public.sensor_images enable row level security;

drop policy if exists "sensor images: staff" on public.sensor_images;
create policy "sensor images: staff" on public.sensor_images for select to authenticated
  using (public.my_role() in ('officer', 'admin'));

-- 4. Private bucket for those photos (2 MB max, JPEG only). Officers and
--    admins can view. There is no upload rule on purpose: the API stores
--    these files with the service_role key after checking the node's
--    X-Sensor-Key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sensor-images', 'sensor-images', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "sensor images: staff read" on storage.objects;
create policy "sensor images: staff read"
on storage.objects for select to authenticated
using (bucket_id = 'sensor-images' and public.my_role() in ('officer', 'admin'));
