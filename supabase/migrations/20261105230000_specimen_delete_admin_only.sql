-- =====================================================================
-- Only admins delete (or restore) a plant (team rule: officers cannot
-- delete plants).
--
-- Plants (specimens) are soft-deleted with is_deleted; there is no hard
-- delete policy, so nobody can remove a row outright. But the
-- "specimens: update" policy lets officers (any plant) and botanists (their
-- own) update the row, and guard_specimen_update() did not check
-- is_deleted, so either could delete a plant straight through Supabase.
-- The API and the apps never change is_deleted, so nothing that works
-- today stops working.
--
-- This replaces guard_specimen_update() (last set in 20261028000000) with
-- the same checks plus: only an admin may change is_deleted.
-- Writes with no signed-in user (migrations, SQL Editor) are not limited.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.guard_specimen_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(public.my_role(), '') not in ('officer', 'admin') and
     (new.species_id is distinct from old.species_id
      or new.endangered_override is distinct from old.endangered_override
      or new.qr_id is distinct from old.qr_id) then
    raise exception 'Only officers can set species, endangered status or the tag';
  end if;
  if auth.uid() is not null
     and coalesce(public.my_role(), '') <> 'admin'
     and new.is_deleted is distinct from old.is_deleted then
    raise exception 'Only an admin can delete or restore a plant'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
