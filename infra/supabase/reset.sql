-- =====================================================================
-- RESET: removes the project tables, triggers and functions so schema.sql can run cleanly.
-- WARNING: deletes all data in these tables. Only use while setting up.
-- =====================================================================

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.notifications,
  public.alert_notes,
  public.alerts,
  public.telemetry,
  public.sensor_nodes,
  public.species_media,
  public.observation_comments,
  public.observation_reviews,
  public.observation_photos,
  public.observations,
  public.specimens,
  public.species,
  public.qr_tags,
  public.audit_logs,
  public.profiles
cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.audit_changes() cascade;
drop function if exists public.my_role() cascade;
drop function if exists public.guard_specimen_update() cascade;
drop function if exists public.apply_review_decision() cascade;
drop function if exists public.notify_on_review() cascade;
drop function if exists public.notify_on_comment() cascade;
drop function if exists public.notify_on_alert_assigned() cascade;
drop function if exists public.notify_on_alert_created() cascade;