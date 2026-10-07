-- =====================================================================
-- Smart Ground-Truthing & Digital Biodiversity System — Supabase schema
-- Paste this whole file into Supabase SQL Editor and click Run.
-- Signed-in roles: botanist, officer, admin.
-- Visitors do NOT have accounts: they use the public "anon" key and can only read
-- published species + their media (see "public read" policies in Part 4).
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART 1: TABLES
-- ---------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  role        text not null default 'botanist'
              check (role in ('botanist', 'officer', 'admin')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  changed_by  uuid references public.profiles(id) on delete set null,
  table_name  text not null,
  record_id   text not null,  -- PK of affected row; text so it fits uuid and qr_id
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_value   jsonb,
  new_value   jsonb,
  changed_at  timestamptz not null default now()
);

create table public.qr_tags (
  qr_id        text primary key,
  status       text not null default 'unassigned'
               check (status in ('unassigned', 'assigned', 'damaged', 'retired')),
  batch_label  text,          -- print batch, for tracing faded/defective runs
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.species (
  id                     uuid primary key default gen_random_uuid(),
  scientific_name        text not null unique,
  common_name            text,
  family                 text,
  genus                  text,
  description            text,
  conservation_status    text,
  cultural_significance  text,
  is_published           boolean not null default false,
  is_deleted             boolean not null default false,
  created_by             uuid references public.profiles(id) on delete set null,
  updated_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.specimens (
  id                     uuid primary key default gen_random_uuid(),
  qr_id                  text unique references public.qr_tags(qr_id),
  species_id             uuid references public.species(id),  -- NULL until matched by officer
  proposed_species_name  text,                                -- botanist's field guess
  registered_by          uuid references public.profiles(id) on delete set null,
  lat                    double precision,
  lng                    double precision,
  gps_accuracy_m         double precision,
  endangered_override    boolean not null default false,
  is_deleted             boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.observations (
  id              uuid primary key default gen_random_uuid(),  -- app may generate offline
  specimen_id     uuid not null references public.specimens(id),
  recorded_by     uuid references public.profiles(id) on delete set null,
  observed_at     timestamptz not null default now(),
  height_cm       numeric,
  morphology      text,
  notes           text,
  lat             double precision,
  lng             double precision,
  gps_accuracy_m  double precision,
  status          text not null default 'draft'
                  check (status in ('draft', 'queued', 'synced', 'returned', 'approved', 'rejected')),
  version         int not null default 1,
  device_id       text,
  last_synced_at  timestamptz,
  is_deleted      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.observation_photos (
  id              uuid primary key default gen_random_uuid(),
  observation_id  uuid not null references public.observations(id) on delete cascade,
  s3_bucket       text not null,
  s3_key          text not null unique,
  content_type    text,
  size_bytes      int,
  upload_status   text not null default 'pending'
                  check (upload_status in ('pending', 'uploaded', 'failed')),
  created_at      timestamptz not null default now()
);

create table public.observation_reviews (
  id                   uuid primary key default gen_random_uuid(),
  observation_id       uuid not null references public.observations(id) on delete cascade,
  reviewer_id          uuid references public.profiles(id) on delete set null,
  observation_version  int not null,
  decision             text not null check (decision in ('approve', 'return', 'reject')),
  comment              text,
  created_at           timestamptz not null default now()
);

create table public.observation_comments (
  id              uuid primary key default gen_random_uuid(),
  observation_id  uuid not null references public.observations(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now()
);

create table public.species_media (
  id           uuid primary key default gen_random_uuid(),
  species_id   uuid not null references public.species(id) on delete cascade,
  s3_bucket    text not null,
  s3_key       text not null unique,
  caption      text,
  credit       text,
  is_primary   boolean not null default false,  -- thumbnail/cover image
  sort_order   int not null default 0,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.sensor_nodes (
  id           uuid primary key default gen_random_uuid(),
  specimen_id  uuid references public.specimens(id),
  status       text not null default 'active'
               check (status in ('active', 'offline', 'maintenance', 'retired')),
  thresholds   jsonb,
  last_seen    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.telemetry (
  id             uuid primary key default gen_random_uuid(),
  node_id        uuid not null references public.sensor_nodes(id) on delete cascade,
  ts             timestamptz not null default now(),
  temperature    double precision,
  soil_moisture  double precision
);

create table public.alerts (
  id               uuid primary key default gen_random_uuid(),
  node_id          uuid references public.sensor_nodes(id),
  type             text not null,
  reading          jsonb,
  severity         text not null default 'medium'
                   check (severity in ('low', 'medium', 'high', 'critical')),
  status           text not null default 'open'
                   check (status in ('open', 'acknowledged', 'resolved')),
  assigned_to      uuid references public.profiles(id) on delete set null,
  acknowledged_by  uuid references public.profiles(id) on delete set null,
  acknowledged_at  timestamptz,
  resolved_by      uuid references public.profiles(id) on delete set null,
  resolved_at      timestamptz,
  outcome          text,
  created_at       timestamptz not null default now()
);

create table public.alert_notes (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references public.alerts(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  note        text not null,
  created_at  timestamptz not null default now()
);

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           text not null check (type in (
                   'review_returned', 'review_approved', 'review_rejected',
                   'comment_reply', 'alert_assigned', 'alert_created')),
  title          text,
  body           text,
  related_table  text,
  related_id     text,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- PART 2: INDEXES (Postgres does not index foreign keys automatically)
-- ---------------------------------------------------------------------

create index on public.audit_logs (table_name, record_id);
create index on public.specimens (species_id);
create index on public.specimens (registered_by);
create index on public.observations (specimen_id);
create index on public.observations (recorded_by);
create index on public.observations (status);
create index on public.observation_photos (observation_id);
create index on public.observation_reviews (observation_id);
create index on public.observation_comments (observation_id);
create index on public.species_media (species_id);
create index on public.sensor_nodes (specimen_id);
create index on public.telemetry (node_id, ts desc);
create index on public.alerts (node_id);
create index on public.alerts (status);
create index on public.alert_notes (alert_id);
create index on public.notifications (user_id, is_read);


-- ---------------------------------------------------------------------
-- PART 3: TRIGGERS
-- ---------------------------------------------------------------------

-- 3a. Auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3b. Keep updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated     before update on public.profiles     for each row execute function public.set_updated_at();
create trigger trg_species_updated      before update on public.species      for each row execute function public.set_updated_at();
create trigger trg_specimens_updated    before update on public.specimens    for each row execute function public.set_updated_at();
create trigger trg_observations_updated before update on public.observations for each row execute function public.set_updated_at();
create trigger trg_sensor_nodes_updated before update on public.sensor_nodes for each row execute function public.set_updated_at();

-- 3c. Write to audit_logs on important tables (profiles included, so
--     role promotions — e.g. to admin — are no longer invisible)
create or replace function public.audit_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (changed_by, table_name, record_id, action, old_value, new_value)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_species      after insert or update or delete on public.species      for each row execute function public.audit_changes();
create trigger audit_specimens    after insert or update or delete on public.specimens    for each row execute function public.audit_changes();
create trigger audit_observations after insert or update or delete on public.observations for each row execute function public.audit_changes();
create trigger audit_alerts       after insert or update or delete on public.alerts       for each row execute function public.audit_changes();
create trigger audit_profiles     after insert or update or delete on public.profiles     for each row execute function public.audit_changes();

-- 3d. Only officers/admins may set species_id or endangered_override on
--     a specimen — closes the gap where a botanist could self-identify
--     their own find or flip the endangered flag.
create or replace function public.guard_specimen_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.my_role() not in ('officer', 'admin') and
     (new.species_id is distinct from old.species_id
      or new.endangered_override is distinct from old.endangered_override) then
    raise exception 'Only officers can set species or endangered status';
  end if;
  return new;
end;
$$;

create trigger trg_guard_specimen before update on public.specimens
  for each row execute function public.guard_specimen_update();

-- 3e. A review decision actually moves the observation's status
create or replace function public.apply_review_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.observations
  set status = case new.decision
                 when 'approve' then 'approved'
                 when 'return'  then 'returned'
                 when 'reject'  then 'rejected'
               end
  where id = new.observation_id;
  return new;
end;
$$;

create trigger trg_apply_review_decision after insert on public.observation_reviews
  for each row execute function public.apply_review_decision();

-- 3f. Notification triggers. These run security definer, so they
--     bypass RLS on notifications the same way a service_role call
--     would — notifications intentionally has no client INSERT policy.
create or replace function public.notify_on_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recorded_by uuid;
  v_type text;
begin
  select recorded_by into v_recorded_by
  from public.observations where id = new.observation_id;

  v_type := case new.decision
              when 'approve' then 'review_approved'
              when 'return'  then 'review_returned'
              when 'reject'  then 'review_rejected'
            end;

  insert into public.notifications (user_id, type, title, body, related_table, related_id)
  values (v_recorded_by, v_type, initcap(replace(v_type, '_', ' ')), new.comment,
          'observations', new.observation_id::text);
  return new;
end;
$$;

create trigger trg_notify_on_review after insert on public.observation_reviews
  for each row execute function public.notify_on_review();

create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recorded_by uuid;
begin
  select recorded_by into v_recorded_by
  from public.observations where id = new.observation_id;

  if new.author_id is distinct from v_recorded_by then
    insert into public.notifications (user_id, type, title, body, related_table, related_id)
    values (v_recorded_by, 'comment_reply', 'New comment on your observation', new.body,
            'observations', new.observation_id::text);
  end if;
  return new;
end;
$$;

create trigger trg_notify_on_comment after insert on public.observation_comments
  for each row execute function public.notify_on_comment();

create or replace function public.notify_on_alert_assigned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    insert into public.notifications (user_id, type, title, body, related_table, related_id)
    values (new.assigned_to, 'alert_assigned', 'Alert assigned to you', new.type,
            'alerts', new.id::text);
  end if;
  return new;
end;
$$;

create trigger trg_notify_on_alert_assigned after update on public.alerts
  for each row execute function public.notify_on_alert_assigned();

create or replace function public.notify_on_alert_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, related_table, related_id)
  select id, 'alert_created', 'New alert: ' || new.type, new.outcome, 'alerts', new.id::text
  from public.profiles
  where role in ('officer', 'admin') and is_active;
  return new;
end;
$$;

create trigger trg_notify_on_alert_created after insert on public.alerts
  for each row execute function public.notify_on_alert_created();


-- ---------------------------------------------------------------------
-- PART 4: ROW LEVEL SECURITY (starter policies — refine with your team)
-- ---------------------------------------------------------------------

-- Helper: the logged-in user's role
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

alter table public.profiles             enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.qr_tags              enable row level security;
alter table public.species              enable row level security;
alter table public.specimens            enable row level security;
alter table public.observations         enable row level security;
alter table public.observation_photos   enable row level security;
alter table public.observation_reviews  enable row level security;
alter table public.observation_comments enable row level security;
alter table public.species_media        enable row level security;
alter table public.sensor_nodes         enable row level security;
alter table public.telemetry            enable row level security;
alter table public.alerts               enable row level security;
alter table public.alert_notes          enable row level security;
alter table public.notifications        enable row level security;

-- profiles: see yourself; staff see everyone; only admins change rows (stops users promoting themselves)
create policy "profiles: read own"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: staff read" on public.profiles for select to authenticated using (public.my_role() in ('officer', 'admin'));
create policy "profiles: admin edit" on public.profiles for update to authenticated using (public.my_role() = 'admin');

-- audit_logs: admins only
create policy "audit: admin read" on public.audit_logs for select to authenticated using (public.my_role() = 'admin');

-- qr_tags
create policy "qr: read"        on public.qr_tags for select to authenticated using (true);
create policy "qr: staff write" on public.qr_tags for all    to authenticated
  using (public.my_role() in ('officer', 'admin')) with check (public.my_role() in ('officer', 'admin'));

-- species: public sees published catalogue; staff see and edit everything
create policy "species: public read" on public.species for select to anon, authenticated
  using (is_published and not is_deleted);
create policy "species: staff read"  on public.species for select to authenticated using (public.my_role() in ('officer', 'admin'));
create policy "species: staff write" on public.species for all    to authenticated
  using (public.my_role() in ('officer', 'admin')) with check (public.my_role() in ('officer', 'admin'));

-- species_media: follows the species' visibility
create policy "media: public read" on public.species_media for select to anon, authenticated
  using (exists (select 1 from public.species s where s.id = species_id and s.is_published and not s.is_deleted));
create policy "media: staff write" on public.species_media for all to authenticated
  using (public.my_role() in ('officer', 'admin')) with check (public.my_role() in ('officer', 'admin'));

-- specimens
create policy "specimens: read"     on public.specimens for select to authenticated using (true);
create policy "specimens: register" on public.specimens for insert to authenticated with check (registered_by = auth.uid());
create policy "specimens: update"   on public.specimens for update to authenticated
  using (registered_by = auth.uid() or public.my_role() in ('officer', 'admin'));

-- observations: botanists handle their own; staff see/edit all.
-- Insert is restricted to the three client-reachable statuses so a
-- botanist can never insert a row that's already 'approved'.
create policy "obs: read own or staff" on public.observations for select to authenticated
  using (recorded_by = auth.uid() or public.my_role() in ('officer', 'admin'));
create policy "obs: create own" on public.observations for insert to authenticated
  with check (recorded_by = (select auth.uid()) and status in ('draft', 'queued', 'synced'));
create policy "obs: edit own unreviewed" on public.observations for update to authenticated
  using (recorded_by = auth.uid() and status in ('draft', 'queued', 'synced', 'returned'));
create policy "obs: staff edit"        on public.observations for update to authenticated
  using (public.my_role() in ('officer', 'admin'));

-- photos: anyone who can see the observation can read; owner or staff
-- can insert/update (flip pending -> uploaded)/delete.
create policy "photos: read"   on public.observation_photos for select to authenticated
  using (exists (select 1 from public.observations o where o.id = observation_id));
create policy "photos: insert" on public.observation_photos for insert to authenticated
with check (
  exists (
    select 1 from public.observations o 
    where o.id = observation_id 
    and (o.recorded_by = auth.uid() or public.my_role() in ('officer', 'admin'))
  )
);
create policy "photos: update own or staff" on public.observation_photos for update to authenticated
  using (exists (
    select 1 from public.observations o
    where o.id = observation_id
      and (o.recorded_by = (select auth.uid()) or public.my_role() in ('officer', 'admin'))
  ));
create policy "photos: delete own or staff" on public.observation_photos for delete to authenticated
  using (exists (
    select 1 from public.observations o
    where o.id = observation_id
      and (o.recorded_by = (select auth.uid()) or public.my_role() in ('officer', 'admin'))
  ));

-- comments: anyone who can see the observation
create policy "comments: read"   on public.observation_comments for select to authenticated
  using (exists (select 1 from public.observations o where o.id = observation_id));
create policy "comments: insert" on public.observation_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.observations o where o.id = observation_id));

-- reviews: visible with the observation; only staff create them
create policy "reviews: read"   on public.observation_reviews for select to authenticated
  using (exists (select 1 from public.observations o where o.id = observation_id));
create policy "reviews: insert" on public.observation_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and public.my_role() in ('officer', 'admin'));

-- sensors, telemetry, alerts: staff only (sensor ingest should use the service_role key, which bypasses RLS)
create policy "nodes: staff"     on public.sensor_nodes for all    to authenticated
  using (public.my_role() in ('officer', 'admin')) with check (public.my_role() in ('officer', 'admin'));
create policy "telemetry: staff" on public.telemetry    for select to authenticated using (public.my_role() in ('officer', 'admin'));
create policy "alerts: staff"    on public.alerts       for all    to authenticated
  using (public.my_role() in ('officer', 'admin')) with check (public.my_role() in ('officer', 'admin'));
create policy "alert notes: staff" on public.alert_notes for all   to authenticated
  using (public.my_role() in ('officer', 'admin')) with check (public.my_role() in ('officer', 'admin'));

-- notifications: your own only. No INSERT policy on purpose — rows are
-- written by the security-definer trigger functions above, not clients.
create policy "notif: read own"   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif: update own" on public.notifications for update to authenticated using (user_id = auth.uid());

-- Lock the security-definer functions down from anon/public, then grant
-- back only what client-side policy evaluation actually needs.
revoke execute on function public.my_role()         from public;
revoke execute on function public.audit_changes()   from public;
revoke execute on function public.handle_new_user() from public;
grant execute on function public.my_role() to authenticated;


-- ---------------------------------------------------------------------
-- PART 5: BACKFILL — give a profile to any users created before this ran
-- ---------------------------------------------------------------------

insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data ->> 'full_name'
from auth.users
on conflict (id) do nothing;