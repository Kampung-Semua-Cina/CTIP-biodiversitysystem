# Rick's to-do list: lecturer's web and mobile changes still open

*Written 2 Nov 2026, from the lecturer's change list. Sprint 2 ends Thu 12 Nov.*

The web-only work that could be finished without changing the API or database is
done (map window, 5-second updates, new species in review, staying signed in). The
items below are what is left. Most need an API or database change, so they affect
the rest of the team.

**Rules that apply to these items (see `CLAUDE.md`):**

- Database changes are new migration files in `supabase/migrations/`. Dry-run first,
  and tell Amberlyn before pushing: there is one shared live database.
- Every new route goes in `services/api/src/permissions.js` and in
  `packages/api-contract/openapi.yaml`. Contract changes need two approvals.
- API changes only reach the website after the API is redeployed on Render.

## Do first: put the photo caption and review lock live

The code is written and tested but not live. **Order matters:** if the API is
redeployed before the migration runs, field photo uploads fail.

- [ ] Tell Amberlyn, then dry-run and push `supabase/migrations/20261102000000_observation_photo_captions.sql`.
- [ ] Get two approvals for the `packages/api-contract/openapi.yaml` change.
- [ ] Redeploy the API on Render.
- [ ] Add a record with a captioned photo from a phone and check the officer sees it.
- [ ] **Decide:** should visitors see captions and trait tags? They do not for now,
      because a caption is free text and could describe where a protected plant is.
- [ ] Web: add captions and trait tags to the add-plant form. The website only shows them so far.

## Needs an API or database change

### 1. Delete accounts after a 30-day grace period

Today an admin can only deactivate an account.

- [ ] **Decide first:** the API has never used the Supabase secret key, and removing
      a sign-in needs it. Agree with Nicole whether this feature justifies it. If so,
      it may only live in `services/api/.env`.
- [ ] **Decide first:** what happens to a deleted person's records. Field records are
      irreplaceable, so keep them and show the author as "Deleted user"?
- [ ] Migration: add `profiles.deletion_scheduled_at`.
- [ ] API: routes to schedule and cancel deletion (Admin).
- [ ] Scheduled job that really deletes accounts after 30 days. Decide where it runs.
- [ ] Web: delete button on the Users page (`apps/web/src/pages/Admin.jsx`), showing
      the deletion date and a cancel option.
- [ ] Block sign-in during the grace period, and test it.

### 2. "Send to" as in-site messages

The tick-box dropdown (`apps/web/src/components/SendTo.jsx`) only opens a pre-filled
email holding a link, because the threat model says plant data is never emailed.
Botanists do not see it, because they can only read their own profile.

- [ ] **Ask the lecturer** whether email is enough. If it is, close this item.
- [ ] Migration: add a notification type. The `notifications` table has no insert
      policy on purpose, so writes must go through a `security definer` function.
- [ ] API: route to send a notification to chosen people.
- [ ] Decide whether botanists can send, which means showing them a list of staff.
- [ ] Web: change `SendTo.jsx` to call the route, and link the notification to the record.

### 3. Hide vulnerable plants' locations on the server

The rule is now one function, `hideLocationRule()` in `apps/shared/data.js`, used by the
website and the app: endangered always on, vulnerable on by default, others the
officer's choice. Vulnerable plants are hidden when an officer approves them with the
box ticked, but the API itself only protects endangered and critically endangered
species. Older approved vulnerable plants are not covered, so their exact locations
are still sent until the server rule changes. Doing the steps below also means an
officer can no longer untick it for a vulnerable plant: **ask the lecturer which they want.**

- [ ] API: add `vulnerable` to `ENDANGERED_STATUSES` in `services/api/src/distribution.js`.
- [ ] Migration: update the status check in `public_plant_by_tag()` and in the
      function from `20261031000000_public_plants.sql` (new migration, do not edit those files).
- [ ] Shared: add `vulnerable` to `THREATENED` in `apps/shared/data.js`, and change the hint in `hideLocationRule()`.
- [ ] Add API tests, since this is a security assessment case.

### 4. Correct an existing plant's location

Manual location only works when adding a new plant (website and app). `PATCH /specimens/:id`
does not accept `lat` or `lng`.

- [ ] **Decide:** who can correct a location (officers only is the suggested answer).
- [ ] API: allow `lat`, `lng` and `gps_accuracy_m` in `SpecimenUpdate` in
      `services/api/src/field.js`, for that role only.
- [ ] Check the database policy allows the update, and record the change in the audit log.
- [ ] Web: "Correct location" on the plant page, reusing the map and fields from
      `apps/web/src/pages/AddPlant.jsx`.
- [ ] Web: manual location on the revisit form, if the lecturer wants it there too.

### 5. Finish the invite flow

An admin can already invite someone by email or set a temporary password, and people
can change their password in Account settings.

- [ ] Email the temporary password or a set-password link, instead of the admin passing it on.
- [ ] Migration: add a "must change password" flag to `profiles`.
- [ ] Web: force the password change at first sign-in. `apps/web/src/pages/Login.jsx`
      already has a "first" step, but `login()` in `apps/shared/StoreProvider.js`
      always returns `first: false`.
- [ ] Mobile: same check.
- [ ] Coordinate with CTIP-72, which covers roles and approval of new accounts.

## Not started

### Sharp map while looking at a protected plant

While a protected plant is on screen, or within about 200 m of its edge, maps stop
downloading detail at zoom 15, so the base map looks blurry when zoomed in there (T19).
Other views stay sharp, so the tile server can see close-ups a few hundred metres from
the plant.

- [ ] **Decide:** is that acceptable, or should map tiles go through our API? The threat
      model allows a proxy. It needs a new route and contract change, and a check of
      the OpenStreetMap and Esri terms. The tile server would then see the API rather than
      the officer, but would still see which area is requested.

### 6. Offline reference book

The species catalogue (`#/plants`) is the base for this, but it needs a connection.

- [ ] **Ask the lecturer** what "sth like dictionary; offline Wikipedia" means: an
      offline website, a downloadable PDF, or in the mobile app?
- [ ] Build it. Project rule: offline work comes after the online system works properly.

### 7. Scale-up (IoT and API)

- [ ] Talk to Norman: the firmware, MQTT bridge and simulator are not on `main`, and
      `POST /telemetry` still answers 501, so the Monitoring page has no real data.
- [ ] Write down what "scalable" and "code reusable" mean for the IoT part with the
      lecturer, then split it into stories.
- [ ] Add a small "what changed since" API route. Each open staff tab now reloads the
      whole workspace every 5 seconds, including signed photo links, which will not
      hold up with many users.

### 8. Misalignment check (web and mobile)

- [ ] Go through the main screens side by side at desktop and phone size.
- [ ] Compare against `DESIGN.md`, including its list of places that do not follow the rules yet.
- [ ] Fix what is web-only here, and list the mobile differences for the mobile work.
- [ ] Mobile: try the new map window, set-by-hand map and review screen on a real phone.

## Also open

These were on the lecturer's list and are not finished, though they were not in the
earlier "Not done" summary.

- [ ] **Test more:** availability, reliability and security. So far only the new
      features have browser tests, against a mocked API, and the app's screens have none. Run the older live test
      suites, then add API-down and slow-API cases. Link to CTIP-36 and CTIP-37.
- [ ] **Authenticate images:** review how photos are protected. Private photo links
      last 24 hours (finding L2 in `docs/updates/rick3-bugs.md`). Check what the
      lecturer means by "make sure http images can get through".
