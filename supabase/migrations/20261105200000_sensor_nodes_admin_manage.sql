-- =====================================================================
-- Only admins manage sensor nodes (CTIP-48: "Admin can register, edit and
-- deactivate a sensor node"; CLAUDE.md: IoT node registration is the
-- System Administrator's).
--
-- Before: the "nodes: staff" policy let officers AND admins insert,
-- update and delete nodes. Now:
--   read            officers and admins (they monitor the nodes)
--   register        admins only
--   delete          admins only
--   change          admins only, alert limits (thresholds) included
--                   (team decision, CTIP-48: officers monitor, admins edit)
-- Botanists still get nothing: a node sits next to an endangered plant.
--
-- The coming telemetry ingest (setting last_seen or status) will need a
-- server-side key that bypasses row-level security, or its own policy.
--
-- Safe to run more than once.
-- =====================================================================

drop policy if exists "nodes: staff" on public.sensor_nodes;

drop policy if exists "nodes: read" on public.sensor_nodes;
create policy "nodes: read" on public.sensor_nodes for select to authenticated
  using (public.my_role() in ('officer', 'admin'));

drop policy if exists "nodes: admin register" on public.sensor_nodes;
create policy "nodes: admin register" on public.sensor_nodes for insert to authenticated
  with check (public.my_role() = 'admin');

drop policy if exists "nodes: update" on public.sensor_nodes;
create policy "nodes: update" on public.sensor_nodes for update to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

drop policy if exists "nodes: admin delete" on public.sensor_nodes;
create policy "nodes: admin delete" on public.sensor_nodes for delete to authenticated
  using (public.my_role() = 'admin');

-- An earlier draft let officers change the alert limits through a trigger.
-- Admin-only updates make it unnecessary, so remove it if it was applied.
drop trigger if exists trg_sensor_nodes_guard on public.sensor_nodes;
drop function if exists public.guard_sensor_node_update();
