-- CTIP-40: put the user's role into every Supabase access token.
-- Supabase calls this function each time it issues or refreshes a token
-- (enable it under Authentication > Hooks). The API reads the `user_role`
-- claim, so the role comes from the database, never from the client.
-- Inactive or unknown users get user_role = null, which the API answers with 403.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims    jsonb := event -> 'claims';
  v_role    text;
  v_active  boolean;
begin
  select p.role, p.is_active
    into v_role, v_active
    from public.profiles p
   where p.id = (event ->> 'user_id')::uuid;

  if v_role is not null and v_active then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  else
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only Supabase Auth may run the hook.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook reads profiles as supabase_auth_admin, which RLS would otherwise block.
grant select on table public.profiles to supabase_auth_admin;
create policy "profiles: auth hook read" on public.profiles
  as permissive for select to supabase_auth_admin using (true);