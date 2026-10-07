-- =====================================================================
-- STORAGE: buckets + access rules for photos
-- Run in SQL Editor AFTER schema.sql.
--
-- Folder convention (the app must upload using these paths):
--   observation-photos/{observation_id}/{photo_id}.jpg
--   species-media/{species_id}/{media_id}.jpg
-- Store the bucket name in s3_bucket and the path in s3_key.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Create the buckets
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Field photos: PRIVATE (may reveal endangered plant locations)
  ('observation-photos', 'observation-photos', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  -- Catalogue images: PUBLIC so visitors can see them without logging in
  ('species-media', 'species-media', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 2. observation-photos rules
--    The first folder in the path is the observation id. A user may read,
--    upload or update a photo only if they can see that observation (the
--    observations table's own rules decide that: owner, officer or admin).
-- ---------------------------------------------------------------------

create policy "obs photos: read if can see observation"
on storage.objects for select to authenticated
using (
  bucket_id = 'observation-photos'
  and exists (
    select 1 from public.observations o
    where o.id::text = (storage.foldername(name))[1]
  )
);

create policy "obs photos: upload to own observation or staff"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'observation-photos'
  and exists (
    select 1 from public.observations o
    where o.id::text = (storage.foldername(name))[1]
      and (o.recorded_by = auth.uid() or public.my_role() in ('officer', 'admin'))
  )
);

-- Without this, the client can never flip pending -> uploaded after the
-- file transfer finishes, so confirmObservationPhoto (and any upsert)
-- fails silently.
create policy "obs photos: update own or staff"
on storage.objects for update to authenticated
using (
  bucket_id = 'observation-photos'
  and exists (
    select 1 from public.observations o
    where o.id::text = (storage.foldername(name))[1]
      and (o.recorded_by = auth.uid() or public.my_role() in ('officer', 'admin'))
  )
);

create policy "obs photos: staff delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'observation-photos'
  and public.my_role() in ('officer', 'admin')
);


-- ---------------------------------------------------------------------
-- 3. species-media rules
--    Bucket is public, so anyone (including visitors) can view files.
--    Only officers and admins can upload, replace or delete.
-- ---------------------------------------------------------------------

create policy "species media: staff upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'species-media' and public.my_role() in ('officer', 'admin'));

create policy "species media: staff update"
on storage.objects for update to authenticated
using (bucket_id = 'species-media' and public.my_role() in ('officer', 'admin'));

create policy "species media: staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'species-media' and public.my_role() in ('officer', 'admin'));