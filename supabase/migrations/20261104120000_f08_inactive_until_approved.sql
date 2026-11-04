-- CTIP-50 / F-08: a new account gets no access until an admin turns it on.
-- New profiles start inactive; a restrictive "active users only" policy on every
-- table (except profiles) and on Storage blocks inactive and deactivated users.
-- The admin invite (POST /profiles) already sets is_active = true. Safe to run twice.

alter table public.profiles alter column is_active set default false;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_active from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'alert_notes', 'alerts', 'audit_logs', 'notifications',
    'observation_comments', 'observation_photos', 'observation_reviews',
    'observations', 'qr_tags', 'sensor_images', 'sensor_nodes', 'species',
    'species_media', 'specimens', 'telemetry', 'zones'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "active users only" on public.%I', t);
      execute format(
        'create policy "active users only" on public.%I as restrictive '
        'for all to authenticated '
        'using (public.is_active_user()) with check (public.is_active_user())', t);
    end if;
  end loop;
end
$$;

drop policy if exists "active users only" on storage.objects;
create policy "active users only" on storage.objects as restrictive
  for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());