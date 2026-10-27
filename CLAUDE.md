# CLAUDE.md

Context for Claude Code working in this repository.

## Project

**Smart Ground-Truthing and Digital Biodiversity System for Plant Species Documentation**

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
  in-progress form, CTIP-57), not a sync queue.
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
| Mobile | React Native + Expo (`blank` template, SDK 57), **plain JavaScript** |
| Local storage | SQLite (`expo-sqlite`): draft cache now, full offline store later |
| API | Node.js + Express |
| Database | PostgreSQL via Supabase, schema changes as Supabase CLI migrations |
| Auth | Supabase Auth, JWT, role-based access control |
| Object storage | Supabase Storage |
| IoT | ESP32 with DHT11 (temperature, humidity), YL-69 (soil moisture) and HC-SR04 (ultrasonic distance); Arduino IDE. No camera or GPS module; motion is detected with the HC-SR04 |
| Telemetry transport | MQTT over TLS (Mosquitto) |
| Node images | Laptop webcam acting as the node's camera; HTTP POST to the API |
| Anomaly detection | Python, threshold rules + statistical model (scikit-learn) |
| Contract | OpenAPI spec in `packages/api-contract/`, validated at runtime with Zod |
| Maps | Leaflet + OpenStreetMap |
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
- **One design language for web and mobile** (Daun design language v1): Fraunces
  for headings and plant names (scientific names in Fraunces italic), Nunito for
  text, JetBrains Mono for tag IDs and readings, Lucide line icons, light and dark
  themes. Every colour, type size, spacing and radius lives in
  `apps/shared/tokens.js`; the web turns it into CSS variables
  (`apps/web/src/theme.js`) and the mobile app reads it through
  `apps/mobile/components/Theme.js`. Never hard-code a hex value in a page.
  Both apps offer Light, Dark and Device (follow the device setting, the default);
  the web remembers the choice in the browser. Surfaces are solid: no frosted glass
  or blur on content. Web pages grow to 1680px wide (`layout.pageMax` in tokens.js) with a 16-48px side gutter; paragraphs keep their own reading width.
  The rules for using it are in `DESIGN.md` at the repo root.
- **Botanists search species through `GET /public/species`** (published species
  only, same search as CTIP-87). `GET /species` stays Officer and Admin only.
  Settled 27 Oct 2026.

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
apps/
  mobile/     React Native + Expo — Botanist Field App (pages/, components/)
    components/  Theme (light/dark), Bits (UI kit), Icon (Lucide), Chrome, format
    api.js    the app's API client (EXPO_PUBLIC_API_URL from .env)
    src/db/   SQLite draft cache now; offline store and sync later (not created yet)
  web/        React — Officer, Admin and Visitor interfaces
    src/api.js  the site's API client (VITE_API_URL from .env)
  shared/     used by BOTH apps: design tokens (tokens.js), sample data, store,
              selectors, permissions, site and copy. The web keeps no copies of
              these. Files here are plain .js with no JSX (Vite does not compile
              JSX in .js files)
    apiClient.js  one way for both apps to call the API: token, refresh, errors (CTIP-54)
    test/         node --test tests for shared code, run in CI
  firmware/   ESP32 sensor node (Arduino IDE sketch, not committed yet)
services/
  api/        Node + Express REST API
    src/auth/           token check (verifyToken.js) and role middleware (middleware.js)
    src/permissions.js  allowed roles for every contract route
    src/handlers.js     built endpoints; every other route answers 501
    src/species.js, speciesMedia.js, observations.js, distribution.js
                        the built endpoint groups (Sprint 2)
    src/images.js       file-type check and metadata stripping for uploads
    src/https.js        HTTPS-only mode for production (CTIP-35)
    test/               endpoint and RBAC tests (node --test), run in CI
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
  architecture/  ER diagram, threat-model data-flow diagrams (draw.io + PNG)
  security/      threat model (threat-modelling.md), encryption approach (encryption.md)
  testing/       test plan, ZAP reports, assessment evidence (empty so far)
  updates/       change notes between branches (web-update-1.md)
  (project scope PDF and marking rubric sit directly in docs/)
CLAUDE.md             this file
DESIGN.md             how to use the Daun design language in both apps
```

There is no root `package.json` and no npm workspace. `apps/web`, `apps/mobile`
and `services/api` each have their own `package.json` and `package-lock.json`;
run `npm install` inside the folder you are working in. The shared packages
(`design-system`, `hooks`, `types`, `ui`) were removed on 7 Oct 2026, so do not
import from `@ctip/*`.

## Database changes (Supabase)

The live project is shared by the whole team and there is no local database
(Docker is not installed), so every push goes straight to it.

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
  the migration history out of step with the database.
- If the dry run lists a migration whose changes are already live (someone ran
  it in the SQL Editor), do not push it again: mark it as applied with
  `npx supabase migration repair --status applied <timestamp>`, then dry-run
  again. As of 27 Oct 2026 this is needed for `20261010000000` (the token
  hook is live but not recorded); pushing it again fails with "policy already
  exists" and blocks `20261026000000` (CTIP-86).
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
- Where the MQTT bridge lives (`services/api` or `services/anomaly-detection`)
  is not decided yet. Ask before creating it.

## Workstreams

Seven workstreams, one per person, sized to roughly 18–22 story points each
across both sprints. Owners were agreed by the team on 28 Sep 2026. Some stories
have since moved between people, so the table below follows the Jira assignees
as of 27 Oct 2026 (filter the board by assignee to see one person's work).

Stories were split on 13 Oct 2026 so none is larger than 3 points (CTIP-14,
already Done, is the one 8-point story). Each original story kept its key and
its first slice; the rest became new stories, mostly in Sprint 2. Unfinished
Sprint 1 stories carry over to Sprint 2. ✓ = Done.

| Stream | Owner | Sprint 1 | Sprint 2 |
|---|---|---|---|
| **A. Mobile app UI** | Patrick | CTIP-42 app shell & login, CTIP-15 QR scan to start or open a record | Capture: CTIP-55 photos, CTIP-56 GPS, CTIP-57 crash-safe draft, CTIP-58 submit to API. CTIP-45 submission status. Map: CTIP-31, CTIP-70 clustering & filters, CTIP-71 hide endangered coordinates. CTIP-51 innovation (optional stretch) |
| **B. Mobile data & offline** | Albian | CTIP-26 species search via API, CTIP-27 QR generation | CTIP-63 pre-fill record from species. Offline, **last**: CTIP-44 local store, CTIP-83 airplane-mode capture, CTIP-84 offline species search, CTIP-16 sync queue, CTIP-66 resumable photos, CTIP-67 conflicts, CTIP-68 sync status |
| **C. Backend API & database** | Amberlyn (Sprint 1), Nicole (Sprint 2 API stories) | CTIP-13 OpenAPI contract ✓, CTIP-25 schema & storage ✓, CTIP-52 ER diagram ✓ | Nicole: CTIP-46 species CRUD ✓, CTIP-54 shared API client ✓, CTIP-85 species photos ✓, CTIP-86 review (In Review: migration not pushed), CTIP-87 search & filter ✓, CTIP-88 distribution data ✓, CTIP-89 public species ✓. Amberlyn: CTIP-32 report export. **Not yet assigned** (capture flow, added 27 Oct): CTIP-103 QR tags, CTIP-104 specimens, CTIP-105 create/edit/submit observations, CTIP-106 observation photos |
| **D. Web knowledge system** | Ricardo | CTIP-43 web login & role layouts, CTIP-28 species create/view/edit | CTIP-64 species photos, CTIP-65 soft delete ✓, CTIP-29 review queue, CTIP-69 approve/reject, CTIP-30 search & filter, CTIP-33 visitor QR page |
| **E. IoT & anomaly detection** | Norman | CTIP-17 ESP32 sensor readings & wiring, CTIP-47 sensor simulator | Node: CTIP-59 motion detection, CTIP-60 MQTT/TLS, CTIP-61 MQTT bridge, CTIP-62 webcam images. Alerts: CTIP-38 threshold rules, CTIP-75 statistical model, CTIP-76 node silent, CTIP-77 notifications, CTIP-78 acknowledge/resolve. CTIP-48 node registration & alert routing |
| **F. Security architecture** | Nicole | CTIP-14 API auth & RBAC ✓ (CTIP-40 ✓, CTIP-41 ✓) | CTIP-35 encryption (In Review), CTIP-50 remediation, CTIP-107 mobile SQLite encryption. Web admin tools moved to Amberlyn: CTIP-34 user list & invite, CTIP-72 roles & account approval, CTIP-73 deactivate user. **Not yet assigned, High:** CTIP-102 remove the Supabase secret key from app code and rotate it |
| **G. Security testing & QA** | Michelle | CTIP-18 threat model ✓, CTIP-36 test plan, CTIP-49 CI & test setup | CTIP-37 run assessment, CTIP-74 reassessment & report. IoT dashboard: CTIP-39 node map & alerts, CTIP-79 live readings, CTIP-81 history charts, CTIP-82 latest images |

Project management: Albian owns CTIP-91 (final report); its section subtasks
(CTIP-93 to CTIP-101) and CTIP-92 (final presentation) are mostly unassigned.
Nicole owns CTIP-90 (Sprint #2 report).

Notes:

- The contract, database and the first API endpoints are in place. The
  bottleneck is now the online capture flow: the API endpoints CTIP-103 to
  CTIP-106, and signing in on both apps (CTIP-42 mobile, CTIP-43 web) with
  calls going through the shared client (`apps/shared/apiClient.js`, CTIP-54 ✓).
- Security implementation (F) and security testing (G) go to **different
  people**, so nobody tests their own code. G finds, F fixes (CTIP-37 → CTIP-50).
- CTIP-42 and CTIP-43 were split out of CTIP-14 on 13 Oct 2026 and are now
  stories of their own in streams A and D.

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
  direct push or a self-merge. Don't.
- Keep branches short-lived (a day or two). Pull `main` before branching. Prefer
  one PR per story; a branch that mixes several stories is hard to review.
- `packages/api-contract/` changes need two approvals (also a team rule) — a
  change there breaks three consumers at once.
- **Jira follows the code.** Move a story to In Review only when its PR is open,
  and to Done only when it is merged and meets every acceptance criterion. If
  part is left, split the remainder into a new story instead of closing with it
  open.
- **Keep stories at 3 points or less** and estimate every story, including ones
  added mid-sprint.

## Sprint plan

Two sprints, Scrum.

- **Sprint 1** (28 Sep to Sun 11 Oct 2026, the end of semester Week 6; the report is due Fri 16 Oct, in the mid-semester break) — API contract and database, auth and RBAC,
  online mobile capture with QR/photo/GPS, species search, web species manager,
  IoT firmware and MQTT ingestion, sensor simulator, threat modelling, security
  test plan, CI.
  Closed in Jira on 14 Oct.
- **Sprint 2** (15 Oct to Thu 12 Nov 2026; the Sprint #2 report is due Fri 6 Nov)
  — in this order:
  1. Connect the web and mobile apps to Supabase Auth and the API, and finish
     the online capture flow, so the whole system works end to end online.
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

## Current status (27 Oct 2026)

Sprint 2 is in progress (ends 12 Nov). Seven Sprint 2 stories are Done
(CTIP-46, 54, 65, 85, 87, 88, 89), two are In Review (CTIP-35, CTIP-86) and four
In Progress (CTIP-27, 31, 55, 64); the rest are To Do. Six stories were added
on 27 Oct after a code review (CTIP-102 to CTIP-107).

**Working on `main`** (last merge `3d53ca9`, 26 Oct):

- OpenAPI contract: 40 paths, 56 operations (CTIP-13). Species create accepts a
  client-generated id as its idempotency key (CTIP-46); the other create
  endpoints add it as they are built (CTIP-104, CTIP-105).
- Supabase: 10 migration files, with row-level security on every table, three
  storage buckets and the access-token role hook (CTIP-25). The live history is
  out of step: `20261010000000` is live but not recorded, and `20261026000000`
  (review RPC, CTIP-86) is not pushed. See "Database changes" for the fix. The
  live database holds a little test data (27 Oct: 5 species, 4 accounts, 5
  specimens, 5 observations, 30 QR tags); there is no seed script.
- API (`services/api`): token and role checks on every contract route, plus 14
  built endpoints with 67 tests in CI:
  - Public: `GET /public/species`, `GET /public/species/{id}`
  - `GET /me`
  - Species (Officer/Admin): list and search, create, read, update, soft
    delete, `POST /species/{id}/media`
  - Observations: list (including the review queue), read, review history,
    `POST /observations/{id}/reviews` (Officer/Admin)
  - `GET /distribution`, with endangered coordinates reduced by role

  Every other route answers 501, including the whole capture flow (QR tags,
  specimens, creating and submitting observations, observation photos:
  CTIP-103 to CTIP-106), sync, sensors, telemetry, alerts, notifications,
  profiles and reports.
- HTTPS-only mode for production (`REQUIRE_HTTPS`, CTIP-35) and
  `docs/security/encryption.md`.
- Shared API client `apps/shared/apiClient.js`, with an instance in each app
  (CTIP-54). No feature uses it yet.
- Web and mobile prototypes for all roles, **still on sample data only**
  (`apps/shared/data.js`, demo password `Niah@1234`). On `main`, neither app
  calls Supabase Auth or the API yet (CTIP-42, CTIP-43).
- CI on every PR and every push to `main`: API tests, shared tests, and web lint
  and build. The mobile app has no CI job.

**Unmerged branch `rick3`** (Patrick, last commit 27 Oct): Leaflet +
OpenStreetMap maps, Supabase sign-in and live data in both apps, the mobile UI
kit split into `components/bits/` and navigation into `navigation/`, and a root
`package.json` with npm scripts. Git merges it into `main` without conflicts, but
it **must not be merged as it is**:

- It hard-codes the Supabase secret key in `apps/shared/supabase.js` and falls
  back to it whenever RLS refuses a request (CTIP-102).
- The apps read and write Supabase tables directly instead of calling the API,
  which skips the endangered-coordinate protection (CTIP-88) and the locked
  review step (CTIP-86).
- It adds a second API client (`apps/shared/api.js`) next to `apiClient.js`.
- The web build fails in CI (see Gotchas).

Details are in the CTIP-31 comments.

**Not started or not committed:** ESP32 firmware (`apps/firmware/` is empty),
sensor simulator and anomaly detection (`services/anomaly-detection/` is
empty), Mosquitto config (`infra/mosquitto/` is empty), vulnerability test plan
(`docs/testing/` is empty).

**Supabase advisor findings (27 Oct), for the assessment (CTIP-37):** leaked
password protection is off in Supabase Auth, and the `SECURITY DEFINER`
functions `approve_observation` and `my_role` can be called by any signed-in
user through `/rest/v1/rpc/`.

**Open decisions:**

- Where the MQTT bridge lives (`services/api` or `services/anomaly-detection`).
- New accounts are created as active botanists (`profiles` defaults), but the
  threat model says they get no role until an Admin approves them (CTIP-72).
- Whether to adopt the root `package.json` from `rick3`. Until the team agrees,
  the "no root `package.json`" rule above stands.

## Security requirements that affect code

- All authorisation is enforced **at the API layer**, never in the client.
- The database also has row-level security policies for the three roles
  (`botanist`, `officer`, `admin`, stored in `profiles.role`). They are a second
  layer, not a substitute: an API that connects with the Supabase service key
  bypasses them, so every non-public route still needs auth and role middleware.
- The Supabase secret key (`sb_secret_…`, formerly "service key") may only ever
  live in `services/api/.env`, never in `apps/`, never in a fallback value, never
  in git. Anything under `apps/` is bundled into the web and mobile builds, so a
  key there is public. The web and mobile apps use the publishable key, read
  from their own `.env`. (On 27 Oct the `rick3` branch committed the secret key;
  it must be revoked and replaced, CTIP-102.)
- The apps use Supabase only to sign in and refresh the session. Data reads and
  writes go through the API with `apps/shared/apiClient.js`, so the role checks,
  validation and coordinate protection always apply. Never "retry with an admin
  client" when RLS refuses something: fix the policy in a migration or add the
  action to the API.
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
  before it reaches a public view. Enforce server-side; this is a test case in the
  security assessment.
- Never commit `.env`, Supabase keys, or MQTT certs. Check `.gitignore` covers them
  before any first commit in a new folder.
- Record creation uses server-assigned IDs with client-side idempotency keys, from
  Sprint 1 onward, so retries never duplicate. When offline sync is added, silent
  loss or duplication of field records is the single worst failure mode in this
  system — those observations are irreplaceable.

## Gotchas

- The team is new to React, Supabase and MQTT. Prefer clear, conventional code over
  clever code, and explain non-obvious choices in comments or PR descriptions.
- Everyone is on Windows. Use PowerShell-compatible commands. `python`, not
  `python3`. Venv activation is `.venv\Scripts\Activate.ps1`.
- Expo SDK 57 is pinned for Expo Go compatibility. Don't bump it casually.
- Never run `npm audit fix --force` in `apps/mobile`: it downgrades Expo to 44.
  The audit findings there are in build tooling (Metro, Expo CLI), not app code.
- A file in `apps/shared/` that imports an npm package looks for it from
  `apps/shared/` upwards, not in `apps/web/node_modules`. It works on a laptop
  that also ran `npm install` at the repo root, but the web build fails in CI,
  which installs only inside `apps/web`. Add the package to `apps/web/package.json`
  **and** to `resolve.dedupe` in `apps/web/vite.config.js` (as React already is).
  The mobile app is covered by `nodeModulesPaths` in `metro.config.js`, but the
  package still has to be in `apps/mobile/package.json`.
- `npm run dev` and `npm start` in `services/api` use `node --env-file=.env` and
  stop if there is no `.env` file. On a host that sets environment variables in
  its dashboard, start the API with `node src/server.js` instead.
- EAS builds (APKs) do not upload `.env`, because it is gitignored. Put the
  app's `EXPO_PUBLIC_*` values in the build profile in `eas.json`. A release APK
  cannot reach `localhost` and blocks plain `http://`, so it needs the API on a
  public `https://` address.
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
  then `npm test` or `npm run dev`. It uses Node's `--env-file`, so it needs
  Node 20.6 or newer (CI uses Node 24). Tests need no internet: they sign their
  own tokens.
