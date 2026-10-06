# Threat Model: Smart Ground-Truthing and Digital Biodiversity System

**Ticket:** CTIP-18 (Sprint 1) | **Owner:** Michelle | **Status:** Draft v0.2
**Purpose:** First "assess" step of the SSDLC. Find what can go wrong *before* the code is written, so Nicole knows what to protect in login and permissions, and so the Sprint 2 test plan (CTIP-36) has a list of things to test. It supports the Verification step in the project proposal (Table 3) and risks R5 and R11 in the risk register.

---

## 1. Scope and assumptions

**In scope:** Botanist mobile app (offline-first sync), web app for officers and administrators, public Visitor QR page, API, authentication, database, photo storage, IoT sensor node over MQTT, alerts, backups, deployment pipeline.

**Out of scope** (as in the proposal): automatic species identification, connection to SFC or UNESCO databases, real field deployment of sensors (prototype only), iOS testing.

**Technology (from the proposal):** React + Vite (web), React Native + Expo with SQLite (mobile), Node.js + Express (REST API), Supabase Auth with JWT, PostgreSQL and Object Storage on Supabase, Eclipse Mosquitto (MQTT over TLS), ESP32-CAM sensor node, Leaflet + OpenStreetMap (maps), GitHub + CI/CD pipeline.

**Roles (4):**

| Role | Can do | Trust level |
|---|---|---|
| Botanist | Scan QR, register plants, add details/photos/GPS, sync, view own submissions | Logged in |
| Conservation Officer | Add/edit/delete species, approve or reject observations, search, export reports, view maps | Logged in, high privilege on data |
| Admin (System Administrator) | Manage users and roles, register sensor nodes, monitor dashboard and alerts, review audit logs | Highest privilege |
| Visitor | View public plant page, search published species | **Not logged in. Fully untrusted** |

**Assets we must protect (most valuable first):**
1. Exact GPS location of endangered/rare plants (poaching risk)
2. Integrity of plant records and sensor readings (data must be true)
3. User accounts, passwords, tokens
4. Photos and uploaded files (photos can contain GPS in their EXIF data)
5. Availability of the API, the public page and the alerts

**Assumptions:** all traffic uses HTTPS/TLS. Server-assigned IDs and idempotency keys are used for offline sync. Coordinate reduction happens at the API layer, not in the client (risk R11).

---

## 2. Data flow diagram (DFD)

![Data flow diagram](../architecture/threat-model-dfd-v2.drawio.png)

**How to read it.** Dashed boxes are **trust boundaries**. Any arrow that crosses from one box to another carries data that must be checked. Line colours: **red** = exact GPS or other sensitive data, **green** = public data with reduced coordinates only, **black** = other data, **dotted** = physical action (scanning a tag). Most of the threats below come from one question: *how do we stop red data from leaking onto a green path?*

**Trust zones**

| Zone | What is in it | Trust |
|---|---|---|
| User devices on the internet | Botanist app and its encrypted on-device store, Officer/Admin browser, Visitor browser | Untrusted |
| Field (physical, unattended) | QR tag on plant, IoT sensor | Untrusted: anyone can walk up and touch these |
| Public-facing tier | Reverse proxy / gateway (TLS, rate limit, size limit), public plant page, public photo copies, MQTT broker | Semi-trusted |
| Application tier | Auth service, API (RBAC, validation, coordinate reduction), telemetry ingest | Trusted |
| Data tier | Database (exact GPS), photo storage (originals with EXIF), audit log, backups | Trusted |
| Third-party services | Email/SMS provider, map tile provider, CI/CD pipeline | External |

**Flows that cross a trust boundary (F)**

| ID | Flow |
|---|---|
| F1 | Botanist app to gateway: login and sync records (HTTPS) |
| F2 | Botanist app to gateway: photo upload (EXIF GPS inside) |
| F3 | Officer/Admin to gateway: login with MFA, manage and approve |
| F4 | IoT sensor to MQTT broker: telemetry (MQTT + TLS) |
| F5 | Visitor to public plant page: view and search (HTTPS) |
| F6 | API to Officer/Admin: report export (bulk exact GPS) |
| F7 | Public photo copies to Visitor: fetch public photo |
| F8 | Physical: scanning the QR tag on the plant |
| F9 | Officer/Admin browser to map tile provider (coordinates in the request) |
| F10 | Telemetry ingest to email/SMS provider: alerts |
| F11 | CI/CD pipeline to application tier: deploy (holds deploy secrets) |

**Internal flows (I)**, which stay inside our own tiers: I1 credentials to Auth service, I2 authenticated requests gateway to API, I3 public read-only (whitelisted fields, reduced coordinates), I4 telemetry broker to ingest, I5 readings to database, I6 records (exact GPS) API to database, I7 originals API to photo storage, I8 stripped copy to public copies, I9 audit events to audit log, I10 backup, I11 user lookup.

---

## 3. Threat table (STRIDE)

**Rating:** Likelihood (L) and Impact (I) are each scored Low = 1, Medium = 2, High = 3. **Risk score = L x I:** 9 = **Critical**, 6 = **High**, 3 to 4 = Medium, 1 to 2 = Low.

| ID | Where | STRIDE | What could go wrong | L | I | Risk | Mitigation |
|---|---|---|---|---|---|---|---|
| T1 | F1, F3, I1 | S | Stolen or guessed password used to log in and submit fake records | M | M | Med | Strong password rules, rate-limit and lock out repeated logins at the gateway, short-lived JWT with refresh, revoke sessions on logout, role change or account deactivation |
| T2 | F1, F3, I2 | E | Botanist edits a request to set their own role to admin | M | H | **High** | Role comes from server-controlled data (roles table or Supabase `app_metadata`), never from the request body or user-editable `user_metadata`; check role on every endpoint; deny by default |
| T3 | F1 sync | T | Replayed or duplicated sync requests create duplicate or forged records; two devices overwrite each other | M | M | Med | Idempotency key per record, server-assigned IDs, server sets author and timestamp, validate every field, revalidate cached offline session before sync |
| T4 | Phone | I | Lost or stolen phone exposes cached records, exact GPS and tokens | M | H | **High** | Encrypt the on-device SQLite store with a key kept in the secure keystore, store tokens in secure storage, cache only what is needed, clear on logout, deactivate account to cut sync |
| T5 | F2 | T/E | Malicious file renamed to .jpg, or huge file, uploaded | M | H | **High** | Check file type by content not extension, size limit at gateway, re-encode image, random filenames, private storage bucket |
| T6 | F2, F7, I8 | I | Photo EXIF data contains exact GPS and leaks through the public photo | H | H | **Critical** | Create a stripped copy (I8) and serve only that publicly; keep the original in private storage; test that public photos have no GPS |
| T7 | F3, I9 | R/T | Officer or admin approves, rejects, deletes or exports and there is no record; or someone edits the log to hide it | M | M | Med | Append-only audit log: API account can only insert, never update or delete; log who, what and when for approve, reject, edit, delete, export, role change, alert acknowledgement |
| T8 | F3, I2 | S/E | Changing a record ID in the URL to view or edit someone else's data (IDOR); botanist edits an already approved record | M | H | **High** | Check ownership and role on every object, not only every page; lock approved records for botanists |
| T9 | F3, F5 | T | Script or SQL injected through species descriptions, forms or the search box | M | H | **High** | Parameterised queries, output encoding, Content-Security-Policy, input validation |
| T10 | F4, I4 | S/T | Attacker publishes fake sensor readings to hide a real threat or trigger false alerts | M | H | **High** | Per-device revocable credentials, TLS, topic ACLs (a device can publish only to its own topic), ingest checks device ID matches topic, plausible ranges, timestamps |
| T11 | F4 | D | Broker flooded with messages, or alerts spammed | M | M | Med | Mosquitto connection and message-rate limits, maximum payload size, alert de-duplication in ingest |
| T12 | F4 | I | Telemetry sniffed on the network reveals sensor and plant locations | M | H | **High** | MQTT over TLS only, no anonymous connections |
| T13 | F5, I3 | I | Visitor page or search shows exact GPS of an endangered plant, so poachers can find it | H | H | **Critical** | Reduce coordinate precision **in the API** (I3) before building the public response, driven by the endangered flag; whitelist public fields; never send full coordinates and hide them in the front end (matches risk R11) |
| T14 | F5 | E/T | Visitor guesses or counts through plant IDs to harvest all records, or sees unapproved drafts | M | H | **High** | Non-guessable IDs (UUID), only approved and public-flagged records returned, search results use the same whitelist, rate limiting |
| T15 | F5, F7 | D | Public QR page or photo endpoint flooded with requests | H | M | **High** | Rate limit per IP at the gateway, caching, pagination, cheap read-only queries |
| T16 | F8 | S | Fake QR sticker swapped onto a tag, pointing to a malicious site | L | M | Low | QR holds only an opaque random ID; page shows species name and photo so visitors can cross-check; tamper-evident tags; accepted as residual risk |
| T17 | Data tier, config | I | Database leak, or secrets committed to the repo, expose users and records | L | H | Med | Encrypt sensitive data at rest, least-privilege database accounts, secrets in environment variables never in Git, secret scanning, service key used only on the server |
| T18 | F6 | I | Compromised or careless officer account exports all exact GPS in one report | M | H | **High** | Export only for Officer/Admin, MFA for these roles, log every export, limit size and frequency, any report meant for sharing uses reduced coordinates |
| T19 | F9 | I | Map tile requests carry coordinates to a third party, revealing where an endangered plant is when an officer zooms in | M | M | Med | Cap maximum zoom for endangered records, proxy or self-host tiles, never send exact coordinates in other third-party calls |
| T20 | F10 | I | Alert text sent by email or SMS contains exact GPS, and sits in a third party's system | M | H | **High** | Alert contains node ID, time and a link to the dashboard (login required), never coordinates |
| T21 | F11 | T/I | CI/CD pipeline compromised: deploy secrets stolen or malicious code deployed | L | H | Med | Secrets in the pipeline's encrypted store, least-privilege deploy token, merge to main only through reviewed pull requests, npm audit in the pipeline, no secrets printed in logs |
| T22 | I1, I11 | S/E | Password-reset or MFA flow abused to take over an officer or admin account | M | H | **High** | Single-use, short-lived reset tokens, same error message whether or not the email exists, rate limit, MFA for Officer/Admin, notify user on reset |
| T23 | Sensor (field) | D/T | Sensor powered off, removed or jammed so a poacher goes unnoticed | M | H | **High** | Heartbeat messages, "node offline" alert when heartbeats stop (matches the disconnection requirement), movement alert on the node itself |
| T24 | I10 | I | Stolen or misplaced backup exposes all exact GPS and user data | L | H | Med | Encrypted backups, restricted access, tested restore, defined retention |
| T25 | Database, storage | E/I | Attacker skips the API and calls the database or storage directly (for example with the public key inside the app), bypassing role checks and coordinate reduction | M | H | **High** | Row Level Security on every table with deny by default, service key never in any client, original photo bucket private, only stripped copies in the public bucket |

---

## 4. Summary of risk

- **Critical (2):** T6, T13. Both are the same disaster: *the exact location of an endangered plant reaches the public.* Fix first.
- **High (14):** T2, T4, T5, T8, T9, T10, T12, T14, T15, T18, T20, T22, T23, T25
- **Medium (8):** T1, T3, T7, T11, T17, T19, T21, T24
- **Low (1):** T16 (accepted as residual risk)

Many of the serious threats are about exact GPS leaving the system by some route: public page (T13), photo EXIF (T6), export (T18), SMS/email (T20), map tiles (T19), sniffed telemetry (T12) and direct database access (T25).

---

## 5. Tickets for fixes that need code

*(Proposed. Create these in Jira and link them to CTIP-18. Owners are suggestions to confirm in sprint planning.)*

| Proposed ticket | Covers | Suggested owner |
|---|---|---|
| Server-side RBAC: deny by default, role never taken from the request, object-level checks | T2, T8 | Nicole |
| Auth hardening: password rules, login rate limit, token expiry and revoke, safe reset flow, MFA for Officer/Admin | T1, T22 | Nicole |
| Supabase hardening: Row Level Security on all tables, private buckets, service key server-side only | T25 | Nicole / backend dev |
| Sync endpoint: idempotency key, server-assigned IDs, input validation | T3 | Backend dev |
| Public view: server-side coordinate reduction, field whitelist, UUID IDs, approved-only | T13, T14 | Backend dev |
| Upload hardening: content-type check, size limit, EXIF-stripped public copies | T5, T6 | Backend dev |
| Audit log (insert-only) for approve, reject, edit, delete, export, role change, alert acknowledgement | T7 | Backend dev |
| Export, alert and map privacy: export controls, no coordinates in alert text, capped map zoom | T18, T19, T20 | Backend / web dev |
| MQTT security: per-device credentials, TLS, topic ACLs, rate limits, heartbeat and offline alert | T10, T11, T12, T23 | IoT dev (not the tester) |
| Gateway rate limiting and caching on public endpoints | T15 | Backend dev |
| Mobile: encrypted local storage, secure token storage | T4 | Mobile dev |
| Injection and XSS protection: parameterised queries, output encoding, CSP | T9 | Backend / web dev |
| Secrets, pipeline and backup hardening | T17, T21, T24 | Backend dev |

**Separation of duties:** whoever threat-models and tests (Michelle) must not implement the auth/RBAC or IoT ingestion code.

---

## 6. Link to the test plan (CTIP-36)

Each threat becomes at least one security test in Sprint 2. Tools follow the proposal: OWASP ZAP, npm audit, Postman, manual authorisation testing and MQTT checks.

| Threat | Test idea |
|---|---|
| T1 | Try 20 wrong logins; expect lockout or 429 |
| T2 | Botanist sends `"role":"admin"` (also in user metadata); expect it ignored |
| T3 | Send the same sync request twice; expect one record |
| T4 | Inspect app storage on a test Android phone; expect no readable data or tokens |
| T5 | Upload a fake .jpg and an oversized file; expect rejection |
| T6 | Download a public photo and check its EXIF; expect no GPS |
| T7 | Do an approve, delete and export; expect log entries; try to edit a log entry, expect denied |
| T8 | Request another user's record by ID; expect 403/404 |
| T9 | ZAP scan plus SQL and script payloads in forms and search |
| T10 | Publish with wrong credentials, and to another node's topic; expect refusal |
| T11 | Burst of messages and an oversized payload; expect limits to hold |
| T12 | Connect without TLS or anonymously; expect refusal |
| T13 | Request an endangered plant from the public API; expect reduced coordinates in every field |
| T14 | Try random and sequential IDs and an unapproved record; expect 404 |
| T15 | Burst of requests to the public endpoint; expect 429 |
| T16 | Review: public page shows species name and photo; tag-fitting procedure documented |
| T17 | Secret scan of the repo and history; npm audit |
| T18 | Visitor and botanist call the export; expect 403; officer export appears in log |
| T19 | Watch network requests at maximum zoom on an endangered plant; expect capped zoom or proxy |
| T20 | Trigger an alert; expect no coordinates in the email/SMS text |
| T21 | Push to main without a pull request; expect blocked; check secrets are masked in logs |
| T22 | Reuse and expire a reset link; expect rejected |
| T23 | Switch off a sensor; expect an offline alert within the set time |
| T24 | Check the backup is encrypted and access is restricted; do a test restore |
| T25 | Call the database and storage directly with the public key; expect denied |

**SSDLC cycle:** Assess (this document) then Remediate (tickets above) then Reassess (re-run the same tests and record before-and-after evidence in the remediation log).

---

## 7. Open questions for the team

1. **MFA:** the DFD shows MFA for login. Is MFA in scope for the prototype, or only strong passwords?
2. **Supabase and the "private network" box:** Supabase is a hosted service, so the data tier is a logical boundary, not a private network. Confirm we rely on Row Level Security and private buckets (T25).
3. **Map tiles and alerts:** do we keep OpenStreetMap tiles and email/SMS alerts, and if so, accept the limits in T19 and T20?
4. **Backups:** who runs them, and where do they go?
5. **Owners:** confirm who owns each ticket in section 5.

---

## 8. Review

| Version | Date | Author | Reviewed by | Change |
|---|---|---|---|---|
| 0.1 | | Michelle | | First draft |
| 0.2 | | Michelle | | Updated to DFD v0.2 (F1 to F11, I1 to I11, six trust zones) and to the proposal's technology; threats T18 to T25 added |