-- =====================================================================
-- Bug fix: officers and admins got no notifications for work that the
-- dashboard and review queue ask them to do.
--
-- Before this, notifications were only made for: a review decision (to the
-- botanist), a comment (to the botanist), and alerts. So:
--
-- 1. A botanist sending a record for review (new, a revisit, a draft
--    sent, or a returned record sent again) told nobody. Now every active
--    officer and admin gets 'observation_submitted' or
--    'observation_resubmitted'. That is the same people the dashboard's
--    "Needs review" card is shown to, and the same rule as alerts.
--
-- 2. A botanist's reply in a record's discussion told nobody, because
--    notify_on_comment() only notified the botanist. Now staff who
--    reviewed or commented on that record are told too (never the
--    author).
--
-- 3. Backfill: every record already waiting for review gets one
--    notification per active officer and admin who does not have one yet,
--    so the current queue shows up straight away.
--
-- Safe to run more than once.
-- =====================================================================

-- New notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'review_returned', 'review_approved', 'review_rejected',
  'comment_reply', 'alert_assigned', 'alert_created',
  'observation_submitted', 'observation_resubmitted'));

-- 1. A record reaches the review queue (status becomes 'synced').
create or replace function public.notify_on_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_type text;
  v_body text;
begin
  if new.status <> 'synced' or new.is_deleted then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'synced' then
    return new; -- already waiting; an edit is not a new submission
  end if;

  v_type := case when tg_op = 'UPDATE' and old.status = 'returned'
                 then 'observation_resubmitted' else 'observation_submitted' end;

  select coalesce(s.qr_id, 'No tag') || ' · ' || coalesce(nullif(s.proposed_species_name, ''), 'Unnamed plant')
         || ' · by ' || coalesce(nullif(p.full_name, ''), p.email, 'a botanist')
    into v_body
  from public.specimens s
  left join public.profiles p on p.id = new.recorded_by
  where s.id = new.specimen_id;

  insert into public.notifications (user_id, type, title, body, related_table, related_id)
  select pr.id, v_type,
         case v_type when 'observation_resubmitted' then 'Record sent again for review'
                     else 'New record to review' end,
         v_body, 'observations', new.id::text
  from public.profiles pr
  where pr.role in ('officer', 'admin') and pr.is_active
    and pr.id is distinct from new.recorded_by;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_submission on public.observations;
create trigger trg_notify_on_submission after insert or update of status on public.observations
  for each row execute function public.notify_on_submission();

-- 2. Comments: the botanist as before, plus staff already involved in the record.
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

  insert into public.notifications (user_id, type, title, body, related_table, related_id)
  select distinct pr.id, 'comment_reply', 'New reply on a record you reviewed', new.body,
         'observations', new.observation_id::text
  from public.profiles pr
  where pr.role in ('officer', 'admin') and pr.is_active
    and pr.id is distinct from new.author_id
    and pr.id is distinct from v_recorded_by
    and (exists (select 1 from public.observation_reviews r
                 where r.observation_id = new.observation_id and r.reviewer_id = pr.id)
         or exists (select 1 from public.observation_comments c
                    where c.observation_id = new.observation_id and c.author_id = pr.id and c.id <> new.id));
  return new;
end;
$$;

revoke execute on function public.notify_on_submission() from public, anon, authenticated;
revoke execute on function public.notify_on_comment() from public, anon, authenticated;

-- 3. Backfill the current queue.
insert into public.notifications (user_id, type, title, body, related_table, related_id, created_at)
select pr.id, 'observation_submitted', 'New record to review',
       coalesce(s.qr_id, 'No tag') || ' · ' || coalesce(nullif(s.proposed_species_name, ''), 'Unnamed plant'),
       'observations', o.id::text, coalesce(o.last_synced_at, o.created_at)
from public.observations o
join public.specimens s on s.id = o.specimen_id
cross join public.profiles pr
where o.status = 'synced' and not o.is_deleted
  and pr.role in ('officer', 'admin') and pr.is_active
  and pr.id is distinct from o.recorded_by
  and not exists (select 1 from public.notifications n
                  where n.user_id = pr.id and n.related_table = 'observations' and n.related_id = o.id::text
                    and n.type in ('observation_submitted', 'observation_resubmitted'));
