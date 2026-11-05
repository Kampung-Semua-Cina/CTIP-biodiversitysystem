-- =====================================================================
-- Deleting a user, with 30 days to change your mind, and a notification
-- when Supabase's email limit is reached.
--
-- 1. An admin deleting a user sets profiles.deleted_at and turns the
--    account off at once (is_active = false), so they cannot sign in or
--    use anything (my_role() is null for inactive accounts). Until 30 days
--    have passed an admin can restore it.
-- 2. After 30 days purge_deleted_users() removes the sign-in account
--    (auth.users). Their profile goes with it. Field records stay: every
--    record points to profiles with "on delete set null", so a plant,
--    visit, photo or review is kept and only loses its author. Discussion
--    threads they started are removed with them (owner_id cascades).
--    It runs daily if pg_cron is turned on, and the API also runs it when
--    an admin opens the Users page.
-- 3. notify_email_rate_limit() tells every active admin that Supabase
--    refused to send an email, and roughly how long to wait.
--
-- Safe to run more than once.
-- =====================================================================

-- 1. Columns ------------------------------------------------------------

alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

-- A deleted account is always switched off.
alter table public.profiles drop constraint if exists profiles_deleted_is_inactive;
alter table public.profiles
  add constraint profiles_deleted_is_inactive check (deleted_at is null or not is_active);

-- Only admins may delete or restore (people may still edit their own name etc.).
create or replace function public.guard_profile_self_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() is null for the service role, migrations and scheduled jobs.
  -- Admins may change anything.
  if auth.uid() is null or public.my_role() = 'admin' then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email
     or new.deleted_at is distinct from old.deleted_at
     or new.deleted_by is distinct from old.deleted_by then
    raise exception 'Only an admin can change role, active status, email or deletion'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_self_edit() from public;

-- 2. Removing accounts after the 30 days ----------------------------------

create or replace function public.purge_deleted_users()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := 0;
  v_id uuid;
begin
  -- Admins (through the API) or a scheduled job (no signed-in user).
  if auth.uid() is not null and public.my_role() is distinct from 'admin' then
    raise exception 'Only an admin can remove deleted accounts' using errcode = '42501';
  end if;

  for v_id in
    select id from public.profiles
    where deleted_at is not null and deleted_at < now() - interval '30 days'
  loop
    begin
      delete from auth.users where id = v_id; -- the profile goes with it (on delete cascade)
      v_count := v_count + 1;
    exception when others then
      -- Leave this one for the next run; the account stays switched off meanwhile.
      raise warning 'purge_deleted_users: % not removed: % (%)', v_id, sqlerrm, sqlstate;
    end;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.purge_deleted_users() from public, anon;
grant execute on function public.purge_deleted_users() to authenticated;

-- Daily at 03:17 if pg_cron is turned on (Database > Extensions). Not turned
-- on here: without it the API's run when an admin opens Users is enough.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-deleted-users';
    perform cron.schedule('purge-deleted-users', '17 3 * * *', 'select public.purge_deleted_users()');
  else
    raise notice 'pg_cron is not turned on: deleted users are removed when an admin opens the Users page';
  end if;
end;
$$;

-- 3. Email limit notification ---------------------------------------------

do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.notifications'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%type%'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.notifications add constraint notifications_type_check check (type in (
  'review_returned', 'review_approved', 'review_rejected',
  'comment_reply', 'alert_assigned', 'alert_created',
  'observation_submitted', 'observation_resubmitted',
  'discussion_shared', 'discussion_post', 'discussion_mention',
  'email_rate_limit'));

-- Called by the API, as the admin whose email was refused. Every active admin
-- is told, at most once every 10 minutes, so repeated tries do not flood them.
create or replace function public.notify_email_rate_limit(p_limit integer, p_wait_minutes integer, p_what text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Only an admin can report the email limit' using errcode = '42501';
  end if;
  insert into public.notifications (user_id, type, title, body, related_table, related_id)
  select p.id, 'email_rate_limit',
         'Email limit reached (' || p_limit || '/' || p_limit || ' per hour)',
         left(coalesce(p_what, 'An email') || ' was not sent. Supabase allows ' || p_limit
              || ' emails an hour. Try again in about ' || greatest(p_wait_minutes, 1) || ' minute'
              || case when greatest(p_wait_minutes, 1) = 1 then '' else 's' end || '.', 500),
         'profiles', null
  from public.profiles p
  where p.role = 'admin' and p.is_active
    and not exists (select 1 from public.notifications n
                    where n.user_id = p.id and n.type = 'email_rate_limit'
                      and n.created_at > now() - interval '10 minutes');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.notify_email_rate_limit(integer, integer, text) from public, anon;
grant execute on function public.notify_email_rate_limit(integer, integer, text) to authenticated;
