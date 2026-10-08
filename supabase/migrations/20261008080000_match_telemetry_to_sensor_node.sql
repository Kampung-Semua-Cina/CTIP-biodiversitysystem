-- =====================================================================
-- CTIP-17: match telemetry to the real sensor node.
--
-- The prototype node is an ESP32 with a DHT11 (temperature, humidity),
-- a YL-69 (soil moisture) and an HC-SR04 (ultrasonic distance). It has
-- no camera.
--
-- 1. Adds distance_cm for the HC-SR04. The node also uses the HC-SR04 to
--    set motion_detected when the distance changes. lat / lng stay for
--    nodes that have GPS.
-- 2. Removes sensor images, which no node can send: the sensor_images
--    table and the sensor-images storage bucket.
--
-- Checked on 8 Oct 2026: sensor_images and the sensor-images bucket held
-- no data. The bucket is only deleted if it is still empty.
--
-- Safe to run more than once.
-- =====================================================================

-- 1. HC-SR04 distance reading
alter table public.telemetry
  add column if not exists distance_cm double precision;

alter table public.telemetry
  drop constraint if exists telemetry_distance_cm_check;
alter table public.telemetry
  add constraint telemetry_distance_cm_check check (distance_cm is null or distance_cm >= 0);

comment on column public.telemetry.distance_cm is
  'HC-SR04 distance to the nearest object, in cm. Null if the sensor timed out.';
comment on column public.telemetry.motion_detected is
  'True if the HC-SR04 distance changed by more than the node''s threshold since the last reading.';

-- 2a. Sensor image storage: policy, then the bucket (only if empty).
--     Supabase blocks direct deletes from storage tables unless
--     storage.allow_delete_query is set for the transaction; the DO block
--     keeps the setting and the delete in the same transaction.
drop policy if exists "sensor images: staff read" on storage.objects;

do $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'sensor-images') then
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.buckets where id = 'sensor-images';
  else
    raise notice 'sensor-images bucket still has files, so it was not deleted';
  end if;
end;
$$;

-- 2b. Sensor image table (its index and policy go with it)
drop table if exists public.sensor_images;
