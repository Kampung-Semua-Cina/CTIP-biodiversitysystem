-- =====================================================================
-- Conservation statuses are always stored lower case and trimmed.
--
-- Some species hold "Endangered" (saved before the API, or by hand). The
-- API and the database functions compare in any case, but the website
-- compared as typed, so those species were counted, mapped and edited as
-- if they were not endangered; saving the Edit form could make one "least
-- concern" and publish its plants' exact locations. The apps are fixed;
-- this makes the data match the API's own rule (CTIP-46: stored lower
-- case) so nothing else can trip on it.
--
-- 1. Fix the rows already stored.
-- 2. A trigger normalises every later write, whoever makes it (API,
--    SQL Editor, an old app build).
--
-- Safe to run more than once.
-- =====================================================================

update public.species
   set conservation_status = lower(trim(conservation_status))
 where conservation_status is not null
   and conservation_status <> lower(trim(conservation_status));

create or replace function public.normalise_conservation_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.conservation_status is not null then
    new.conservation_status := lower(trim(new.conservation_status));
  end if;
  return new;
end;
$$;
revoke execute on function public.normalise_conservation_status() from public, anon, authenticated;

drop trigger if exists trg_species_status_lower_case on public.species;
create trigger trg_species_status_lower_case
  before insert or update of conservation_status on public.species
  for each row execute function public.normalise_conservation_status();
