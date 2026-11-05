-- =====================================================================
-- Officers and admins handle alerts again (CTIP-50; team role table by
-- Nicole: only adding or editing sensor nodes is admin-only, alerts stay
-- with officers and admins; CTIP-78 officers acknowledge and resolve).
--
-- 20261105210000_alerts_admin_write made alerts and alert notes
-- read-only for officers. That migration is already applied, so it is
-- not edited; this one replaces its write policies.
--
--   alerts        read: officers and admins   write: officers and admins
--   alert_notes   read: officers and admins   write: officers and admins
-- Botanists still get nothing. Sensor node rules (20261105200000) stay.
--
-- Safe to run more than once.
-- =====================================================================

drop policy if exists "alerts: admin write" on public.alerts;
drop policy if exists "alerts: staff write" on public.alerts;
create policy "alerts: staff write" on public.alerts for all to authenticated
  using (public.my_role() in ('officer', 'admin'))
  with check (public.my_role() in ('officer', 'admin'));

drop policy if exists "alert notes: admin write" on public.alert_notes;
drop policy if exists "alert notes: staff write" on public.alert_notes;
create policy "alert notes: staff write" on public.alert_notes for all to authenticated
  using (public.my_role() in ('officer', 'admin'))
  with check (public.my_role() in ('officer', 'admin'));

-- ---------------------------------------------------------------------
-- Make the live database match the files, whatever order they were
-- pushed in (both steps are safe if already done):
-- 1. 20261105200000 was edited after it was pushed. The live database got
--    its first version: "nodes: update" for officers AND admins, with a
--    trigger that kept officers to the alert limits. The final version
--    makes updates admin only and drops the trigger. Do both here: dropping
--    the trigger alone would let officers change any column of a node.
-- 2. F-08 (20261105140000) skips tables that did not exist yet. If it ran
--    before the discussion and version tables were made, they lack the
--    "active users only" rule. Add it again for those tables.
-- ---------------------------------------------------------------------

drop policy if exists "nodes: update" on public.sensor_nodes;
create policy "nodes: update" on public.sensor_nodes for update to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

drop trigger if exists trg_sensor_nodes_guard on public.sensor_nodes;
drop function if exists public.guard_sensor_node_update();

do $$
declare
  t text;
begin
  foreach t in array array['discussion_audience', 'discussion_posts', 'discussions', 'table_versions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "active users only" on public.%I', t);
      execute format(
        'create policy "active users only" on public.%I as restrictive '
        'for all to authenticated '
        'using (public.is_active_user()) with check (public.is_active_user())', t);
    end if;
  end loop;
end
$$;
