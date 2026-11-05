# CLAUDE.md

Context for Claude Code working in this repository.

*Last checked against `main` (`28ec4a4`) on 30 Oct 2026. Jira and the live
Supabase project were last fully checked on 29 Oct; the CTIP-26, 27, 33, 63,
107, 111, 116 to 119 statuses, the live `qr_tags` policy and the migration
history were rechecked on 30 Oct.*

## Project

**Smart Ground-Truthing and Digital Biodiversity System for Plant Species Documentation**
(product name in the apps: **Daun Sense**)

University capstone (COS30049 Computing Technology Innovation Project, Swinburne
Sarawak) built with industry partner **NeuonAI Sdn Bhd** in collaboration with
**Sarawak Forestry Corporation (SFC)**. Pilot site: **Niah National Park**.

Replaces a paper-based plant documentation workflow with a digital one. Four
components:

1. **Botanist Field App** (mobile) — QR-tag a specimen, record taxonomy and
   morphology, attach photos, capture GPS, submit to the API. Full offline
   storage and sync are added last (see Connectivity below).
2. **Digital Plant Knowledge System** (web) — conservation officers manage species
   records, review and approve field submissions, search/filter, view distribution
   maps, export reports.
3. **Security layer** — auth, RBAC, encryption, built under an SSDLC with a
   documented assess → remediate → reassess cycle.
4. **IoT plant protection** — ESP32 sensor node monitoring environment and physical
   disturbance near endangered specimens, with automated alerts.

## Connectivity: online first, offline second

**Lecturer directive (28 Sep 2026): assume Wi-Fi and internet connectivity are
available in the forest.** Offline functionality for the mobile app is
**secondary**. The order is fixed:

1. Build every feature online and get the whole system working properly end to
   end: mobile and web apps talking to the API, the API to Supabase, sensor data
   flowing through to alerts.
2. **Only once that works** add offline functionality to the mobile app.

The offline stories are the last work in Sprint 2 and must not start before the
online flow works: local record store CTIP-44, airplane-mode capture CTIP-83,
offline species search CTIP-84, sync queue CTIP-16, resumable photo upload
CTIP-66, conflict handling CTIP-67, sync status CTIP-68. This differs from the
submitted System Design Proposal, which stated offline-first as a hard
requirement; the change is intentional and directed.

Do not build offline queuing or sync into any feature before then. Do keep the
design offline-ready so it can be added without rework:

- The mobile app keeps a local SQLite **draft cache** only (crash-safety for an
  in-progress form, CTIP-57, `apps/mobile/draftStore.js`), not a sync queue.
- Create requests carry a **client-generated ID / idempotency key** from the
  start, so a resent record never creates a duplicate (CTIP-13, CTIP-46,
  CTIP-58).
- Stateless JWTs (not session cookies) and MQTT for telemetry stay as decided;
  both still suit unreliable connectivity later.

## Roles

Four actors. Three authenticated, one public.

- **Botanist** — field capture, QR binding, submission (offline records and
  sync added later)
- **Conservation Officer** — species record CRUD, review/approve submissions,
  search and filter, distribution maps, report export
- **System Administrator** — user and role management, IoT node registration,
  alert routing, audit logs
- **Visitor** (unauthenticated) — scans a public QR tag, reads the published
  species profile only

## Stack

| Layer | Choice |
|---|---|
| Web | React + Vite, **plain JavaScript** |
| Mobile | React Native + Expo (`blank` template, SDK 57), **plain JavaScript**, Android only |
| Local storage | SQLite (`expo-sqlite`): draft cache now, full offline store later |
| API | Node.js + Express 5, Zod validation |
| Database | PostgreSQL via Supabase, schema changes as Supabase CLI migrations |
| Auth | Supabase Auth, **called only by the API** (CTIP-114); JWT; role-based access control |
| Object storage | Supabase Storage |
| IoT | ESP32 with DHT11 (temperature, humidity), YL-69 (soil moisture) and HC-SR04 (ultrasonic distance); Arduino IDE. No camera or GPS module; motion is detected with the HC-SR04 |
| Telemetry transport | MQTT over TLS (Mosquitto) |
| Node images | Laptop webcam acting as the node's camera; HTTP POST to the API |
| Anomaly detection | Python, threshold rules + statistical model (scikit-learn) |
| Contract | OpenAPI spec in `packages/api-contract/`, validated at runtime with Zod |
| Maps | Leaflet + OpenStreetMap (with `leaflet.markercluster`); OSM, satellite and topo base layers |
| Hosting | API on Render (`https://ctip-biodiversitysystem.onrender.com`), website on Cloudflare Pages (`https://ctip-biodiversitysystem.pages.dev`), Android APK built on EAS |
| Tests | `node --test` (API, shared code); Playwright + local LLM (Ollama) "agent" suites for web and mobile |
| Security testing | OWASP ZAP, npm audit |

## Decisions already made — do not re-litigate

These were argued out with rationale. If you think one is wrong, say so explicitly
rather than silently building something different.

- **JavaScript, not TypeScript, everywhere.** No member has used TypeScript, and
  the team is already learning React this sprint. Integration safety comes from the
  OpenAPI contract plus Zod runtime validation, not compile-time types.
- **React Compiler is NOT enabled.** The value wanted was its lint rules, which are
  available separately through `eslint-plugin-react-hooks` (`recommended-latest`).
  Do not add `babel-plugin-react-compiler` or edit `vite.config.js` for it.
- **React over Vue** despite three members having Vue experience: React Native is
  the strongest supported path for an offline mobile client with camera, QR and GPS
  access, and one framework family covers web and mobile.
- **The apps talk only to the API** (CTIP-114, merged with `rick3` on 29 Oct
  2026). Signing in, refreshing the session, signing out, password reset and
  password change all go through `/v1/auth/*` and `/v1/me/password`; the API
  calls Supabase Auth. `@supabase/supabase-js` is a dependency of
  `services/api` only. The one exception: the API hands out short-lived
  Supabase Storage links and the apps load photos from them directly.
- **MQTT for telemetry, HTTP for images from a laptop webcam.** The ESP32 has
  no camera, so a laptop webcam acts as the node's camera: a capture script
  takes a photo when the node reports motion and uploads it over HTTP (MQTT is
  unsuited to images). The image table and bucket were removed on 8 Oct 2026
  (`20261008080000`) and restored the same day for the webcam
  (`20261008090000`). Keep them.
- **QR tags are pre-printed and unassigned**, bound to a specimen at scan time so
  tagging needs no connectivity. Botanists fix a tag (in a heavy-duty plastic
  cover) to the plant, scan it and fill in the record; no printer is carried in
  the field. New tag batches are generated and printed from the web QR tags page.
- **One design language for web and mobile** (Daun design language v1). Every
  colour, type size, spacing and radius lives in `apps/shared/tokens.js`; never
  hard-code a hex value in a page. The rules are in `DESIGN.md` at the repo root.
- **Botanists search species through `GET /public/species`** (published species
  only, same search as CTIP-87). `GET /species` stays Officer and Admin only.
  Settled 27 Oct 2026. On mobile (CTIP-26) the Add plant species field always
  searches the API; the Plants tab searches it only for botanists and visitors,
  while officers and admins search the loaded list (it has unpublished species),
  and tag IDs are always looked up locally. The list returns one cover photo
  (`primary_image_url`), genus and description; paging is opt-in (`page`/`limit`),
  so the web catalogue still gets every species in one call.
- **QR tags link to `https://ctip-biodiversitysystem.pages.dev/#/tag/<tag>`**
  (`tagUrl()` in `apps/shared/selectors.js`; on the web it uses the current
  address), the visitor plant page (CTIP-33, #36). Tags printed earlier hold
  `#/dashboard/<tag>`, which still opens the same page, so never remove that
  route. The app's scanner reads only the `NIAH-####` part, so both work there.
  Visitors get the plant from `GET /public/tags/:qrId`: approved plants on
  published species only, endangered spots reduced, 30 lookups a minute per
  caller address.
- **A zone is one square of the 0.01° grid** (CTIP-109), the same grid endangered
  plants are reduced to, so a plant's zone never says more than its reduced
  location. `specimens.zone_id` is generated from `lat`/`lng`, so nobody enters or
  can change it. Trails and drawn areas were not used because no boundary data
  exists and a narrow area could pin down an endangered plant; sensor areas were
  not used because sensors sit next to endangered plants. Squares can be renamed
  (`zones.name`) once the park gives place names.
- **One app version for web and mobile:** `1.0.<commit count>` from
  `scripts/version.mjs` (MAJOR.MINOR from the root `package.json`). Shown in
  the web footer and stamped into APK builds.

## Explicitly OUT of scope — do not build

- **Automated plant species identification from photographs.** This is NeuonAI's
  own commercial product, and there is no labelled Sarawak flora dataset. The
  botanist supplies the identification; the system records it. The data model
  reserves a field for a machine-suggested ID for future integration only.
- **Offline trail navigation / pathfinding (BFS, A\*).** Not in the project brief.
- **Deep learning on sensor time series.** No labelled dataset of real disturbance
  events exists. Use threshold rules plus a lightweight statistical model.
- **Native iOS builds.** Android only.
- **Production hardware** — no weatherproofing, solar, or LoRa backhaul.
- Integration with SFC production systems or UNESCO documentation.

## Repository structure

```
package.json          root npm scripts only (no dependencies, no workspace):
                      `npm run help` lists them; `npm run install:all` installs every app
scripts/version.mjs   the shared app version (1.0.<commit count>)
apps/
  mobile/     React Native + Expo — Botanist Field App
    App.js          providers only; screens are wired in navigation/
    navigation/     AppNavigator, TabBar, tabs.js (TABS per role), routes, routeMeta
    pages/          one file per screen
    components/     Theme (light/dark), Bits.js (re-exports bits/), Icon (Lucide),
                    Chrome, LeafletMap, Toast, Logo, PhotoGallery, SpeciesPicker, format
    hooks/          useSpeciesSearch (debounced, paged GET /public/species, CTIP-26)
    draftStore.js   SQLite crash-safe draft cache (CTIP-57), encrypted (CTIP-107)
    api.js, apiAddress.js   API client; defaults to the Render API
    eas.json        APK build profiles (EXPO_PUBLIC_API_URL lives here)
    tests/          Playwright/emulator + Ollama agent tests
    AGENTS.md       Expo note: read the SDK 57 docs before writing code
  web/        React — Officer, Admin and Visitor interfaces
    src/pages/      one file per page
    src/components/ Site (page frame), RouteView, Shell (staff sidebar), Chrome,
                    Bits, LeafletMap, MiniMap, PhotoEditor/Gallery, TagPrint, ErrorBoundary
    src/routes.js, useRoute.js   hash routing
    src/api.js      the site's API client
    tests/          Playwright agent tests (live sign-in suite needs DEMO_PASSWORD)
  shared/     used by BOTH apps. Plain .js with no JSX (Vite does not compile
              JSX in .js files). The apps keep no copies of these.
    api.js          session (sign-in, refresh) and every call the store makes
    apiClient.js    generic client: token, refresh, error messages (CTIP-54)
    StoreProvider.js, store.js, selectors.js, permissions.js   app state and rules
    tokens.js       design tokens
    mapConfig.js, mapHtml.js   Leaflet settings and the WebView map page
    speciesSearch.js   species search and pre-fill rules (CTIP-26, CTIP-63), no imports
    data.js, site.js, publicContent.js, utils.js
    test/           node --test tests, run in CI
  firmware/   ESP32 sensor node (Arduino IDE sketch, not committed yet)
services/
  api/        Node + Express REST API
    src/auth/           token check (verifyToken.js) and role middleware (middleware.js)
    src/permissions.js  allowed roles for every route
    src/handlers.js     joins the endpoint groups; any route without a handler answers 501
    src/session.js      sign-in, refresh, sign-out, passwords (CTIP-114)
    src/rateLimit.js    per-address limits: sign-in, password reset, visitor tag lookup
    src/species.js, speciesMedia.js, observations.js, distribution.js,
    src/field.js        QR tags, specimens, observations and photos (capture flow)
    src/staff.js        workspace load, profiles, alerts, notifications, sensor nodes
    src/images.js       file-type check and metadata stripping for uploads
    src/https.js        HTTPS-only mode for production (CTIP-35)
    src/supabase.js     Supabase clients (publishable key; signed-in calls run as the user)
    test/               endpoint, RBAC and contract tests (node --test), run in CI
  anomaly-detection/  Python — thresholds, statistical model, sensor simulator (empty)
packages/
  api-contract/       OpenAPI spec — single source of truth
supabase/             Supabase CLI project (must stay at the repo root)
  config.toml
  migrations/         timestamped SQL: tables, RLS policies, storage buckets
  scripts/            manual SQL only (reset.sql); the CLI never runs these
infra/
  mosquitto/  broker config (certs are gitignored; empty so far)
docs/
  architecture/  ER diagram, threat-model data-flow diagrams (draw.io + PNG; v4 is current)
  security/      threat model (threat-modelling.md), encryption approach (encryption.md)
  testing/       test plan, ZAP reports, assessment evidence (empty on main)
  updates/       change notes and bug lists (rick3-bugs.md is the open security list)
  (project scope, proposal, Sprint 1 report, rubric and Jira export sit in docs/)
CLAUDE.md             this file
DESIGN.md             how to use the Daun design language in both apps
```

`apps/web`, `apps/mobile` and `services/api` each have their own `package.json`
and `package-lock.json`. The root `package.json` (adopted with `rick3`) only holds
scripts that run them (`npm run web`, `npm run mobile`, `npm run api`,
`npm run api:test`, …); it has no dependencies and is not an npm workspace. The
old shared packages (`design-system`, `hooks`, `types`, `ui`) were removed on
7 Oct 2026, so do not import from `@ctip/*`. The EAS build profiles are in
`apps/mobile/eas.json` (the empty stray one at the repo root was deleted, CTIP-118).

## Database changes (Supabase)

The live project ("Daun Sense") is shared by the whole team and there is no local
database (Docker is not installed), so every push goes straight to it.

- Run the CLI from the **repository root** with `npx supabase ...`. Never `cd`
  into `supabase/` first, and never run `supabase init` again.
- **Never edit a migration that has been applied.** The CLI will not re-run it,
  so the change silently never reaches the database. Add a new file instead:
  `supabase/migrations/<YYYYMMDDHHMMSS>_<what_it_does>.sql`.
- Write migrations so they are safe to run twice (`if not exists`,
  `create or replace`, `drop policy if exists` before `create policy`).
- Always run `npx supabase db push --dry-run` first and check it lists only the
  files you expect, then `npx supabase db push`. Tell Amberlyn before pushing.
- Do not paste SQL into the Supabase SQL Editor for schema changes; it leaves
  the migration history out of step with the database (this blocked CTIP-86
  for two days).
- If the dry run lists a migration whose changes are already live (someone ran
  it in the SQL Editor), do not push it again: mark it as applied with
  `npx supabase migration repair --status applied <timestamp>`, then dry-run
  again.
- As of 30 Oct 2026 the history is in step: all 14 migration files, up to
  `20261030000000_public_plant_by_tag` (CTIP-33), are applied and recorded. (That
  one was first run by hand in the SQL Editor, then recorded on 30 Oct; the live
  function matches the file.)
- **One exception, CTIP-111:** the live `qr: staff write` policy on `qr_tags` was
  edited by hand to allow botanists for **all** commands (so a botanist can make
  one tag, CTIP-27). The migration still says officer and admin only. A fresh
  database built from the migrations would refuse a botanist's tag, and the live
  one lets a botanist update or delete any tag through Supabase directly. Fix it
  with a new migration (botanist: insert only), not in the SQL Editor.
- `supabase/scripts/reset.sql` deletes every table. It is for setup only.

## Sensor data flow

- **Readings:** each node publishes one JSON reading to the MQTT topic
  `nodes/{node_id}/telemetry` (TLS, QoS 1). A backend subscriber (the MQTT
  bridge) forwards readings to `POST /telemetry`, so validation, storage and
  alert rules live in the API only. The sensor simulator may call
  `POST /telemetry` directly.
- **Reading fields:** `ts` is required; `temperature`, `humidity`,
  `soil_moisture`, `distance_cm`, `motion_detected`, `lat` and `lng` are
  optional, so a node sends only the sensors it has. The current node sends
  temperature and humidity (DHT11), soil moisture (YL-69, converted to
  percent on the node), distance (HC-SR04) and `motion_detected`.
- **Motion** comes from the HC-SR04: the node samples distance often between
  readings and sets `motion_detected` when it changes by more than the node's
  threshold. The server can also alert on `thresholds.distance_change_cm`.
- **Location:** the current node has no GPS, so it sends no `lat`/`lng`; its
  location is recorded at registration (`sensor_nodes.lat/lng`). The reading
  fields stay for nodes that have GPS.
- **Images:** the laptop capture script sends the raw JPEG bytes (not
  multipart) to `POST /sensor-nodes/{id}/images`, 2 MB maximum. Files go to the
  private `sensor-images` bucket at `{node_id}/{image_id}.jpg`.
- **Device auth:** these endpoints use the `X-Sensor-Key` header. Sprint 1 uses
  one shared key from the API's `.env`; per-device keys come with node
  registration (CTIP-48).
- `POST /telemetry` and both sensor image endpoints still answer 501 on `main`.
- Where the MQTT bridge lives (`services/api` or `services/anomaly-detection`)
  is not decided in the repo. Jira marks CTIP-61 (MQTT bridge) Done, but no
  bridge code is on `main`: ask Norman before creating it.

## Workstreams

Seven workstreams, one per person, sized to roughly 18–22 story points each
across both sprints. Owners were agreed on 28 Sep 2026; some stories have since
moved, so this table follows the Jira assignees as of 29 Oct 2026 (filter the
board by assignee to see one person's work). Stories were split on 13 Oct 2026 so
none is larger than 3 points. Status: ✓ Done, **R** In Review, **P** In
Progress, no mark = To Do.

| Stream | Owner | Stories |
|---|---|---|
| **A. Mobile app UI** | Patrick | CTIP-42 app shell & login R, CTIP-15 QR scan, CTIP-55 photos P, CTIP-56 GPS P, CTIP-57 crash-safe draft P, CTIP-58 submit with retry, CTIP-45 submission status P, CTIP-31 map ✓, CTIP-70 clustering & filters P, CTIP-71 hide endangered coordinates ✓, CTIP-51 innovation (optional) |
| **B. Mobile data & offline** | Albian | CTIP-26 species search via API R, CTIP-27 QR generation R, CTIP-63 pre-fill from species R, CTIP-117 mobile UI polish R, CTIP-118 prototype leftovers removed R (all merged 30 Oct). Offline, **last**: CTIP-44, 83, 84, 16, 66, 67, 68, CTIP-116 offline QR tag |
| **C. Backend API & database** | Nicole (API), Amberlyn | Nicole: CTIP-46, 54, 85, 86, 87, 88, 89 ✓. Amberlyn: CTIP-32 report export P. Capture flow CTIP-103 to 106 ✓ (unassigned). **Unassigned:** CTIP-108 remaining specimen and observation routes |
| **D. Web knowledge system** | Ricardo | CTIP-43 login ✓, CTIP-28 species ✓, CTIP-64 photos ✓, CTIP-65 soft delete ✓, CTIP-29 review queue ✓, CTIP-69 approve/reject ✓, CTIP-30 search ✓, CTIP-33 visitor QR page R (merged 30 Oct, #36), CTIP-109 zone filter |
| **E. IoT & anomaly detection** | Norman | CTIP-17, 48, 59, 60, 61 ✓ in Jira (no code on `main` yet). To do: CTIP-47 simulator, CTIP-62 webcam images, CTIP-38 threshold rules, CTIP-75 statistical model, CTIP-76 node silent, CTIP-77 notifications, CTIP-78 acknowledge/resolve |
| **F. Security architecture** | Nicole | CTIP-14 auth & RBAC ✓, CTIP-35 encryption R, CTIP-107 mobile SQLite encryption ✓, CTIP-50 remediation. Admin tools (Amberlyn): CTIP-34 user list P, CTIP-72 roles & approval P, CTIP-73 deactivate P. **Unassigned, In Review:** CTIP-102 secret key removed, CTIP-113 demo switcher removed, CTIP-114 auth through API. **Unassigned, To Do:** CTIP-110 strip location from observation photos, CTIP-111 QR tag policy as a migration, CTIP-112 six species photos missing from Storage, CTIP-119 mobile session in SecureStore |
| **G. Security testing & QA** | Michelle | CTIP-18 threat model ✓, CTIP-36 test plan P (branch not merged), CTIP-37 run assessment P, CTIP-49 CI & tests, CTIP-74 reassessment. IoT dashboard: CTIP-39 P, CTIP-79, CTIP-81, CTIP-82 |

Project management: Albian owns CTIP-91 (final report); its section subtasks
(CTIP-93 to CTIP-101) and CTIP-92 (final presentation) are mostly unassigned.
Nicole owns CTIP-90 (Sprint #2 report, due Fri 6 Nov).

Notes:

- Security implementation (F) and security testing (G) go to **different
  people**, so nobody tests their own code. G finds, F fixes (CTIP-37 → CTIP-50).
- Several stories are In Review although their code is already on `main`
  (CTIP-42, 102, 113, 114): move them on once their acceptance criteria are checked.
  CTIP-26, 27, 63 and 117 are the same: merged on 30 Oct (#33 to #35, #37,
  #38) without a second approval, and their phone checks are not recorded yet
  (listed in each PR). CTIP-63 also waits on the species ID decision (Open
  decisions). CTIP-33 (#36) is merged and In Review too.

Team: Albian (Product Owner), Nicole (Scrum Master), Amberlyn, Michelle, Norman,
Patrick, Ricardo. All seven also act as developers.

## Conventions

- **Branch per task**, named after the Jira issue key (project `CTIP`, board at
  https://kampungsemuacina.atlassian.net):
  `feature/CTIP-15-local-sqlite-schema`, `fix/CTIP-16-conflict-resolution-edge-case`
- **Commit messages start with the issue key**: `CTIP-15: add specimen recording form`
- **Never push to `main`.** Open a PR, get one approval from someone else, and
  confirm CI passed before merging. This is a **team rule, not enforced by
  GitHub**: branch protection and rulesets are not available for this private
  repository on the organisation's free plan, so nothing technically stops a
  direct push or a self-merge. Don't. (`.github/CODEOWNERS` is still a commented-out
  placeholder.)
- Keep branches short-lived (a day or two). Pull `main` before branching. Prefer
  one PR per story; a branch that mixes several stories (like `rick3`) is hard to
  review. Use "Squash and merge".
- `packages/api-contract/` changes need two approvals (also a team rule) — a
  change there breaks three consumers at once. Every route in
  `services/api/src/permissions.js` must also be in the contract;
  `services/api/test/contract.test.js` fails otherwise.
- **Jira follows the code.** Move a story to In Review only when its PR is open,
  and to Done only when it is merged and meets every acceptance criterion. If
  part is left, split the remainder into a new story instead of closing with it
  open.
- **Keep stories at 3 points or less** and estimate every story, including ones
  added mid-sprint.

## Sprint plan

Two sprints, Scrum.

- **Sprint 1** (28 Sep to Sun 11 Oct 2026; report submitted Fri 16 Oct) — API
  contract and database, auth and RBAC, online mobile capture with QR/photo/GPS,
  species search, web species manager, IoT firmware and MQTT ingestion, sensor
  simulator, threat modelling, security test plan, CI. Closed in Jira on 14 Oct.
- **Sprint 2** (15 Oct to Thu 12 Nov 2026; the Sprint #2 report is due Fri 6 Nov)
  — in this order:
  1. Connect the web and mobile apps to the API and finish the online capture
     flow, so the whole system works end to end online. *(Mostly done on 29 Oct.)*
  2. Knowledge system, review/approval workflow, distribution maps, report
     export, admin tools, anomaly detection and alerting, visitor public
     access.
  3. Vulnerability assessment → remediation → reassessment. The assessment
     runs at the **start** of Sprint 2, not the end, because the brief requires
     evidence of reassessment after remediation.
  4. **Last, and only once the online system works properly:** offline mode and
     sync for the mobile app. Then the optional innovation component.
- **After Sprint 2:** the final report and each member's learning summary report
  are due Fri 27 Nov 2026 (CTIP-91, CTIP-92).

## Current status (30 Oct 2026)

Sprint 2 is in progress (ends 12 Nov). In Jira on 29 Oct: 25 Sprint 2 stories
Done, 6 In Review, 13 In Progress, the rest To Do (see Workstreams). Since then
CTIP-107 is Done; CTIP-26, 27, 33 and 63 are In Review; CTIP-117 (mobile UI
polish) and CTIP-118 (prototype leftovers) were added and are In Review;
CTIP-119 (mobile session in SecureStore) was added as To Do.

**On `main`** (`28ec4a4`, 30 Oct). `rick3` (PR #26) was merged on 29 Oct after
its blockers were fixed (no secret key, no direct Supabase access, CI green,
endangered coordinates protected); then CTIP-113, CTIP-28 and the switch to the
Render API (#27, #28, #30), CTIP-107 SQLite encryption (#31), and on 30 Oct
CTIP-26 species search (#33), CTIP-27 QR generation (#34, follow-up #37),
CTIP-63 pre-fill (#35), CTIP-33 visitor QR page (#36), CTIP-117 mobile UI
polish (#38), the CLAUDE.md update (#39), CTIP-118 prototype leftovers (#41)
and Patrick's mobile fixes (#40, no story).

- **Both apps run on live data through the API.** Staff sign in through
  `POST /v1/auth/sign-in`; the store loads with `GET /v1/workspace` (staff) or
  `GET /v1/public/workspace` (visitors). The sample data in
  `apps/shared/data.js` is now an empty seed, except the leftovers listed below.
- **API** (`services/api`): 71 routes, all with token and role checks; **56
  built**, about 124 API tests and 39 shared tests in CI. The 15 that still answer 501:
  - `GET /species/:id/media`, `GET /specimens`, `GET /specimens/:id`,
    `PATCH /observations/:id`, `DELETE /observations/:id`,
    `POST /observations/:id/photos/:photoId/confirm` (CTIP-108)
  - `POST /sync` (offline, last)
  - Sensors: `POST /sensor-nodes`, `GET /sensor-nodes/:id`,
    `GET /sensor-nodes/:id/telemetry`, `POST /telemetry`, both
    `/sensor-nodes/:id/images` routes
  - Reports: `GET /reports/observations`, `GET /reports/species` (CTIP-32)
- **OpenAPI contract:** 51 paths, 71 operations, kept in step with
  `permissions.js` by `contract.test.js`.
- **Supabase:** 14 migrations, all applied and recorded (see Database
  changes). Visitors read one plant by tag through
  `public_plant_by_tag()` (`20261030000000`), never the `specimens` table. Officers and
  admins get notifications from database triggers (`20261029000000`); approval
  needs a species, and decisions can only be written through
  `review_observation()` (`20261029120000`). There is no seed script.
- **Deployed:** API on Render, website on Cloudflare Pages, APK on EAS. Both apps
  default to the Render API (see Gotchas).
- **CI** on every PR and every push to `main`: API tests, shared tests, and web lint
  and build. The mobile app has no CI job; check it with
  `cd apps/mobile && npx expo export --platform android --output-dir <tmp folder>`
  (catches broken imports), and delete the folder afterwards.
- **Mobile capture extras (30 Oct):** species search and pick in Add plant
  (`SpeciesPicker`), API search in the Plants tab, and a tag's QR drawn on the
  phone and shared or saved as a PNG (`TagQrView` in `pages/TagQr.js`;
  `react-native-qrcode-svg`, `react-native-view-shot`, `expo-sharing`). A
  botanist with no tag uses "No tag? Make a new one" on Scan, then
  "Generate new QR tag" and "Show QR" (CTIP-27, #37).
- **Mobile Plants tab (CTIP-117, #38):** Tagged plants and Species switch in
  place (`nav.replace` with `{ view }`), in one fixed order per role.
- **Mobile fixes from #40 (Patrick):** the app stays signed in after a restart
  (`setStorageAdapter(AsyncStorage)` in `App.js`, `restoreSession()` in
  `apps/shared/api.js`; see the security note below), photo uploads send bytes
  that Expo's fetch accepts, a revisit sends its location and retries, plant and
  species pages show a real Leaflet map (`shownCoords()`, so endangered spots
  stay reduced), and API calls wait 30 s (60 s for writes) for Render's cold
  start.

**Not merged:** `CTIP-36-Test-Plan` (Michelle),
`docs/CTIP-26-27-63-implementation-plan` (Albian; plan only).
Merged and safe to delete: `feature/CTIP-63-prefill-from-species`,
`rick-CTIP-33`, `fix/CTIP-27-generate-without-tag`,
`fix/CTIP-117-mobile-ui-polish`, `chore/CTIP-118-cleanup-main`,
`Patrick1-mobile`, and `fix/mobile-ui-polish` (an earlier name of the CTIP-117
branch, never used).

**Not started or not committed:** ESP32 firmware (`apps/firmware/` is empty),
MQTT bridge, sensor simulator and anomaly detection (`services/anomaly-detection/`
is empty), Mosquitto config (`infra/mosquitto/` is empty), vulnerability test
plan (`docs/testing/` is empty on `main`).

**Leftovers to clean up before the demo** (details in
`docs/updates/rick3-bugs.md` §7): the web "Scan or upload QR" button picks the
next unused tag instead of reading the image (S6, needs its own story). S3
(placeholder profiles), S7 (mobile `PhotoEditor.js`) and S8 (prototype
wording) were removed with CTIP-118 on 30 Oct.

**Open security findings, for the assessment (CTIP-37):** see
`docs/updates/rick3-bugs.md` §3. Still open: new sign-ups default to active
botanists (H1, also CTIP-72), deactivated accounts can still write through RLS
(M1), sessions kept in `localStorage` on the web (L1), 24-hour private photo
links (L2), the hand-edited `qr_tags` policy (CTIP-111, see Database changes),
and since #40 the mobile session, refresh token included, kept unencrypted in
AsyncStorage (the mobile counterpart of L1; CTIP-119 moves it to
`expo-secure-store`).
Supabase advisor (29 Oct): leaked password protection is off, and
the `SECURITY DEFINER` functions `my_role` and `review_observation` can be
called by any signed-in user through `/rest/v1/rpc/` (`review_observation`
checks the role itself).

**Open decisions:**

- Where the MQTT bridge lives (`services/api` or `services/anomaly-detection`).
- New accounts are created as active botanists (`profiles` defaults), but the
  threat model says they get no role until an Admin approves them (CTIP-72).
- Picking a species on mobile (CTIP-63) fills only the name: the record keeps
  `proposed_species_name`, and officers link the species at review. Decide
  whether that meets "taxonomy is pre-filled", or let botanists send the
  species ID when creating a specimen.

## Security requirements that affect code

- All authorisation is enforced **at the API layer**, never in the client.
- The database also has row-level security policies for the three roles
  (`botanist`, `officer`, `admin`, stored in `profiles.role`). They are a second
  layer, not a substitute. The API uses only the publishable key and runs every
  signed-in query **as that user** (`supabaseAs` in `services/api/src/supabase.js`),
  so RLS always applies behind the API's role checks.
- The Supabase secret key (`sb_secret_…`, formerly "service key") is not used
  anywhere in the code. If a future feature truly needs it, it may only live in
  `services/api/.env`: never in `apps/`, never in a fallback value, never in
  git. Anything under `apps/` is bundled into the web and mobile builds, so a
  key there is public. (The `rick3` branch once committed it; it was rotated,
  CTIP-102. Its old commits stay in that branch's history.)
- The apps never call Supabase. Sign-in, data reads and writes go through the
  API (`apps/shared/api.js`), so the role checks, validation and coordinate
  protection always apply. Never add an "admin client" or a direct-Supabase
  fallback when something is refused: fix the policy in a migration or add the
  action to the API.
- Sign-in is limited to 10 tries per caller address every 5 minutes, and the
  visitor tag lookup to 30 a minute (`429 TOO_MANY_ATTEMPTS`,
  `services/api/src/rateLimit.js`). On a host behind a proxy, set
  `TRUST_PROXY=1` or every caller shares one limit.
- **The API reads the role from the `user_role` claim** in the Supabase access
  token, added by the `custom_access_token_hook` migration. Never read the role
  from the request body. Local `supabase start` turns the hook on from
  `config.toml`; on the hosted project it must be turned on by hand
  (Authentication > Hooks), or every signed-in request gets
  `403 ACCOUNT_NOT_ACTIVE`.
- Because the role sits in the token, a role change or deactivation only takes
  effect when the user's token refreshes (up to about an hour).
- API errors are always JSON `{ code, message }`, never HTML. An expired token
  gets `401 TOKEN_EXPIRED`, which tells the client to refresh and retry.
- Coordinate precision must be **reduced for any specimen flagged as endangered**
  before it reaches anyone but an officer, an admin or the botanist who
  registered it. Enforce server-side with `protectSpecimen()` /
  the `/distribution` rule in `services/api/src/distribution.js` (0.01° grid,
  `location_reduced: true`, null stays null, unknown species fails closed). Any
  new endpoint that returns specimens must use it; this is a test case in the
  security assessment.
- There is no demo role switcher any more. Its buttons were removed from both
  apps in #36, and the store code (`setRole`, `ROLE_SWITCH_ENABLED`) and the
  demo profiles in `apps/shared/data.js` in CTIP-118. The role always comes from
  the signed-in user's profile, loaded through the API. To try another role,
  sign in as that account. Never put a password in the code (CTIP-113). The
  agent test suites keep their sample profiles in
  `apps/mobile/tests/helpers/demoProfiles.mjs`.
- Never commit `.env`, Supabase keys, or MQTT certs. Check `.gitignore` covers them
  before any first commit in a new folder.
- Record creation uses server-assigned IDs with client-side idempotency keys, from
  Sprint 1 onward, so retries never duplicate. When offline sync is added, silent
  loss or duplication of field records is the single worst failure mode in this
  system — those observations are irreplaceable.
- A plant with no GPS fix is saved with no location (`lat`, `lng`,
  `gps_accuracy_m` all null), never with a made-up position.

## Gotchas

- The team is new to React, Supabase and MQTT. Prefer clear, conventional code over
  clever code, and explain non-obvious choices in comments or PR descriptions.
- Everyone is on Windows. Use PowerShell-compatible commands. `python`, not
  `python3`. Venv activation is `.venv\Scripts\Activate.ps1`.
- The mobile API address is set in one place: `index.js` calls
  `configureApiAddress()` (`apiAddress.js`), which reads `EXPO_PUBLIC_API_URL`
  and adds `/v1`. (`App.js` used to set it a second time; removed in CTIP-49.)
- **Both apps talk to the live Render API by default**, even in local dev: the
  web dev server proxies `/v1` to Render, and the mobile app falls back to
  `https://ctip-biodiversitysystem.onrender.com/v1`. To test API changes locally,
  start the API (`npm run api`) and set `VITE_API_URL=http://localhost:8000`
  (web) or `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8000` (mobile; a phone
  cannot reach `localhost`). The apps' `.env.example` files were removed on
  29 Oct; only `services/api/.env.example` remains.
- After pulling, run `npm run install:all` from the repo root. A stale
  `node_modules` makes the API tests fail with `ERR_MODULE_NOT_FOUND` before any
  test runs.
- Expo SDK 57 is pinned for Expo Go compatibility. Don't bump it casually, and
  read the SDK 57 docs before writing mobile code (`apps/mobile/AGENTS.md`).
- Never run `npm audit fix --force` in `apps/mobile`: it downgrades Expo to 44.
  The audit findings there are in build tooling (Metro, Expo CLI), not app code.
- A file in `apps/shared/` that imports an npm package looks for it from
  `apps/shared/` upwards, not in `apps/web/node_modules`. It works on a laptop
  that also ran `npm install` at the repo root, but the web build fails in CI,
  which installs only inside `apps/web`. Add the package to `apps/web/package.json`
  **and** to `resolve.dedupe` in `apps/web/vite.config.js` (as React already is).
  The mobile app is covered by `nodeModulesPaths` in `metro.config.js`, but the
  package still has to be in `apps/mobile/package.json`.
- The mobile navigator renders only the top screen of its stack
  (`navigation/AppNavigator.js`): a screen covered by `nav.go()` unmounts and
  loses its state, and coming back rebuilds it from its route params. Keep
  in-progress form state on the screen (show a view in place, as Add plant does
  for the QR) or in its params via `nav.replace()`.
- A store function used in an effect's dependency list must be wrapped in
  `useCallback`, or the page re-fetches in a loop (CTIP-28: one open species page
  sent 1,500 requests in 4.5 minutes).
- `npm run dev` and `npm start` in `services/api` use `node --env-file=.env` and
  stop if there is no `.env` file. On a host that sets environment variables in
  its dashboard (Render), start the API with `node src/server.js` instead.
- EAS builds (APKs) do not upload `.env`, because it is gitignored. Put the
  app's `EXPO_PUBLIC_*` values in the build profile in `apps/mobile/eas.json`.
  Build with `npm run mobile:build:apk` so the version is stamped
  (`npm run build:apk:local` in `apps/mobile` builds inside WSL with the
  `preview-local` / `production-local` profiles). `apps/shared/version.json` is
  written and deleted around each build: never commit it. A release APK
  cannot reach `localhost` and blocks plain `http://`, so it needs the API on a
  public `https://` address. Older APKs that signed in to Supabase directly stop
  working properly; everyone should install a current one.
- The "agent" test suites (`npm run test:agent`, `npm run mobile:test:agent`) need
  a local Ollama model, and the mobile one an Android emulator; they are not in
  CI. The web live sign-in suite reads `DEMO_PASSWORD` from the environment and
  skips without it.
- Password-reset links open the website. Supabase's Site URL and Redirect URLs
  (Authentication > URL Configuration) must list the Cloudflare Pages address, or
  reset emails link to `localhost`.
- Arduino IDE needs the sketch's main `.ino` file in a folder of the same name
  (`apps/firmware/sensor_node/sensor_node.ino`). Libraries and board settings
  live on Norman's machine, so list them with versions in `apps/firmware/README.md`.
  WiFi and MQTT credentials go in a gitignored `secrets.h`.
- Sensor wiring traps: connect the YL-69 to an ADC1 pin (GPIO 32 to 39),
  because ADC2 pins stop working while Wi-Fi is on. Power the YL-69 from a GPIO
  and switch it on only to read, or the probe corrodes. The standard HC-SR04
  runs on 5 V and its echo signal can damage a 3.3 V ESP32 input: use a voltage
  divider or the 3.3 V HC-SR04P. Read the DHT11 at most about once a second.
- A change to the API contract can be checked with
  `npx @redocly/cli lint packages/api-contract/openapi.yaml`.
- API: in `services/api`, copy `.env.example` to `.env`, run `npm install`,
  then `npm test` or `npm run dev` (or `npm run api:test` / `npm run api` from
  the root). It uses Node's `--env-file`, so it needs Node 20.6 or newer (CI uses
  Node 24). Tests need no internet: they sign their own tokens.
