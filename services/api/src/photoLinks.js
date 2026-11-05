// Photo rows keep a Storage path in s3_key ("{species_id}/{media_id}.jpg").
// Rows saved by older app builds may hold a full link there instead.

// Any link with a scheme (https:, data:, ...): not a file in our Storage.
export const isFullLink = (key) => /^[a-z]+:/i.test(key);

// A link the apps can open as it is.
export const isWebLink = (key) => /^https?:/i.test(key);

// Public link for a species photo (species-media is a public bucket).
export const publicMediaUrl = (db, { s3_bucket, s3_key }) =>
  (isWebLink(s3_key) ? s3_key : db.storage.from(s3_bucket || 'species-media').getPublicUrl(s3_key).data.publicUrl);
