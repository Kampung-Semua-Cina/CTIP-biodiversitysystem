-- =====================================================================
-- Discussion board (#/discussion): threads that work like email.
--
-- A thread has an owner, a title and posts. The owner chooses who it is
-- shared with: single people and/or whole groups (every botanist, every
-- officer, every admin). They also choose:
--   private  only the owner and the people and groups it is shared with
--            can read and reply.
--   public   every signed-in staff member can read and reply; the people
--            and groups it is shared with are the ones told about it.
-- Posts can @mention people. A mention notifies that person, but only if
-- they can read the thread, so a private thread never reaches outsiders.
--
-- Only the owner can change the title, visibility or audience. The owner
-- or an admin can delete a thread. Deactivated accounts can do nothing
-- (my_role() is null for them).
--
-- The old per-observation comments (observation_comments) are unchanged
-- and still show on each plant's page.
--
-- Safe to run more than once.
-- =====================================================================

-- 1. Tables -------------------------------------------------------------

create table if not exists public.discussions (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 200),
  owner_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  visibility      text not null default 'private' check (visibility in ('public', 'private')),
  -- Optional: the field record the thread is about.
  observation_id  uuid references public.observations(id) on delete set null,
  last_post_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Who a thread is shared with: one row per person or per role group.
create table if not exists public.discussion_audience (
  id             uuid primary key default gen_random_uuid(),
  discussion_id  uuid not null references public.discussions(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete cascade,
  role           text check (role in ('botanist', 'officer', 'admin')),
  created_at     timestamptz not null default now(),
  constraint discussion_audience_one_kind check ((user_id is null) <> (role is null))
);

create table if not exists public.discussion_posts (
  id             uuid primary key default gen_random_uuid(),
  discussion_id  uuid not null references public.discussions(id) on delete cascade,
  author_id      uuid default auth.uid() references public.profiles(id) on delete set null,
  body           text not null check (char_length(body) between 1 and 5000),
  mentions       uuid[] not null default '{}',
  created_at     timestamptz not null default now()
);

create index if not exists discussions_last_post_idx on public.discussions (last_post_at desc);
create index if not exists discussion_posts_thread_idx on public.discussion_posts (discussion_id, created_at);
create unique index if not exists discussion_audience_user_key
  on public.discussion_audience (discussion_id, user_id) where user_id is not null;
create unique index if not exists discussion_audience_role_key
  on public.discussion_audience (discussion_id, role) where role is not null;

drop trigger if exists trg_discussions_updated on public.discussions;
create trigger trg_discussions_updated before update on public.discussions
  for each row execute function public.set_updated_at();

-- 2. Who can read a thread -----------------------------------------------
-- SECURITY DEFINER so the policies below do not call each other in a loop.

create or replace function public.user_can_see_discussion(p_discussion uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.discussions d
    join public.profiles p on p.id = p_user and p.is_active
    where d.id = p_discussion
      and (d.owner_id = p.id
           or d.visibility = 'public'
           or exists (select 1 from public.discussion_audience a
                      where a.discussion_id = d.id
                        and (a.user_id = p.id or a.role = p.role)))
  );
$$;

create or replace function public.can_see_discussion(p_discussion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.user_can_see_discussion(p_discussion, auth.uid());
$$;

-- Asking about someone else is for the notification trigger only.
revoke execute on function public.user_can_see_discussion(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.can_see_discussion(uuid) from public, anon;
grant execute on function public.can_see_discussion(uuid) to authenticated;

-- 3. Row-level security --------------------------------------------------

alter table public.discussions         enable row level security;
alter table public.discussion_audience enable row level security;
alter table public.discussion_posts    enable row level security;

-- The owner check comes first: inside the INSERT ... RETURNING that creates a
-- thread, can_see_discussion() cannot see the new row yet.
drop policy if exists "discussions: read" on public.discussions;
create policy "discussions: read" on public.discussions for select to authenticated
  using ((owner_id = auth.uid() and public.my_role() is not null) or public.can_see_discussion(id));

-- A linked record must be one the owner can see (observations RLS applies here).
drop policy if exists "discussions: create own" on public.discussions;
create policy "discussions: create own" on public.discussions for insert to authenticated
  with check (owner_id = auth.uid() and public.my_role() is not null
              and (observation_id is null
                   or exists (select 1 from public.observations o where o.id = observation_id)));

drop policy if exists "discussions: owner edit" on public.discussions;
create policy "discussions: owner edit" on public.discussions for update to authenticated
  using (owner_id = auth.uid() and public.my_role() is not null)
  with check (owner_id = auth.uid());

drop policy if exists "discussions: owner or admin delete" on public.discussions;
create policy "discussions: owner or admin delete" on public.discussions for delete to authenticated
  using ((owner_id = auth.uid() and public.my_role() is not null) or public.my_role() = 'admin');

drop policy if exists "audience: read" on public.discussion_audience;
create policy "audience: read" on public.discussion_audience for select to authenticated
  using (public.can_see_discussion(discussion_id));

drop policy if exists "audience: owner add" on public.discussion_audience;
create policy "audience: owner add" on public.discussion_audience for insert to authenticated
  with check (public.my_role() is not null and exists (
    select 1 from public.discussions d where d.id = discussion_id and d.owner_id = auth.uid()));

drop policy if exists "audience: owner remove" on public.discussion_audience;
create policy "audience: owner remove" on public.discussion_audience for delete to authenticated
  using (public.my_role() is not null and exists (
    select 1 from public.discussions d where d.id = discussion_id and d.owner_id = auth.uid()));

drop policy if exists "posts: read" on public.discussion_posts;
create policy "posts: read" on public.discussion_posts for select to authenticated
  using (public.can_see_discussion(discussion_id));

-- Posts cannot be edited or deleted one by one: the thread is the record.
drop policy if exists "posts: reply" on public.discussion_posts;
create policy "posts: reply" on public.discussion_posts for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_discussion(discussion_id));

-- 4. People to share with and mention ------------------------------------
-- Botanists cannot read other profiles, so this lists active accounts with
-- only a name, username and role (no email or phone).

create or replace function public.discussion_directory()
returns table (id uuid, full_name text, username text, role text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)), p.username, p.role
  from public.profiles p
  where p.is_active and public.my_role() is not null
  order by 2;
$$;
revoke execute on function public.discussion_directory() from public, anon;
grant execute on function public.discussion_directory() to authenticated;

-- 5. Create and share (one transaction each, run as the caller so RLS applies)

create or replace function public.create_discussion(
  p_id uuid, p_title text, p_body text, p_visibility text,
  p_user_ids uuid[], p_roles text[], p_mentions uuid[], p_observation_id uuid)
returns public.discussions language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.discussions;
begin
  insert into public.discussions (id, title, owner_id, visibility, observation_id)
  values (coalesce(p_id, gen_random_uuid()), p_title, auth.uid(), p_visibility, p_observation_id)
  returning * into v_row;

  insert into public.discussion_audience (discussion_id, user_id)
  select v_row.id, u from unnest(coalesce(p_user_ids, '{}')) as u
  where u is distinct from auth.uid()
  on conflict do nothing;
  insert into public.discussion_audience (discussion_id, role)
  select v_row.id, r from unnest(coalesce(p_roles, '{}')) as r
  on conflict do nothing;

  -- The first post goes in last, so its trigger sees the full audience.
  insert into public.discussion_posts (discussion_id, author_id, body, mentions)
  values (v_row.id, auth.uid(), p_body, coalesce(p_mentions, '{}'));

  select * into v_row from public.discussions where id = v_row.id;
  return v_row;
end;
$$;

-- Owner only. A null argument leaves that part as it is. Only people and
-- groups that are new get a notification.
create or replace function public.update_discussion(
  p_id uuid, p_title text, p_visibility text, p_user_ids uuid[], p_roles text[])
returns public.discussions language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.discussions;
begin
  update public.discussions
     set title = coalesce(p_title, title),
         visibility = coalesce(p_visibility, visibility)
   where id = p_id and owner_id = auth.uid()
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Only the owner can change this discussion' using errcode = '42501';
  end if;

  if p_user_ids is not null then
    delete from public.discussion_audience
     where discussion_id = p_id and user_id is not null and not (user_id = any (p_user_ids));
    insert into public.discussion_audience (discussion_id, user_id)
    select p_id, u from unnest(p_user_ids) as u
    where u is distinct from auth.uid()
    on conflict do nothing;
  end if;
  if p_roles is not null then
    delete from public.discussion_audience
     where discussion_id = p_id and role is not null and not (role = any (p_roles));
    insert into public.discussion_audience (discussion_id, role)
    select p_id, r from unnest(p_roles) as r
    on conflict do nothing;
  end if;
  return v_row;
end;
$$;

revoke execute on function public.create_discussion(uuid, text, text, text, uuid[], text[], uuid[], uuid) from public, anon;
grant execute on function public.create_discussion(uuid, text, text, text, uuid[], text[], uuid[], uuid) to authenticated;
revoke execute on function public.update_discussion(uuid, text, text, uuid[], text[]) from public, anon;
grant execute on function public.update_discussion(uuid, text, text, uuid[], text[]) to authenticated;

-- 6. Notifications --------------------------------------------------------

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
  'discussion_shared', 'discussion_post', 'discussion_mention'));

-- A new post. Mentioned people get "mentioned you"; everyone else involved
-- (owner, the people and groups it is shared with, earlier posters) gets
-- "shared with you" for the first post and "new message" after that. Never
-- the author, never anyone who cannot read the thread.
create or replace function public.notify_on_discussion_post()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_d       public.discussions;
  v_author  text;
  v_first   boolean;
  v_preview text;
begin
  update public.discussions set last_post_at = new.created_at where id = new.discussion_id
  returning * into v_d;

  select coalesce(nullif(full_name, ''), email, 'Someone') into v_author
  from public.profiles where id = new.author_id;
  v_first := not exists (select 1 from public.discussion_posts
                         where discussion_id = new.discussion_id and id <> new.id);
  v_preview := left(new.body, 200);

  begin
    insert into public.notifications (user_id, type, title, body, related_table, related_id)
    select m, 'discussion_mention', v_author || ' mentioned you in "' || v_d.title || '"',
           v_preview, 'discussions', v_d.id::text
    from (select distinct unnest(new.mentions) as m) x
    where m is distinct from new.author_id
      and public.user_can_see_discussion(v_d.id, m);

    insert into public.notifications (user_id, type, title, body, related_table, related_id)
    select r.uid,
           case when v_first then 'discussion_shared' else 'discussion_post' end,
           case when v_first then v_author || ' shared "' || v_d.title || '" with you'
                else 'New message in "' || v_d.title || '"' end,
           v_preview, 'discussions', v_d.id::text
    from (
      select v_d.owner_id as uid
      union select a.user_id from public.discussion_audience a
            where a.discussion_id = v_d.id and a.user_id is not null
      union select p.id from public.discussion_audience a
            join public.profiles p on p.role = a.role and p.is_active
            where a.discussion_id = v_d.id and a.role is not null
      union select dp.author_id from public.discussion_posts dp
            where dp.discussion_id = v_d.id and dp.id <> new.id
    ) r
    where r.uid is not null
      and r.uid is distinct from new.author_id
      and not (r.uid = any (new.mentions))
      and public.user_can_see_discussion(v_d.id, r.uid);
  exception when others then
    -- A notification must never stop the post being saved.
    raise warning 'notify_on_discussion_post: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_discussion_post on public.discussion_posts;
create trigger trg_notify_on_discussion_post after insert on public.discussion_posts
  for each row execute function public.notify_on_discussion_post();

-- Someone added to a thread that already has posts (the owner shared it
-- later). New threads are announced by their first post instead.
create or replace function public.notify_on_discussion_audience()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_d      public.discussions;
  v_author text;
begin
  select * into v_d from public.discussions where id = new.discussion_id;
  if not exists (select 1 from public.discussion_posts where discussion_id = v_d.id) then
    return new;
  end if;
  select coalesce(nullif(full_name, ''), email, 'Someone') into v_author
  from public.profiles where id = v_d.owner_id;

  begin
    insert into public.notifications (user_id, type, title, body, related_table, related_id)
    select p.id, 'discussion_shared', v_author || ' shared "' || v_d.title || '" with you',
           null, 'discussions', v_d.id::text
    from public.profiles p
    where p.is_active and p.id is distinct from v_d.owner_id
      and (p.id = new.user_id or p.role = new.role)
      -- not people who were already told about this thread
      and not exists (select 1 from public.notifications n
                      where n.user_id = p.id and n.related_table = 'discussions'
                        and n.related_id = v_d.id::text);
  exception when others then
    raise warning 'notify_on_discussion_audience: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_discussion_audience on public.discussion_audience;
create trigger trg_notify_on_discussion_audience after insert on public.discussion_audience
  for each row execute function public.notify_on_discussion_audience();

revoke execute on function public.notify_on_discussion_post() from public, anon, authenticated;
revoke execute on function public.notify_on_discussion_audience() from public, anon, authenticated;
