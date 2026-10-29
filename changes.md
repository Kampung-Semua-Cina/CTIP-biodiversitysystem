# Change report: Species via API (CTIP-46) and Review Queue (CTIP-29)

Date: 2026-10-28 · Branch: `rick3` · Not committed yet

## Summary

Before this change, the web app wrote species and read the review queue **straight from Supabase**. The Express API already had the right endpoints, but the web app did not call them. Now:

- **Species** are listed, created and edited through the API (`GET/POST/PATCH /v1/species`).
- **The review queue** is loaded through the API (`GET /v1/observations?status=pending`, plus returned/approved/rejected for the other tabs).
- **Conservation status** must be one of the 9 IUCN Red List categories. Both the web form and the API check this.
- **The review detail** shows where the record was taken on a map.

## Acceptance criteria status

### CTIP-46: Species Create, View & Edit via API

| Criterion | Before | Now |
|---|---|---|
| Create, view and edit from the web app through the API | ❌ Supabase direct | ✅ `POST /v1/species`, `PATCH /v1/species/:id`, list from `GET /v1/species` |
| Conservation status from a fixed IUCN list | ⚠️ 4 of 9 categories, not checked by the API | ✅ 9 categories in the dropdown; the API returns 422 for anything else |
| Only Officer and Admin can edit, enforced by the API | ⚠️ Only Supabase RLS was involved | ✅ The API's role check (`OFFICER_ADMIN`) now runs on every save; RLS still checks again |
| Changes record who edited and when | ✅ | ✅ The API sets `created_by`/`updated_by` from the login token; the database sets `updated_at` and writes the audit log |

### CTIP-29: Observation Review Queue

| Criterion | Before | Now |
|---|---|---|
| Lists new submissions with photos, GPS on a map, and details | ⚠️ GPS as text only | ✅ Map added to the review detail (observation's own GPS, falls back to the plant's) |
| Data comes from the review endpoints (CTIP-86) | ❌ Supabase direct | ✅ `GET /v1/observations?status=pending` (and `returned`, `approved`, `rejected`) |
| Only Officer and Admin can open it, enforced by the API | ⚠️ | ✅ See note 1 below |

## What changed, file by file

### API (`services/api`)
- [src/species.js](services/api/src/species.js): `conservation_status` must be an IUCN category (`IUCN_STATUSES`). Any case is accepted and it is saved lower case ("Critically Endangered" → "critically endangered").
- [test/species.test.js](services/api/test/species.test.js): new test for the IUCN check on create and update.
- [packages/api-contract/openapi.yaml](packages/api-contract/openapi.yaml): new `ConservationStatusValue` enum, used by `SpeciesInput` and `SpeciesUpdate`.

### Shared code (`apps/shared`, used by web and mobile)
- [api.js](apps/shared/api.js): new calls `fetchStaffSpecies`, `createSpeciesApi`, `updateSpeciesApi` and `fetchObservations`. List calls fetch every page (100 at a time). Blank form fields are sent as `null`, because the API rejects empty strings.
- [StoreProvider.js](apps/shared/StoreProvider.js):
  - `saveSpecies` now goes through the API and returns `{ ok, message }`. **There is no Supabase fallback**, because that would bypass the API's checks. If the API is down, the save fails with "Cannot reach the API server. Start it with npm run api."
  - New `loadStaffSpecies()` loads the staff species list from the API. Deleted species still come from Supabase, because the API's list leaves them out; they are needed for "Recently deleted".
  - New `loadReviewQueue()` loads the queue from the API.
- [data.js](apps/shared/data.js): `CONSERVATION` now has all 9 IUCN categories. New `THREATENED` list: `endangered` and `critically endangered`.
- [selectors.js](apps/shared/selectors.js): plants of **critically endangered** species now get their location hidden from visitors, the same as endangered ones. This matches the API's `distribution.js`. Without it, adding the new category would have exposed those locations.
- [tokens.js](apps/shared/tokens.js): colours for the new categories (extinct and critically endangered: red; data deficient and not evaluated: grey).

### Web (`apps/web`)
- [pages/Species.jsx](apps/web/src/pages/Species.jsx): loads the list from the API when the page opens and shows a message if that fails. When saving, the form waits for the API: it closes only on success and stays open with the error if not. The Save button shows "Saving…" while waiting.
- [pages/Review.jsx](apps/web/src/pages/Review.jsx): the queue comes from the API, with "Loading…" and error states. There is a map in the detail view. After approve/return/reject the queue reloads from the API.
- [App.css](apps/web/src/App.css): chip colours for the new categories.

### Mobile (`apps/mobile`)
- [pages/Dashboard.js](apps/mobile/pages/Dashboard.js): the "endangered" dot now also shows for critically endangered species. No other mobile changes.

## Notes and known limits

1. **Who can open the queue.** `GET /v1/observations` lets any staff role call it, but the API only ever returns a botanist's **own** records. So a botanist can never see other people's submissions, and only Officer/Admin can make decisions (`POST /reviews` is `OFFICER_ADMIN`). The route stays open to botanists because CTIP-45 (botanist sees their own submission status) uses it. The page itself is also hidden from botanists in the web app.
2. **Photos, plant name and comments in the queue still come from Supabase.** The API's `GET /observations/:id/photos` is not built yet (it returns 501). The observation records themselves come from the API.
3. **Submitting a decision still falls back to Supabase if the API is offline** (`reviewObservation`). That belongs to CTIP-69 and was not changed. Since the queue now needs the API to load, this fallback is rarely reachable from the Review page.
4. **Other pages still read species from Supabase** (public catalogue, maps, specimen pages). That is outside these two stories.
5. **Publish/unpublish, delete, restore and species photos** still write to Supabase directly. They belong to other tickets (CTIP-64, CTIP-65).
6. **Record fields still missing** from the database (CTIP-46 description): local names, higher taxonomy (order, class…), ecological characteristics. Adding them needs a migration plus API and form changes. Check with the team whether they are in scope.

## How to run it

The web app now **needs the API running** for the Species and Review pages.

### Why the review queue looked empty (badge said 8, list said nothing)

- The **sidebar badge** counts records loaded straight from Supabase. The **queue list** now comes from the API (CTIP-29).
- If the API is not running, the website's dev server (Vite) cannot forward `/v1/...` to it. It answers **502 Bad Gateway**, and the list stays empty. That is the "Could not load the review queue from the API: Bad Gateway" message.
- The API never started because `services/api/.env` did not exist. `npm run api` runs `node --env-file=.env`, which **exits immediately** if the file is missing.

### One-time setup

```bash
npm run install:all          # services/api was missing zod before this
cp services/api/.env.example services/api/.env
```

Then fill in two values in `services/api/.env`. They are the same public values as in `apps/shared/supabase.js`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`.env` is gitignored, so **every teammate needs their own copy**.

### Every time: two terminals

```bash
npm run api                  # terminal 1, port 8000. Must say "API running on http://localhost:8000/v1"
npm run web                  # terminal 2, port 5173 (forwards /v1 to the API)
```

Then log in as an officer or admin and open **Species** and **Review**.

Checked on 2026-10-28: with the API running, the website reaches it, the login token carries the user's role (the Supabase access-token hook is on), and the demo botanist alone has 7 records waiting for review.

---

# Update 2 (2026-10-28): "API down" notice and botanist drafts

## The website now says when the API is down

Before, the top bar always said **"API Connected"**: the code set it to "connected" even when the check failed. Now:

- The store checks the API **on load, every 30 seconds, and when you come back to the tab** (`checkApi` in [StoreProvider.js](apps/shared/StoreProvider.js)). Any call that cannot reach the API also marks it down straight away.
- Top bar: a red **"API Down"** badge ([RoleSwitch.jsx](apps/web/src/components/RoleSwitch.jsx)).
- Every staff page: a red banner saying *"API down. Cannot reach the API server. Start it with npm run api (needs services/api/.env)."* ([Shell.jsx](apps/web/src/components/Shell.jsx), `.apidown` in [App.css](apps/web/src/App.css)).
- The 502 the dev server sends when the API is not running is now treated as "API down" instead of showing "Bad Gateway" ([api.js](apps/shared/api.js)).
- Both clear by themselves once the API is back.

## Botanists can now edit and send their records

| Problem | Fix |
|---|---|
| A **returned** record could not be edited. The page only had a reply box and "Send again". | Web [Records.jsx](apps/web/src/pages/Records.jsx) and mobile [Records.js](apps/mobile/pages/Records.js) now show **Appearance, Height and Notes** to fix before sending again. |
| "Send again" and "Sync now" **ignored the database's answer** and always said they worked. | `resubmit` and `syncObservation` now check the result. On failure the page keeps your edits and shows the reason. |
| A stale screen could re-send a record that was already approved or rejected. | Updates only apply while the record is still `returned` (or `draft`/`queued` for sync). |
| **Plants left half-saved by the earlier bug** (the plant was saved, its record was not) could not be reopened, because their tag counted as "used". | Web: **My records** lists them under "Not sent yet" with a **Finish and send** button, and they appear in the tag picker on **Add plant** as "(not sent yet)". Mobile: scanning that tag offers **Finish and send**, and opens the form with your saved draft. Sending finishes the existing plant instead of making a new one. |
| Mobile had no "Send" button for a `draft` or `queued` record. | Added "Send for review" to the record screen. |
| The Scan page linked to `#/add?tag=X`, but the router splits on `/` and does not handle `?`, so the tag was lost. | It now links to `#/add/X`, and Add plant reads the tag from there. |

The QR-tag bug fixes from the same day (`specimens_qr_id_key`) are described in [bugs.md](bugs.md).

## Testing done (update 2)

| Check | Result |
|---|---|
| Shared API client pointed at the website's proxy (`localhost:5173/v1`), with the API **running** | ping online; calls reach the API |
| Same, with the API **stopped** | ping offline; calls report `API_UNREACHABLE` (was "Bad Gateway") |
| Botanist resend, draft send and field edits on a local Postgres with all migrations and RLS | Allowed for your own records |
| `resubmit` / `syncObservation` against a fake Supabase | Edits saved and version bumped; already-decided records and bad heights refused with a message; drafts sent |
| API tests / shared tests / ESLint on changed web files / web build | 68/68, 11/11, clean, builds |
| **Not done** | Clicking through in a browser: the Chrome extension was not connected. The mobile app on a device. |

## Testing done

| Check | Result |
|---|---|
| API tests (`npm run api:test`) | ✅ 68/68 pass (67 before + 1 new) |
| Shared API client tests | ✅ 11/11 pass |
| ESLint on changed pages (`Species.jsx`, `Review.jsx`) | ✅ clean |
| Web production build (`vite build`) | ✅ builds |
| New API helpers with a fake `fetch` (paging, URLs, token, blank → null) | ✅ pass |
| Real API started locally: `/v1/species` and `/v1/observations` without a token | ✅ 401; with a bad token: 401 |
| Existing species in the database have valid IUCN values | ✅ (least concern, vulnerable, endangered) |
| **Logged-in browser test (create/edit a species, review a record)** | ⏳ **Not done.** It needs an officer login and would write to the shared Supabase project. Please test this by hand. |

`npm run web:lint` still reports 6 errors in `Scan.jsx`. They were there before this change and are unrelated.
