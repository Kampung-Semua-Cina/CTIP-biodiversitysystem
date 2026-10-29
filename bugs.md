# Bugs and security notes for vulnerability testing

**For:** the cybersecurity team · **Branch:** `rick3` · **Date:** 2026-10-28 · **Prepared by:** Ricardo (with Claude Code)

This covers:
1. a bug fix in how plants and QR tags are saved, with the security fixes that came with it
2. issues found during the review that are **still open**, ranked by severity
3. what to test, and the setup you need.

Nothing here is committed yet. The fixes only take effect on a database after the new migration is applied (see [Setup](#setup-before-testing)).

---

## 1. System under test

| Part | Where | Notes |
|---|---|---|
| Web portal (React + Vite) | `apps/web`, `npm run web` → http://localhost:5173 | Talks to **Supabase directly** for most data, and to the Express API for species and the review queue |
| Mobile app (Expo) | `apps/mobile` | Same shared store as the web (`apps/shared/StoreProvider.js`) |
| Express API | `services/api`, `npm run api` → http://localhost:8000/v1 | Role checks in `src/permissions.js`; queries run **as the user**, so Supabase RLS applies too |
| Database | Supabase (Postgres + RLS + Storage) | Schema and policies in `supabase/migrations/` |
| API contract | `packages/api-contract/openapi.yaml` | |

**Roles:** `visitor` (not signed in), `botanist`, `officer`, `admin`. They are stored in `profiles.role`, and `profiles.is_active` marks an account as approved. In SQL, `public.my_role()` returns the role, or `NULL` when the account is inactive.

**Sensitive data:** exact GPS of plants of **endangered / critically endangered** species. Visitors must only see a coarse location. Private field photos are in the `observation-photos` bucket.

---

## 2. What was fixed in this change

### 2.1 The reported bug: "duplicate key value violates unique constraint specimens_qr_id_key"

**Symptom:** adding a plant failed with that error, and the website kept offering tags that were already on a plant.

**Causes found (all fixed):**

| # | Cause | Fix |
|---|---|---|
| a | Commit `2f16c4b` started sending `observations.client_id`, a column that does not exist (`42703`). Every add-plant saved the plant, then failed on the observation. | The app now generates its own record ids instead of sending `client_id` (`apps/shared/StoreProvider.js`, `addPlant`). |
| b | `addPlant` retried **all** steps up to 3 times. Each retry inserted the plant again, so the real error was replaced by `specimens_qr_id_key`, and a plant was left with **no observation**. | Each step now runs once. The ids are made by the app, so a retry recognises rows it already saved. Database and permission errors are no longer retried (`isRetryable` in `apps/shared/utils.js`). |
| c | The app tried to mark the tag "assigned" itself, but RLS (`qr: staff write`) only lets officers and admins write `qr_tags`. A botanist's update **changed 0 rows, with no error**, so the tag stayed `unassigned` in the database (NIAH-0001 to 0003 at the time of writing). | A database trigger now marks the tag in the same transaction as the plant insert. Existing data is backfilled. |
| d | After a failure, the tag list on screen was not refreshed, so the same "unused" tag was offered again. | The list is refreshed after every attempt, the tag field is cleared when the tag is taken, and the message says so plainly. |
| e | When the plant or tag query failed while loading, every tag showed as "unused". | A failed load now keeps the last good data. |
| f | Tags on soft-deleted plants showed as "unused", but the unique constraint still blocks them. | Tag status now counts deleted plants too. |
| g | Mobile: `addPlant` reports failure by returning `{ ok: false }`, but the mobile screen only caught thrown errors, so it **deleted the saved draft and showed "Sent for review"** after a failed submit. The same applied to revisits. | Mobile now checks the result and keeps the draft. |
| h | A double click could submit twice. | The web form ignores a second submit while the first is running. |

### 2.2 Security fixes that came with it

Migration `supabase/migrations/20261028000000_tag_assignment.sql`:

| ID | Severity (before fix) | Issue | Fix | Please retest |
|---|---|---|---|---|
| F1 | **High** | `guard_specimen_update()` used `my_role() not in (...)`. For a **deactivated** account `my_role()` is `NULL`, so the check was skipped: a deactivated botanist could set `species_id` or `endangered_override` on their own plants. This is the same NULL bug that was fixed for approvals in `20261008063000`. | `coalesce(my_role(), '')` | As a deactivated botanist, `PATCH /rest/v1/specimens?id=eq.<own>` with `species_id` or `endangered_override` must fail |
| F2 | Medium | A botanist could move their own plant to **another QR tag** (`qr_id`), because the `specimens: update` policy allows editing your own plant. | Only officers and admins may change `qr_id` | Botanist `PATCH specimens` with a new `qr_id` must fail |
| F3 | Medium | A plant could be put on a **retired or damaged** tag. Only the UI prevented it. | Trigger raises `CTTG0` | Insert a specimen on a retired tag must fail |
| F4 | Low | Tag status could not be trusted (cause c above). | Trigger `assign_specimen_tag()` (security definer, `EXECUTE` revoked from `anon` and `authenticated`) | Botanist adds plant → tag becomes `assigned`; calling `rpc/assign_specimen_tag` must be denied |

App-side integrity fixes:

| ID | Issue | Fix |
|---|---|---|
| F5 | When the database refused to create tags (for example, for botanists), `generateTags` made **fake tags in the browser only**, which then failed when used. | It now reports the error. Creating tags needs the `tags` permission, and the "Generate new QR" button is hidden from botanists. |
| F6 | A failed photo upload saved the phone's local `blob:` URL as the photo's storage key. | The upload error is now raised and retried. |
| F7 | A failed species photo save showed "Species photos updated" and put **fake photos** on screen. It also deleted the existing photos *before* uploading the new ones. | It now uploads first, deletes after, and reports failures honestly. |

### 2.3 Earlier change on this branch (see `changes.md`)

- Species create and edit now go through the API (`POST/PATCH /v1/species`, `OFFICER_ADMIN`). Before, the web wrote to Supabase directly.
- `conservation_status` is validated server-side against the 9 IUCN categories.
- **Critically endangered** plants now have their location hidden from visitors in the web and mobile apps, matching the API's `distribution.js`. Without this, adding the new category would have exposed those locations.
- The review queue is read from `GET /v1/observations`.

---

## 3. Open issues found during review (NOT fixed)

These were found while working on the bug above. They need a decision from the team before anyone changes them.

### C1 · Critical · One-click sign-in as the real admin account from the public website

- `apps/web/src/components/Site.jsx` shows `RoleSwitch` on **every** page, including the public ones, with no development-only check.
- Picking a role calls `setRole` in `apps/shared/StoreProvider.js` (around line 405). That calls `supabase.auth.signInWithPassword` with the demo email for that role (`DEMO_EMAILS` in `apps/shared/data.js`) and a shared demo password (`DEMO_PASSWORD`, same file, also in `apps/web/tests/` and `apps/mobile/tests/`).
- The password is therefore in the source repository **and in the built JavaScript bundle** (confirmed in `apps/web/dist/assets/*.js`).
- **Impact:** any visitor becomes a real `admin` session: user management, the audit log, every exact endangered-plant location, and private photos. The same credentials also work directly against the Supabase Auth API, without the website.
- **Test:** open the site signed out → role switcher → Admin. Or call `POST /auth/v1/token?grant_type=password` with the values from `data.js`.
- **Suggested fix:** show the switcher only in development (`import.meta.env.DEV`), remove the password from the client, rotate the demo accounts' passwords, and use separate test accounts on a separate Supabase project.

### H1 · High · Sign-ups may become active botanists automatically (to verify)

- `profiles.role` defaults to `'botanist'` and `profiles.is_active` defaults to **`true`** (`20261007000000_schema.sql`). `handle_new_user()` creates the profile on sign-up with those defaults.
- The UI says an Admin approves accounts (`ACCOUNT_NOT_ACTIVE` in `apps/shared/apiClient.js`), but the database does not enforce that.
- **If Supabase e-mail sign-up is enabled**, anyone with the public publishable key could create an account and immediately read all specimens with **exact coordinates** (`specimens: read` is `using (true)` for authenticated users), plus all QR tags.
- **Test:** check *Authentication → Providers → Email → Enable sign-ups* in the dashboard, then sign up with a test address and query `/rest/v1/specimens?select=qr_id,lat,lng`.
- **Suggested fix:** make `is_active` default to `false`, and turn off public sign-up if accounts are created by admins.

### M1 · Medium · Deactivating an account does not stop it writing data

- Several RLS write policies check only ownership, not `is_active`: `specimens: register` (`registered_by = auth.uid()`), `obs: create own`, `obs: edit own unreviewed`, `specimens: update`, and comment inserts.
- A deactivated botanist with a valid session (or who can still sign in, since Supabase Auth knows nothing about `is_active`) can still add plants and observations.
- **Test:** deactivate a botanist in Admin, then insert a specimen or observation with that user's token.
- **Suggested fix:** add `and public.my_role() is not null` to those policies, or ban the user in Supabase Auth when they are deactivated.

### M2 · Medium · Review decisions can skip the API

- `reviewObservation` in `apps/shared/StoreProvider.js` falls back to Supabase directly (the `review_observation` RPC, then a plain `observation_reviews` insert) when the API cannot be reached.
- The plain insert skips the RPC's row lock and **version check**. Two officers could both decide on the same record, or decide on a stale version.
- **Test:** stop the API, then approve a record whose `version` no longer matches. Also try a concurrent approve and reject.
- **Suggested fix:** remove the plain-insert fallback, and keep the RPC (it does its own locking and role checks).

### M3 · Medium · Some staff writes still go straight to Supabase (RLS is the only check)

Publish/unpublish, delete and restore species, species photos, QR tag create/retire/delete, alerts, and the user admin all write to Supabase directly. They are protected by RLS only, not by the API's role table.

**Test:** run each of these with a botanist token, and with a deactivated officer's token, against `/rest/v1/...` directly.

### L1 · Low · Access tokens kept in `localStorage`

`apps/shared/api.js` stores the access token under `daun_access_token`, and supabase-js also keeps its session in `localStorage`. Any XSS would lead to account takeover.

**Test:** look for XSS sinks, such as user text shown in comments, species descriptions or captions, and the map popups built in `LeafletMap.jsx` / `apps/shared/mapHtml.js`.

### L2 · Low · Private photo links last 24 hours

Signed URLs for `observation-photos` are created with a 24-hour lifetime (`createSignedUrls(..., 3600 * 24)`). These photos can reveal endangered locations, and a leaked link works for a day.

### L3 · Low · Botanists can call the review-queue endpoint

`GET /v1/observations` allows any staff role, because CTIP-45 needs it. The handler and RLS both limit botanists to their own records.

**Test (IDOR):** as a botanist, request another botanist's `GET /v1/observations/:id`, `/v1/observations/:id/reviews` and `?specimen_id=`. All must return 404 or an empty list.

### Info

- The Supabase URL and publishable key are hard-coded fallbacks in `apps/shared/supabase.js`. That is fine by design, since publishable keys are meant to be public. Check that no `service_role` key appears anywhere: `git log -p | grep -i service_role`.
- The commit `effd544` message says exposed secrets were "deleted/regenerated". Please confirm the old keys were actually revoked, because they stay in the git history.
- Plants left with **no observation** by the bug may still exist in the database. A query to list them is at the bottom of the migration. The app now completes these when the same botanist submits the same tag again.

---

## 4. Suggested test checklist

**Authentication and session**
- [ ] C1 role switcher and demo credentials
- [ ] H1 open sign-up → active account
- [ ] Token expiry and refresh. Is a deactivated user's API call refused? (`ACCOUNT_NOT_ACTIVE`)

**Authorisation: for each role (visitor, botanist, officer, admin, deactivated) and each table or endpoint**
- [ ] `/rest/v1/*` directly with each role's token: `specimens`, `observations`, `observation_reviews`, `qr_tags`, `species`, `species_media`, `profiles`, `audit_logs`, `notifications`, `alerts`
- [ ] `/v1/*` API with each role, using the role table in `services/api/src/permissions.js`
- [ ] F1–F4 (fixed; confirm closed)
- [ ] M1, M2, M3, L3

**Data exposure**
- [ ] Exact coordinates of endangered / critically endangered plants: visitors must not get them from the web, the mobile app, `/v1/public/*` or `/v1/distribution`
- [ ] Storage: can `observation-photos` be listed or read without a signed URL? Can a botanist read another botanist's photos?

**Input handling**
- [ ] XSS in the text fields shown to other users (comments, notes, species text, captions, map popups)
- [ ] Upload checks: type and size (`photoProblem` in `apps/shared/utils.js`, and `services/api/src/images.js`)
- [ ] API validation: Zod returns 422 with field paths, unknown fields are rejected (`strictObject`), and search terms are restricted to stop PostgREST injection (`species.js`)

**Transport**
- [ ] `REQUIRE_HTTPS=true` refuses plain HTTP and sends HSTS (`services/api/src/https.js`)
- [ ] The CORS allow-list (`CORS_ORIGINS`)

---

## 5. Setup before testing

1. **Apply the migrations, in order**, for example in the Supabase SQL Editor. Both are safe to run more than once.
   - `supabase/migrations/20261028000000_tag_assignment.sql`: tags that already have a plant are set to `assigned`.
   - `supabase/migrations/20261029000000_staff_notifications.sql`: officers and admins get one notification per record already waiting for review.
2. Install everything: `npm run install:all`.
3. Create `services/api/.env` from `.env.example`, then run `npm run api` and `npm run web`.
4. **Please test on a separate Supabase project, or agree a time window with the team.** The project in the repo is the shared development database, and C1 means its admin account is reachable by anyone.

### How the fixes were checked

| Check | Result |
|---|---|
| All migrations applied to a local Postgres (PGlite) with Supabase stand-ins, and the scenarios run **before and after** the new migration | Before: the botanist's tag update changes 0 rows and the tag stays `unassigned` (bug reproduced); F1, F2 and F3 are all allowed. After: the tag becomes `assigned`, F1–F3 are refused, the backfill works, and direct calls to the trigger function are denied. |
| `addPlant` run against a fake Supabase that fails on purpose | **Old code:** your exact error, with 1 plant saved and 0 observations. **New code:** the observation failing once, the reply lost after the plant was saved, a photo upload failing once, a tag already on another plant, completing a half-saved plant, and two people on one tag all behave correctly |
| Retry rules | Duplicate, RLS and unknown-column errors are not retried; network and 5xx errors are |
| API tests (`npm run api:test`) | 68/68 pass |
| Shared API client tests | 11/11 pass |
| ESLint on the changed web pages, and the web production build | Clean, and it builds |
| Live check against the shared database (read-only) | `observations.client_id` does not exist (`42703`). 3 tags have a plant but are `unassigned`. |
| **Not done** | A logged-in browser run against the real database (it would write to the shared project), and running the mobile app on a device |

---

## 6. Tester part: functional bugs fixed, and how to check they stay fixed

Each bug has steps to reproduce it, what should happen now, and **similar places to check**: other screens built the same way that could show the same kind of bug.

Accounts: use a **botanist** and an **officer** test account, both active. Keep `npm run api` and `npm run web` running unless a step says to stop the API.

### T1 · My records page crashed ("This page hit a problem")

- **Cause:** the page read `plant.name` for every record. If a record's plant was not in the loaded list (for a moment while data loads, or because the plant was deleted), `plant` was `null` and the whole page crashed. React's dev live reload can also briefly mismatch old and new code.
- **Second problem:** the error box printed only `error.stack`. **In Firefox the stack does not include the error message**, so the report was just React's internal `beginWork@...` lines.
- **Fixed:**
  - Records shows "Plant not loaded" instead of crashing.
  - The error box now shows the **error message, the page (`#/...`) and the component** where it happened, then the stack. It also logs `Page crashed:` to the browser console.
- **Check:**
  1. As a botanist open `#/records`, then refresh it a few times with the network throttled (DevTools → Network → Slow 3G). It must never show the error box.
  2. If any page shows the error box, the text must start with a readable message such as `TypeError: Cannot read properties of null (reading 'name')`. Please send that first line.
- **Similar places to check** (each reads a plant or species that might not be loaded yet): Review queue (`#/review`), a plant page (`#/tag/<QR>` and `#/dashboard/<QR>`), Dashboard rows, Discussion, Notifications (links to records), and on mobile the Records screen and the record detail.

### T2 · A plant saved without its record could not be finished ("Draft" with 0 visits)

- **Cause:** the add-plant bug (§2.1) saved the plant, but not its record. The plant then:
  - showed as **Draft** with 0 visits (for example NIAH-0029)
  - never reached the review queue
  - could not be reopened, because its tag now counted as "used".
- **Fixed:** the botanist who tagged it now sees **"Not sent yet" + Finish and send** in three places:
  1. the plant's own page
  2. **My records**
  3. the Add plant tag picker ("(not sent yet)").

  On mobile, scanning the tag offers the same. The form starts with the saved species guess and location. Sending **completes the existing plant** (no second plant, no `specimens_qr_id_key` error).
- **Check:**
  1. As the botanist, open the Draft plant → **Finish and send** → add appearance and a photo → **Send for review**.
     - Expected: success. The plant now has 1 visit and shows **Needs review**.
  2. As an officer, open `#/review`.
     - Expected: the record is in **Needs review**, with photo, map and details.
  3. Open the same Draft plant as **another botanist** and as an **officer**.
     - Expected: no Finish button (only the botanist who tagged it can finish it).
  4. Finish the same plant twice quickly (two tabs).
     - Expected: one record, and the second tab gets a clear message, not a raw database error.
- **Similar places to check:** the tag picker must never offer a tag that is on someone else's plant. Scanning another botanist's plant must open its page, not the form.

### T3 · Returned records could not be edited; "Send again" / "Sync now" always said they worked

- **Cause:** returned records only had a reply box. `resubmit` and `syncObservation` ignored the database's answer, so a refused update still showed a success message.
- **Fixed:** appearance, height and notes can be edited before **Send again**, on web and mobile. Failures show the reason and keep the edits. A record that was decided in the meantime is refused ("no longer waiting for your changes").
- **Check:**
  1. Officer returns a record with a note.
  2. Botanist edits all three fields, adds a reply → **Send again**.
     - Expected: status **Needs review**, version +1, and the officer sees the new values and the reply.
  3. Height `-3` → refused with a message.
  4. Open the returned record in two tabs. Send from tab 1, then from tab 2.
     - Expected: tab 2 refused with a message, nothing changed.
  5. Stop the API, then **Send again**.
     - Expected: this still works (it goes straight to Supabase), and the **API Down** banner shows.
- **Similar places to check** (every button that saves and then says "done"): adding a comment, publishing a species, retire/delete tag, acknowledge/resolve alert, saving the profile, admin user edits. For each one, make it fail (e.g. stop the network) and confirm it **does not** show a success message.

### T4 · Review queue empty while the sidebar badge said 8

- **Cause:** the API was not running (`services/api/.env` was missing, so `npm run api` exited). The badge counts records from Supabase, but the list comes from the API.
- **Fixed:** the top bar shows a red **API Down** badge, and staff pages show a red banner with the fix (`npm run api`). Both clear by themselves within 30 seconds of the API coming back. The "Bad Gateway" message is gone.
- **Check:**
  1. With the API running: `#/review` lists the records, and the count matches the badge.
  2. Stop the API. Within 30 s (or when you switch back to the tab): **API Down** badge + banner, and the queue shows the API-down message.
  3. Start the API. The banner disappears within 30 s, and the list loads after a refresh.
- **Similar places to check:** the Species page (`#/species`) needs the API too, and must show the same message. Pages that only use Supabase (Dashboard, Map, Records) must **keep working** while the API is down.

### T5 · "Failed to add plant: duplicate key ... specimens_qr_id_key" (see §2.1 for causes)

- **Check:**
  1. Add a plant with a photo on an unused tag.
     - Expected: one plant, one record, tag now **assigned** on the QR tags page.
  2. DevTools → Network → **Offline** for 2 seconds while it is sending, then back online.
     - Expected: it finishes without a duplicate error, or fails with a clear message and the tag is offered again under "(not sent yet)".
  3. Pick a tag in one tab, use it in another tab, then send from the first.
     - Expected: "Tag ... is already on another plant", and the tag field is cleared.
  4. Double-click **Send for review**. Expected: only one record.
  5. A botanist must not see **Generate new QR** on Add plant (only officers and admins can create tags).
- **Similar places to check:** revisits (**Record a revisit**) on a slow or offline network must not create two records; species photo upload failing half-way must not delete the existing photos.

### T6 · Scan page lost the tag when starting a new plant

- **Cause:** the Scan page linked to `#/add?tag=X`, but the router splits on `/` and does not handle `?`, so the page opened as `add?tag=X` and the tag was lost.
- **Fixed:** the link is now `#/add/X`, and Add plant reads the tag from it.
- **Check:** as a botanist, on `#/scan` type an unused tag → you land on Add plant with that tag already chosen.
- **Similar places to check:** search the code for `#/...?` links (`grep -rn '#/[a-z]*?' apps/web/src`). None should remain.

### Where the fixes are

| Area | Files |
|---|---|
| Error box | `apps/web/src/components/ErrorBoundary.jsx` |
| Records, plant page, Add plant, Scan | `apps/web/src/pages/Records.jsx`, `Specimen.jsx`, `AddPlant.jsx`, `Scan.jsx` |
| API status badge and banner | `apps/shared/StoreProvider.js` (`checkApi`), `apps/web/src/components/RoleSwitch.jsx`, `Shell.jsx` |
| Send / resend / add plant | `apps/shared/StoreProvider.js` (`addPlant`, `resubmit`, `syncObservation`), `apps/shared/selectors.js` (`unfinishedPlants`) |
| Mobile | `apps/mobile/pages/Records.js`, `Scan.js`, `AddPlant.js` |

### T7 · Dev only: "Element type is invalid. Received a promise that resolves to: undefined" on `#/add`

- **Cause:** not an app bug. The dev server (Vite) re-read `AddPlant.jsx` at the instant an editing script had emptied the file to rewrite it, and kept serving that empty copy (167 bytes, no `export default`). Pages that load on demand (`safeLazy` in `RouteView.jsx`) then got a module with nothing in it.
- **Fixed:** the file was re-saved so the dev server reloaded it. All edited pages were checked and are served in full.
- **If it happens again:** run `touch apps/web/src/pages/<Page>.jsx`, or restart `npm run web`, then hard-refresh (Ctrl+Shift+R). To confirm the cause, run `curl -s localhost:5173/src/pages/<Page>.jsx | wc -c`: a size of a few hundred bytes means the served copy is empty.
- **Not affected:** the production build (`npm run web:build`) reads files once, at build time.

### T8 · Officers and admins got no notifications for work the dashboard asks them to do

- **Symptom:** the dashboard's **Needs review** card (shown to officers and admins) and the Review queue badge showed records waiting, but the bell stayed empty.
- **Cause (database):** notifications were only created for a review decision (to the botanist), a comment (to the botanist) and alerts.
  - **Sending a record for review notified nobody.** That covers a new plant, a revisit, a draft, and a returned record sent again.
  - A botanist's reply in a record's discussion also notified nobody.
- **Cause (website):** notifications were loaded once, when the page opened, so new ones never appeared without a reload.
- **Fixed:**
  - Migration `supabase/migrations/20261029000000_staff_notifications.sql`:
    - every **active officer and admin** gets *"New record to review"* or *"Record sent again for review"* when a record's status becomes "Needs review" (`synced`), showing tag · species guess · botanist
    - staff who reviewed or commented on a record get *"New reply on a record you reviewed"* when someone else comments
    - **backfill:** every record already waiting gets one notification per officer and admin.
  - The website re-checks the bell **every 30 seconds and when you return to the tab**.
  - Clicking one of these notifications opens the Review queue (officer) or the Dashboard (admin, who has no review queue).
- **Tested** on a local Postgres with all migrations and RLS (all as expected):

  | Case | Result |
  |---|---|
  | Backfill, migration applied twice | 1 per officer / admin; none for inactive staff or the botanist |
  | New record sent | 2 notifications (officer + admin) |
  | Edit of a record that is already waiting | none |
  | Draft sent | 2 |
  | Returned record sent again | 2 "sent again" |
  | Botanist reply | only the officer who reviewed it |
  | Officer comment | the botanist, not the officer |
  | Officers reading notifications | only their own |
  | Calling the trigger function directly | denied |
- **Check:**
  1. **Apply the migration first.**
  2. As officer: the bell shows the current queue (one per waiting record).
  3. As botanist: send a new plant → within 30 s the officer's and admin's bell count goes up, with no reload.
  4. Officer returns it → the botanist is notified (as before). Botanist sends it again → officer and admin get "sent again".
  5. Botanist replies in the discussion → the reviewing officer is notified. The botanist is not notified of their own comment.
  6. Deactivate an officer → they get nothing new.
  7. Click each kind of notification as officer, admin and botanist → it opens the right page.
- **Similar places to check:**
  - **New accounts waiting for approval** still notify nobody. Admins must open Users to see them (see H1 in §3).
  - **Sensor alerts** notify officers and admins when created. Check that a resolved or assigned alert behaves as the team expects.
  - Whether the mobile app's bell updates without a restart (it uses the same store, but was not run on a device).

---

## 7. Sample / demo data still in the frontend (checked 2026-10-29)

The store starts empty (`seed` in `apps/shared/data.js` has empty lists), and every page reads live Supabase or API data. These leftovers remain. The first two put **made-up values into real records**.

| # | Severity | Where | What it does | Suggested fix |
|---|---|---|---|---|
| S1 | **High (data integrity)** | `apps/mobile/pages/AddPlant.js`, `fallbackGps()` | If location permission is denied, or the GPS read fails, the app makes up a position **near the trail head with random jitter and a random "±4–9 m" accuracy**, and lets you submit it. It is marked `simulated: true`, but nothing checks that flag, so it is saved as a real GPS fix. Map points, the distribution map and endangered-location protection would then be based on fake positions. | Block submission while the location is simulated, or save it with `gps_accuracy_m = null` and show a clear "no GPS" warning. Officers should see that it is not a real fix. |
| S2 | **High (data integrity)** | `apps/web/src/pages/AddPlant.jsx`, the `spot` default | If the botanist never presses **Use my location**, the plant is saved at a fixed default point (3.80310, 113.77620) with a fake **±10 m** accuracy (`gps_accuracy_m: spot.acc ?? 10`). NIAH-0029 shows exactly these values. | Require a real location before sending, or send `null` accuracy and label it "location not captured". |
| S3 | Medium | `apps/shared/data.js` `initialProfiles` + `StoreProvider.js` (`mergedProfiles` starts from it) | Four hard-coded profiles ("Admin User", "Conservation Officer", "Field Botanist", and an inactive "Test User") are loaded before Supabase, and are **kept even if they no longer exist in the database**. Admin › Users may list a ghost "Test User". Botanists (who may only read their own profile) see these placeholder names for other staff. | Start `profiles` empty, and show "Staff member" for names the user may not read. |
| S4 | Medium | `apps/shared/StoreProvider.js` (`me`, around lines 55–77) | In "view as" mode, a fake signed-in person can be made up: `full_name: "<Role> (Demo)"`, email `<role>@demo.local`. Pages then act for a user that does not exist. | Remove it together with the role switcher (C1). |
| S5 | **Critical** (see C1) | `apps/shared/data.js` `DEMO_EMAILS` / `DEMO_PASSWORD`, `RoleSwitch.jsx` | The "Prototype · view the site as" bar signs in to real accounts with a shared password that is shipped in the bundle. | See C1 in §3. |
| S6 | Low | `apps/web/src/pages/AddPlant.jsx`, `onScanFile` | "Scan or upload QR" does not read the image. It picks the **next unused tag**, whatever the picture shows ("Demo scan"). A botanist could bind the wrong tag to a plant. | Decode the QR from the image (for example with `jsQR`), or remove the button on web. |
| S7 | Low (dead code) | `apps/mobile/components/PhotoEditor.js` | Adds a **random Unsplash stock photo** when "add photo" is pressed. No screen uses this component any more. | Delete the file. |
| S8 | Info | `apps/web/src/pages/Account.jsx` ("Local Prototype" chip), `Login.jsx` (backend status line), `apps/mobile/components/Chrome.js` ("Sample data only…" caption) | Prototype wording on screen. The mobile caption is wrong now, since the data is live. | Remove or reword before the demo. |
| S9 | Info | `apps/web/src/pages/Scan.jsx` "Try a sample tag" | Uses **real** published plants, so it is not sample data; only the label says "sample". | Rename to "Recently tagged plants" if wanted. |

Nothing else was found: no fake species, plants, observations, alerts or sensor readings are generated on the client. Search used: `grep -rn -iE "sample|demo|mock|fake|lorem|seed|Math.random"` over `apps/web/src`, `apps/shared` and `apps/mobile`, plus a check for hard-coded park coordinates.
