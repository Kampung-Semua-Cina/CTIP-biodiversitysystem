-- CTIP-50 / CTIP-111: botanists may create a QR tag (CTIP-27), but not edit or delete one.
-- The live "qr: staff write" policy was edited by hand to allow botanists for ALL
-- commands. This puts it back to officer and admin only, and adds an insert-only
-- policy for botanists: a new, unassigned tag made by themselves. Safe to run twice.

drop policy if exists "qr: staff write" on public.qr_tags;
create policy "qr: staff write" on public.qr_tags for all to authenticated
  using (public.my_role() in ('officer', 'admin'))
  with check (public.my_role() in ('officer', 'admin'));

drop policy if exists "qr: botanist insert" on public.qr_tags;
create policy "qr: botanist insert" on public.qr_tags for insert to authenticated
  with check (
    public.my_role() = 'botanist'
    and status = 'unassigned'
    and created_by = auth.uid()
  );