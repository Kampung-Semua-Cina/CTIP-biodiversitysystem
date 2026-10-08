-- =====================================================================
-- CTIP-17: bring back sensor images.
--
-- 20261008080000 removed the sensor_images table and the sensor-images
-- bucket because the ESP32 node has no camera. The team has since decided
-- that a laptop webcam will act as the node's camera: a capture script
-- takes a photo when the node reports motion and uploads it through the
-- API. This recreates the table, bucket and access rules exactly as they
-- were in 20261008000000.
--
-- Folder convention for the bucket (the API must upload using this path):
--   sensor-images/{node_id}/{image_id}.jpg
--
-- Safe to run more than once. Does not change any other data.
-- =====================================================================

-- 1. Photos linked to a sensor node (and optionally to the alert they evidence)
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

comment on table public.sensor_images is
  'Photos from the laptop webcam that acts as a sensor node''s camera.';

create index if not exists sensor_images_node_id_captured_at_idx
  on public.sensor_images (node_id, captured_at desc);

alter table public.sensor_images enable row level security;

drop policy if exists "sensor images: staff" on public.sensor_images;
create policy "sensor images: staff" on public.sensor_images for select to authenticated
  using (public.my_role() in ('officer', 'admin'));

-- 2. Private bucket for those photos (2 MB max, JPEG only). Officers and
--    admins can view. There is no upload rule on purpose: the API stores
--    these files with the service_role key after checking the X-Sensor-Key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sensor-images', 'sensor-images', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "sensor images: staff read" on storage.objects;
create policy "sensor images: staff read"
on storage.objects for select to authenticated
using (bucket_id = 'sensor-images' and public.my_role() in ('officer', 'admin'));
