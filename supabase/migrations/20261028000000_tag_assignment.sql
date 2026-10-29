-- =====================================================================
-- Bug fix: used QR tags still showed as unused ("specimens_qr_id_key").
--
-- 1. When a botanist added a plant, the app tried to set the tag's status
--    to 'assigned' itself. RLS ("qr: staff write") only lets officers and
--    admins write qr_tags, so the update was refused without an error and
--    the tag stayed 'unassigned'. The database now does it: a trigger on
--    specimens marks the tag assigned in the same transaction as the
--    insert, whoever adds the plant.
--
-- 2. The same trigger refuses a plant on a retired or damaged tag. Before,
--    only the app's tag list stopped that.
--
-- 3. Only officers and admins may move a plant to a different tag.
--    The "specimens: update" policy lets a botanist edit their own plant,
--    which included its qr_id.
--
-- 4. guard_specimen_update() had the NULL bug fixed for approvals in
--    20261008063000: my_role() is NULL for a deactivated account, and
--    "NULL not in (...)" is not true, so a deactivated botanist could set
--    species_id or endangered_override on their own plants. coalesce()
--    closes it.
--
-- 5. Backfill: tags that already have a plant but say 'unassigned'
--    (NIAH-0001 to NIAH-0003 on 2026-10-28) are set to 'assigned'.
--
-- Safe to run more than once. Only step 5 changes data.
-- =====================================================================

-- 1 + 2. Tag status follows the plant.
create or replace function public.assign_specimen_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tag_status text;
begin
  if new.qr_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.qr_id is not distinct from old.qr_id then
    return new;
  end if;

  select status into tag_status from public.qr_tags where qr_id = new.qr_id for update;
  if tag_status in ('retired', 'damaged') then
    raise exception 'Tag % is %, use another tag', new.qr_id, tag_status
      using errcode = 'CTTG0';
  end if;
  -- A missing tag is left to the foreign key, which reports it.

  update public.qr_tags set status = 'assigned'
  where qr_id = new.qr_id and status = 'unassigned';
  return new;
end;
$$;

drop trigger if exists trg_assign_specimen_tag on public.specimens;
create trigger trg_assign_specimen_tag before insert or update of qr_id on public.specimens
  for each row execute function public.assign_specimen_tag();

revoke execute on function public.assign_specimen_tag() from public, anon, authenticated;

-- 3 + 4. Fields only officers and admins may change.
create or replace function public.guard_specimen_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(public.my_role(), '') not in ('officer', 'admin') and
     (new.species_id is distinct from old.species_id
      or new.endangered_override is distinct from old.endangered_override
      or new.qr_id is distinct from old.qr_id) then
    raise exception 'Only officers can set species, endangered status or the tag';
  end if;
  return new;
end;
$$;

-- 5. Backfill.
update public.qr_tags t set status = 'assigned'
where t.status = 'unassigned'
  and exists (select 1 from public.specimens s where s.qr_id = t.qr_id);

-- Not run here, for an officer to review: plants left without any
-- observation by the bug (the plant was saved, the observation failed).
-- The app now finishes these when the same botanist sends the same tag
-- again. Any that remain can be soft-deleted by an officer.
--
--   select s.id, s.qr_id, s.registered_by, s.created_at
--   from public.specimens s
--   where not exists (select 1 from public.observations o where o.specimen_id = s.id)
--   order by s.created_at;
