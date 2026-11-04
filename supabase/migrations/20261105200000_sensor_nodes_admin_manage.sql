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
--   change          admins: anything
--                   officers: only the alert limits (thresholds), which
--                   they set from the Monitoring page today. Whether that
--                   should be admin only too is an open team decision
--                   (docs/updates/rick-extra-CTIP-security-fix.md); if so,
--                   drop "officer" from "nodes: update" and remove the
--                   officer branch of the trigger.
-- Botanists still get nothing: a node sits next to an endangered plant.
--
-- Writes with no signed-in user (the telemetry ingest, migrations) are not
-- limited by the trigger.
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
  using (public.my_role() in ('officer', 'admin'))
  with check (public.my_role() in ('officer', 'admin'));

drop policy if exists "nodes: admin delete" on public.sensor_nodes;
create policy "nodes: admin delete" on public.sensor_nodes for delete to authenticated
  using (public.my_role() = 'admin');

-- An officer's update may change the alert limits and nothing else. The whole
-- row is compared, so columns added later are covered too.
create or replace function public.guard_sensor_node_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.my_role() = 'admin' then
    return new;
  end if;
  if (to_jsonb(new) - 'thresholds' - 'updated_at') is distinct from (to_jsonb(old) - 'thresholds' - 'updated_at') then
    raise exception 'Only an admin can change a sensor node; officers can change its alert limits only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_sensor_node_update() from public, anon, authenticated;

drop trigger if exists trg_sensor_nodes_guard on public.sensor_nodes;
create trigger trg_sensor_nodes_guard before update on public.sensor_nodes
  for each row execute function public.guard_sensor_node_update();
