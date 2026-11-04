-- =====================================================================
-- Change detection for the apps' live updates.
--
-- The apps used to reload every list (19 queries, every photo link signed
-- again) every 5 seconds per open screen, which kept the shared database
-- busy enough that requests timed out. Now every write to a table the
-- apps load adds 1 to that table's counter here. Each poll reads these
-- counters (one tiny query) and GET /v1/workspace reloads only the lists
-- whose counter moved since the app's last load.
--
-- The counters say only how often a table changed, nothing about what is
-- in it, so every signed-in user may read them.
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.table_versions (
  table_name  text primary key,
  version     bigint not null default 0,
  changed_at  timestamptz not null default now()
);

alter table public.table_versions enable row level security;
drop policy if exists "table_versions: signed-in read" on public.table_versions;
create policy "table_versions: signed-in read" on public.table_versions for select to authenticated
  using (true);
-- No insert, update or delete policy: only the trigger below writes here.

-- One bump per statement (not per row), so a batch of 500 new QR tags is one change.
create or replace function public.bump_table_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.table_versions as tv (table_name, version, changed_at)
  values (tg_table_name, 1, now())
  on conflict (table_name) do update set version = tv.version + 1, changed_at = now();
  return null;
exception when others then
  -- A counter must never stop the real write.
  raise warning 'bump_table_version(%): % (%)', tg_table_name, sqlerrm, sqlstate;
  return null;
end;
$$;
revoke execute on function public.bump_table_version() from public, anon, authenticated;

-- Every table GET /v1/workspace loads.
do $$
declare t text;
begin
  foreach t in array array[
    'species', 'species_media', 'qr_tags', 'specimens', 'observations',
    'observation_photos', 'observation_reviews', 'observation_comments',
    'alerts', 'alert_notes', 'sensor_nodes', 'notifications', 'audit_logs',
    'profiles', 'zones', 'discussions', 'discussion_audience', 'discussion_posts']
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'table_versions: % does not exist, skipped', t;
      continue;
    end if;
    execute format('drop trigger if exists trg_table_version on public.%I', t);
    execute format(
      'create trigger trg_table_version after insert or update or delete or truncate on public.%I
         for each statement execute function public.bump_table_version()', t);
    insert into public.table_versions (table_name) values (t) on conflict do nothing;
  end loop;
end;
$$;
