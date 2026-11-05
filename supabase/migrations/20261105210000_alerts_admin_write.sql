-- =====================================================================
-- IoT monitoring: admins read and write alerts, officers read only
-- (team decision; same rule as sensor nodes, 20261105200000).
--
-- Before: "alerts: staff" and "alert notes: staff" let officers AND admins
-- insert, update and delete alerts and their notes. Now:
--   alerts        read: officers and admins   write: admins only
--   alert_notes   read: officers and admins   write: admins only
-- Botanists still get nothing.
--
-- New alerts come from the telemetry ingest, which will use a server-side
-- key that bypasses row-level security, so these policies do not stop it.
--
-- Safe to run more than once.
-- =====================================================================

drop policy if exists "alerts: staff" on public.alerts;

drop policy if exists "alerts: read" on public.alerts;
create policy "alerts: read" on public.alerts for select to authenticated
  using (public.my_role() in ('officer', 'admin'));

drop policy if exists "alerts: admin write" on public.alerts;
create policy "alerts: admin write" on public.alerts for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

drop policy if exists "alert notes: staff" on public.alert_notes;

drop policy if exists "alert notes: read" on public.alert_notes;
create policy "alert notes: read" on public.alert_notes for select to authenticated
  using (public.my_role() in ('officer', 'admin'));

drop policy if exists "alert notes: admin write" on public.alert_notes;
create policy "alert notes: admin write" on public.alert_notes for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');
