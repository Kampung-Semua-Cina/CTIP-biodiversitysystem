# What changed in the website (and what it means for mobile)

**Branch:** `rick-CTIP-33` (from `rick3`, PR #26) · **Updated:** 29 Oct 2026

This is the short version. The detail is in [docs/updates/](docs/updates/):
[rick3-changes.md](docs/updates/rick3-changes.md) (features), [rick3-bugs.md](docs/updates/rick3-bugs.md) (bugs and security), [rick3-must-fix.md](docs/updates/rick3-must-fix.md) (migrations to apply).

---

## 1. The big change: sample data → Supabase → API

The website went through three stages.

| Stage | Where the data came from | Problem |
|---|---|---|
| **1. Prototype** (up to `rick2`, [web-update-1.md](docs/updates/web-update-1.md)) | Sample data held in memory (`seed` in `apps/shared/data.js`). Each store action had a `// Supabase:` comment for the real call. | Nothing was saved. Refresh and it was gone. |
| **2. Supabase direct** (commits `9bbf746`, `d64c571`) | The store called Supabase tables straight from the browser and the phone (`supabase.from(...)`). | The API's checks (roles, validation, version check, photo cleaning) were skipped. RLS was the only protection. |
| **3. Through the API** (now) | Every load and save goes through the Express API at `/v1`. The API talks to Supabase. | The apps need the API running. |

### How it fits together now

```
 Web (React/Vite)  ─┐                        ┌─> Supabase Postgres (RLS still applies)
                    ├─> Express API (/v1) ───┤
 Mobile (Expo)     ─┘   role checks, Zod,    └─> Supabase Storage (photos)
        │               photo cleaning,
        │               endangered GPS hiding
        └─> Supabase Auth: sign-in only (gets the login token)
```

- **Sign-in** still uses Supabase Auth directly (`signInWithPassword`). The login token carries the user's role (the access-token hook from migration `20261010000000`).
- **Everything else** goes to the API with that token. The API runs each query **as the signed-in user**, so Supabase RLS checks again behind the API.
- **Start-up load:** one call, `GET /v1/workspace` for staff or `GET /v1/public/workspace` for visitors, returns everything the pages show (species, plants, tags, records, photos, alerts, notifications…). This replaced about a dozen separate Supabase queries.
- **Writes** each have their own endpoint: species, species photos, plants, records, comments, reviews, QR tags, publish/delete/restore, alerts, profiles, notifications. The full list is in `services/api/src/permissions.js` and `packages/api-contract/openapi.yaml`.
- **The sample data is gone.** The store starts empty and only shows live data. A few leftovers remain (see §6).

### Why this matters

- **One set of rules.** The API decides who can do what (`OFFICER_ADMIN`, `ANY_STAFF`, `ADMIN`), validates input (Zod, unknown fields rejected), and checks the record version so two officers can't decide on the same record.
- **Endangered locations stay hidden.** The API snaps the GPS of endangered and critically endangered plants to a ~1.1 km grid for anyone who isn't an officer or admin, unless they registered the plant. This now also covers `/workspace` and `/specimens/by-qr` (CTIP-71). Before, any botanist could read the exact spot.
- **Photos are cleaned.** Uploads go through the API, which checks the real file type and size (10 MB) and strips GPS metadata.

### How to run it

```bash
npm run install:all
cp services/api/.env.example services/api/.env   # fill in SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
npm run api    # terminal 1, port 8000
npm run web    # terminal 2, port 5173 (forwards /v1 to the API)
```

Every teammate needs their own `services/api/.env` (it is gitignored). Without it, `npm run api` exits at once and the website shows **API Down**.

---

## 2. What changed on the website

### Species (CTIP-46)
- Create, edit, publish, delete and restore all go through the API.
- Conservation status is one of the **9 IUCN Red List categories** (was 4). The API refuses anything else with 422.
- The form stays open until the API confirms the save, and shows the error if it fails.

### Species photos
- Photos can have **captions** and be reordered.
- Saving sends only what changed: new uploads, then caption/order changes, then removals. A failed save no longer empties the gallery.
- Field photos picked from a record are uploaded as a real copy, so they don't break after 24 hours.
- New endpoints: `PATCH` and `DELETE /v1/species/{id}/media/{mediaId}`.

### Review queue (CTIP-29)
- The queue loads from `GET /v1/observations` (pending, returned, approved, rejected tabs).
- The record detail shows **where it was taken on a map**.
- **Approve needs a confirmed species.** The API answers `422 SPECIES_REQUIRED` otherwise. Return and Reject still work without one.
- Decisions go **only through the API**. When the API is down, the three buttons are disabled with a message.

### Botanist records
- A **returned** record can now be edited (appearance, height, notes) before **Send again**.
- Plants left half-saved by the old add-plant bug show as **"Not sent yet"** with a **Finish and send** button (on the plant page, My records, and the Add plant tag picker).
- Botanists can generate **one** QR tag for the plant in front of them (CTIP-27). Batches stay with officers and admins.

### Search and filter
- Filters are **in the URL**, so a search can be bookmarked or shared, e.g. `#/plants?q=pitcher&family=Nepenthaceae&genus=Nepenthes`.
- **Catalogue:** new genus filter and a Clear filters button.
- **Reports:** search by tag, name or the botanist's guess; family, genus, conservation and status filters; a date range; four sorts; 25 per page; **CSV export**.
- **Faster:** 5,000 plants with 10,000 visits went from about 1.4 s to 64 ms.

### Notifications
- Officers and admins now get **"New record to review"** and **"Record sent again for review"**, and staff get a notice when a botanist replies.
- The bell refreshes **every 30 seconds** and when you return to the tab, without a reload.
- This needs migration `20261029000000_staff_notifications.sql` (see §5).

### API status
- The top bar shows a red **API Down** badge, and every staff page shows a banner with the fix, instead of a false "API Connected".
- It checks on load, every 30 seconds, and when you return to the tab, and clears by itself once the API is back.

### GPS
- If there is no real location fix, the record is saved with **no location** instead of a made-up one. The botanist sees a warning, the officer sees **"Location not captured"**, and the plant stays off the maps.

### Other
- The error box shows the actual error message, the page and the component (Firefox used to show only a stack trace).
- The footer shows the app version: `v1.0.<commit count> · <commit>` (`npm run app-version`).
- Web lint and the CI build pass again (CTIP-49).

---

## 3. How it affects mobile

Web and mobile share the same store and API client (`apps/shared/StoreProvider.js`, `apps/shared/api.js`). So **almost every change above reached the mobile app automatically**: the API loading, species rules, review rules, notifications, GPS handling and endangered-location hiding.

Mobile-specific changes:

| Change | What it means |
|---|---|
| **Phone needs to find the API** (`apps/mobile/apiAddress.js`) | On a phone, `localhost` is the phone. In development the app uses the computer running Expo (port 8000) automatically, if on the same Wi-Fi. Otherwise set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`. |
| **Tunnel mode** | Expo's tunnel (`npm run mobile:tunnel`) only forwards the app code, not the API. The new `apps/mobile/scripts/tunnel.mjs` also opens an **ngrok** tunnel to the API. Run it with `node scripts/tunnel.mjs` inside `apps/mobile`; it isn't wired to an npm command yet. Needs ngrok signed in and `npm run api` running. |
| **APK builds** (`npm run mobile:build:apk`) | The APK must have `EXPO_PUBLIC_API_URL` set to an address the phone can reach. The version is stamped in. |
| **Offline drafts** (`apps/mobile/draftStore.js`) | Records are kept on the phone until they can be sent. This is the one place an offline queue makes sense. |
| **Honest results** | Add plant, revisits, Send again and Review now **check the result**. Before, a failed submit deleted the draft and said "Sent for review", and Review said "approved" even if the save failed. |
| **New buttons** | "Send for review" for drafts, editable fields on returned records, and **Finish and send** when scanning a half-saved plant. |
| **GPS** | Denied or failed GPS used to save a random spot near the trail head. Now it saves no location and says "Location not captured. The officer will be told." |
| **Map** | Clustering, and critically endangered plants get the "endangered" dot too. |

---

## 4. Bugs fixed

| Bug | Cause | Fix |
|---|---|---|
| **"duplicate key ... specimens_qr_id_key"** when adding a plant | The app sent a column that doesn't exist (`client_id`), then retried every step, inserting the plant again. Botanists also couldn't mark tags as used (RLS). | Each step runs once with app-made ids; only network errors retry. A database trigger marks the tag as used. The tag list refreshes after every attempt. |
| Plants saved with **no record** ("Draft", 0 visits), stuck forever | Side effect of the bug above | **Finish and send** completes the existing plant |
| **Review queue empty** while the badge said 8 | The API wasn't running (missing `.env`), and the page said "Bad Gateway" | **API Down** badge and banner with the fix |
| **My records page crashed** | It read the plant's name before the plant had loaded | Shows "Plant not loaded" instead |
| **Returned records couldn't be edited**; "Send again" / "Sync now" always said they worked | Only a reply box; the database's answer was ignored | Fields are editable; failures show the reason and keep your edits |
| **Scan page lost the tag** when starting a new plant | Link used `#/add?tag=X`, which the router didn't understand | Link is now `#/add/X`; the router now handles `?` too |
| **Officers and admins got no notifications** | Sending a record notified nobody; the bell only loaded once | Database trigger + 30-second refresh |
| **Made-up GPS** saved as real | Web defaulted to a fixed point, mobile to a random spot | Saved as no location, with warnings |
| A record could be **approved with no species** | Only the web page checked | The database function and API refuse it |
| **Species photo save could wipe the gallery**; links expired after 24 h; caption edits broke the file path | Deleted everything then re-inserted; saved signed links | Change-only saves through the API; real copies |
| Filters lost on refresh; search slow on big data | Filters only in memory; every plant scanned every visit | Filters in the URL; visits grouped once |
| Web CI failed (lint + build) | 6 lint errors in `Scan.jsx`; Vite couldn't find supabase-js in a clean install | Fixed lint; `resolve.dedupe` in `vite.config.js` |

### Security fixes
- A **deactivated** botanist could still change the species or endangered flag on their own plants (a `NULL` role skipped the check). Fixed.
- A botanist could move their plant to **another QR tag**, or put a plant on a **retired** tag. Fixed in the database.
- When the API was down, the apps wrote review decisions **straight to the database**, skipping the version check. Removed, and the database now blocks it too.
- Species and photo writes, publish/delete/restore, tags, alerts and user admin now go through the API's role checks, not only RLS.
- Botanists could read the **exact location of every endangered plant** through `/workspace` and the tag lookup. Fixed (CTIP-71).

---

## 5. Before you test: apply three migrations

Without these, staff get no notifications, tags can still show as unused, and approval doesn't need a species. **Don't paste them into the SQL Editor**; push them with the CLI after PR #26 is merged, and tell Amberlyn first:

```powershell
npx supabase db push --dry-run   # must list exactly these three files
npx supabase db push
```

1. `20261028000000_tag_assignment.sql`: marks tags with a plant as used; security fixes above
2. `20261029000000_staff_notifications.sql`: notifications for officers and admins
3. `20261029120000_approve_requires_species.sql`: approval needs a species; decisions only through the API

Then restart the API. Details: [rick3-must-fix.md](docs/updates/rick3-must-fix.md).

---

## 6. Still open

These were found but **not fixed**. They need a team decision.

| Severity | Issue |
|---|---|
| **Critical** | The "view the site as" role switcher is on **every page, including public ones**, and signs in to the real demo accounts (admin included) with a password that ships in the built website. Anyone can become admin. Show it only in development and change the demo passwords. |
| High | New sign-ups default to **active botanist** (`is_active` defaults to `true`). If e-mail sign-up is on, anyone can create an account. |
| Medium | A deactivated account can still add plants and records (some RLS policies don't check `is_active`). |
| Low | Login tokens are in `localStorage`; private photo links last 24 hours. |
| Leftovers | Hard-coded placeholder profiles (a ghost "Test User"); "Scan or upload QR" on web doesn't read the image; prototype wording ("Local Prototype", "Sample data only…"). |
| Missing | No location/zone filter (the database has no zone field). Old records still have made-up GPS; [rick3-bugs.md](docs/updates/rick3-bugs.md) T9 has a query to find them. |

**Not tested yet:** a full logged-in click-through in the browser, and the mobile app on a real phone. Automated tests pass (API 101/101, shared 11/11, mobile tests, web lint and build).
