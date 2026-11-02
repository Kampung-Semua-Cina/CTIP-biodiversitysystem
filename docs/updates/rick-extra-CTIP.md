# Branch `rick-extra-CTIP`: changes from `main`, and what is left

*Updated 2 Nov 2026. Sprint 2 ends Thu 12 Nov.*

This branch carries out the lecturer's change list on the website and mobile app. This
page lists what changed from `main`, what must happen before it goes live, and what is
still open. It replaces `todo-rick.md`.

**State of the branch:** one commit ahead of `main` (`58ccb3a`, 47 files), plus a second
batch of work that is **not committed yet**. `main` here means `a6edb88`, the last copy
fetched from GitHub.

**Affects the team:** a database migration, a change to the API contract and an API
behaviour change. See [Before this goes live](#before-this-goes-live).

## Before this goes live

**Order matters:** if the API is redeployed before the migration runs, field photo
uploads fail.

- [ ] Tell Amberlyn, then dry-run and push `supabase/migrations/20261102000000_observation_photo_captions.sql`.
- [ ] Get two approvals for the `packages/api-contract/openapi.yaml` change.
- [ ] Redeploy the API on Render.
- [ ] Add a record with a captioned photo from a phone and check the officer sees it.
- [ ] **Decide:** should visitors see captions and trait tags? They do not for now,
      because a caption is free text and could describe where a protected plant is.
- [ ] Web: add captions and trait tags to the add-plant form. The website only shows them so far.

## What changed from `main`

"Committed" is in `58ccb3a`. "Not committed" is only in the working copy so far.

### Database and API (committed)

| Area | Change |
|---|---|
| Database | New migration adds `caption` (up to 200 characters) and `traits` to `observation_photos`. `public_observation_photos()` is unchanged, so visitors do not get them. |
| API | Photo upload accepts `caption` and `traits`, and rejects anything outside the trait list with a 422. |
| API | Review lock: a botanist cannot add a record to a plant while one is waiting for an officer. The API answers 409 `REVIEW_IN_PROGRESS`. A retry of the waiting record still works. |
| Contract | `openapi.yaml` describes the new photo fields and the direct file upload. |

No new routes. The review lock is not in the contract yet.

### Website

| Feature | Change | State |
|---|---|---|
| Map | Selecting a pin opens a plant window. Added a Reset zoom button. | Committed |
| Live updates | Staff data reloads about every 5 seconds, so an officer sees a new record without refreshing. Background tabs do not load. | Committed |
| Review | An officer can create a species while reviewing, and choose to hide a location. | Committed |
| Sign-in | Refreshing the page no longer looks like being signed out, and two open tabs no longer sign each other out. | Committed |
| Send to | A tick-box list on the Review and Dashboard pages opens an email holding a link only, never plant data. | Committed |
| Maps | Sharper tiles on high-definition screens. Detail is limited only when a protected plant is on screen or within 200 m of its edge (T19). | Committed |
| Reports | Bars by conservation status, family and species. Selecting one filters the table. The conservation bars are now one colour, and statuses with no plants are not listed. | Not committed |
| Plant book | New `#/book` page: published species A to Z, with search and print or save as PDF. | Not committed |
| Layout | Every page scrolled sideways at phone width. Fixed. | Not committed |
| Last updated | Added to the scanned-plant page, when the API sends the date. | Not committed |

### Mobile app

| Feature | Change | State |
|---|---|---|
| Map | Plant window, Reset zoom, sharper tiles, and the same protected-plant limit as the website. | Committed |
| Add plant | Set the location by hand, on a map or by typing. Photo captions and trait tags. | Committed |
| Review | Create a species while reviewing, and choose to hide a location. | Committed |
| Accounts | An admin can set a temporary password when adding someone. | Committed |
| Copying | Adds the `expo-clipboard` package, used by the plant window. | Committed |
| Reports | Bars by conservation status, family and species. Tapping one lists its plants. | Not committed |
| Plant book | New screen in the menus, saved on the phone for use with no signal. Words only: photos need a connection. | Not committed |
| Revisit | Set the location by hand, as on the add form. | Not committed |
| Users | An admin can change a role or deactivate an account, but not their own. The button now says "Invite member", like the website. | Not committed |
| Small fixes | Last updated on the species page. Coordinates show 5 decimals, like the website. | Not committed |

### Shared by both

| Area | Change | State |
|---|---|---|
| Location rule | `hideLocationRule()` is one rule and one wording: endangered always on, vulnerable on by default, others the officer's choice. | Committed |
| Location notes | The "approximate area" and "hidden" sentences now live in `data.js`. | Not committed |
| Photo links | Links are replaced after 12 hours, because they expire at 24 and long-open apps showed broken photos. | Not committed |
| `http` images | Old `http://` links load over `https://`, except local development addresses. | Not committed |

## Testing

| Check | Result |
|---|---|
| Shared tests | 54 passed |
| API tests | 128 passed |
| Browser tests (`availability-security`, `live-review-map`, `mobile-map-html`), on a mocked API | 92 passed |
| Website lint and build | Passed |
| Android build | Passed |

New tests cover the API being down or slow, visitors blocked from staff pages, sign-in
tokens staying out of the address, the saved book holding no locations, and sideways
scrolling. Mock helpers moved to `apps/web/tests/helpers/mockApi.js`.

**Not tested:**

- The mobile screens have not been run on a real phone, and have no tests of their own.
- Browser tests use a mocked API, so they do not prove the real API hides locations.
- The older live test suites were not run on this branch.

## Still to do

**Rules for these items (see `CLAUDE.md`):**

- Database changes are new migration files in `supabase/migrations/`. Dry-run first,
  and tell Amberlyn before pushing: there is one shared live database.
- Every new route goes in `services/api/src/permissions.js` and in
  `packages/api-contract/openapi.yaml`. Contract changes need two approvals.
- API changes only reach the website after the API is redeployed on Render.

### Needs an API or database change

#### 1. Delete accounts after a 30-day grace period

Today an admin can only deactivate an account.

- [ ] **Decide first:** the API has never used the Supabase secret key, and removing
      a sign-in needs it. Agree with Nicole whether this feature justifies it. If so,
      it may only live in `services/api/.env`.
- [ ] **Decide first:** what happens to a deleted person's records. Field records are
      irreplaceable, so keep them and show the author as "Deleted user"?
- [ ] Migration: add `profiles.deletion_scheduled_at`.
- [ ] API: routes to schedule and cancel deletion (Admin).
- [ ] Scheduled job that really deletes accounts after 30 days. Decide where it runs.
- [ ] Web and mobile: delete button on the Users page, showing the deletion date and a cancel option.
- [ ] Block sign-in during the grace period, and test it.

#### 2. "Send to" as in-site messages

The tick-box list (`apps/web/src/components/SendTo.jsx`) only opens a pre-filled email
holding a link, because the threat model says plant data is never emailed. Botanists do
not see it, because they can only read their own profile.

- [ ] **Ask the lecturer** whether email is enough. If it is, close this item.
- [ ] Migration: add a notification type. The `notifications` table has no insert
      policy on purpose, so writes must go through a `security definer` function.
- [ ] API: route to send a notification to chosen people.
- [ ] Decide whether botanists can send, which means showing them a list of staff.
- [ ] Web: change `SendTo.jsx` to call the route, and link the notification to the record.

#### 3. Hide vulnerable plants' locations on the server

The website and app follow `hideLocationRule()`, and vulnerable plants are hidden when an
officer approves them with the box ticked. The API itself only protects endangered and
critically endangered species, so older approved vulnerable plants **still send exact
locations** until the server rule changes. Doing the steps below also means an officer
can no longer untick it for a vulnerable plant: **ask the lecturer which they want.**

- [ ] API: add `vulnerable` to `ENDANGERED_STATUSES` in `services/api/src/distribution.js`.
- [ ] Migration: update the status check in `public_plant_by_tag()` and in the
      function from `20261031000000_public_plants.sql` (new migration, do not edit those files).
- [ ] Shared: add `vulnerable` to `THREATENED` in `apps/shared/data.js`, and change the hint in `hideLocationRule()`.
- [ ] Add API tests, since this is a security assessment case.

#### 4. Correct an existing plant's location

Manual location works when adding a plant (website and app) and on the app's revisit
form. `PATCH /specimens/:id` does not accept `lat` or `lng`, so a saved plant's location
cannot be corrected.

- [ ] **Decide:** who can correct a location (officers only is the suggested answer).
- [ ] API: allow `lat`, `lng` and `gps_accuracy_m` in `SpecimenUpdate` in
      `services/api/src/field.js`, for that role only.
- [ ] Check the database policy allows the update, and record the change in the audit log.
- [ ] Web: "Correct location" on the plant page, reusing the map and fields from
      `apps/web/src/pages/AddPlant.jsx`.
- [ ] The website has no revisit form at all, so manual location there depends on adding one. Ask the lecturer if it is wanted.

#### 5. Finish the invite flow

An admin can already invite someone by email or set a temporary password, on the website
and in the app, and people can change their password in Account settings.

- [ ] Email the temporary password or a set-password link, instead of the admin passing it on.
- [ ] Migration: add a "must change password" flag to `profiles`.
- [ ] Web: force the password change at first sign-in. `apps/web/src/pages/Login.jsx`
      already has a "first" step, but `login()` in `apps/shared/StoreProvider.js`
      always returns `first: false`.
- [ ] Mobile: same check.
- [ ] Coordinate with CTIP-72, which covers roles and approval of new accounts.

### Other open items

#### 6. Sharp map while looking at a protected plant

While a protected plant is on screen, or within about 200 m of its edge, maps stop
downloading detail at zoom 15, so the base map looks blurry when zoomed in there (T19).
Other views stay sharp, so the tile server can see close-ups a few hundred metres from
the plant.

- [ ] **Decide:** is that acceptable, or should map tiles go through our API? The threat
      model allows a proxy. It needs a new route and contract change, and a check of
      the OpenStreetMap and Esri terms. The tile server would then see the API rather than
      the officer, but would still see which area is requested.

#### 7. Plant book

The website needs a connection to load, because it has no service worker, so its offline
option is the printed or PDF copy. Photos are not saved in either version.

- [ ] **Ask the lecturer** whether this is what "sth like dictionary; offline Wikipedia" meant.
- [ ] Mobile: try it on a real phone in flight mode.

#### 8. Scale-up (IoT and API)

- [ ] Talk to Norman: the firmware, MQTT bridge and simulator are not on `main`, and
      `POST /telemetry` still answers 501, so the Monitoring page has no real data.
- [ ] Write down what "scalable" and "code reusable" mean for the IoT part with the
      lecturer, then split it into stories.
- [ ] Add a small "what changed since" API route. Each open staff tab now reloads the
      whole workspace every 5 seconds, including signed photo links, which will not
      hold up with many users.

#### 9. Misalignment check

- [ ] Compare against `DESIGN.md`, including its list of places that do not follow the rules yet.
- [ ] Mobile: try the map window, set-by-hand map, review screen, report bars and Users controls on a real phone.

#### 10. Test more

- [ ] Run the older live test suites.
- [ ] Test the location rules on the real API.
- [ ] Add tests for the app's screens, which have none. Link to CTIP-36 and CTIP-37.

#### 11. Authenticate images

Private photo links last 24 hours (finding L2 in `docs/updates/rick3-bugs.md`).

- [ ] Review how photos are protected.
- [ ] Check that the `https` upgrade is what the lecturer means by "make sure http images can get through".
