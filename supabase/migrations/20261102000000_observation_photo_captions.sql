-- A field photo can say what it shows: a short caption, and tags from the list in
-- services/api/src/field.js (Tree trunk, Flower and so on). Existing photos get none.
--
-- public_observation_photos() is left as it is, so visitors do not get these: a
-- caption is free text and could describe where a protected plant is.
alter table public.observation_photos
  add column caption text check (char_length(caption) <= 200),
  add column traits text[] not null default '{}';
