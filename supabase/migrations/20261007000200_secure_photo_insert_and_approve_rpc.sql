-- 1. FIX: Secure the observation_photos insert policy
drop policy if exists "photos: insert" on public.observation_photos;
create policy "photos: insert" on public.observation_photos for insert to authenticated
with check (
  exists (
    select 1 from public.observations o 
    where o.id = observation_id 
    and (o.recorded_by = auth.uid() or public.my_role() in ('officer', 'admin'))
  )
);

-- 2. ADD: Create a secure Backend RPC for complex logic (Approving observations)
create or replace function public.approve_observation(p_obs_id uuid, p_comment text)
returns void 
language plpgsql 
security definer 
set search_path = '' 
as $$
begin
  -- Backend RBAC Check: Only officers/admins can run this
  if public.my_role() not in ('officer', 'admin') then
    raise exception 'Forbidden: Only officers and admins can approve observations';
  end if;

  -- Execute the logic
  update public.observations 
  set status = 'approved', updated_at = now()
  where id = p_obs_id;

  insert into public.observation_reviews (observation_id, reviewer_id, observation_version, decision, comment)
  values (p_obs_id, auth.uid(), 1, 'approve', p_comment);
end;
$$;