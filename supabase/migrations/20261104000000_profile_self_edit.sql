-- Account page fields (username, phone, photo) and letting people edit their own profile.
--
-- Fixes "column profiles.username does not exist": the API (PATCH /me, POST /profiles)
-- already reads and writes these columns, but no earlier migration created them.
--
-- Only admins could update profiles, so a botanist or officer saving their own name
-- changed 0 rows and got "Your profile cannot be changed". People may now update their
-- OWN row; a trigger keeps role, active flag and email admin-only.

-- 1. Columns -----------------------------------------------------------------
alter table public.profiles
  add column if not exists username   text,
  add column if not exists phone      text,
  add column if not exists avatar_url text;

-- Same rule the API checks: 3-20 letters, numbers, dots or underscores.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9._]{3,20}$');

-- One person per username, whatever the capital letters.
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- 2. Edit your own row, but not your own privileges -----------------------------
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.guard_profile_self_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() is null for the service role and migrations: leave those alone.
  -- Admins may change anything.
  if auth.uid() is null or public.my_role() = 'admin' then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email then
    raise exception 'Only an admin can change role, active status or email'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_self_edit on public.profiles;
create trigger trg_profiles_guard_self_edit
  before update on public.profiles
  for each row execute function public.guard_profile_self_edit();

revoke execute on function public.guard_profile_self_edit() from public;
