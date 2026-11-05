# Supabase direct tests (VA-30 to VA-35)

- Date: 29 Oct 2026. Tester: Michelle
- Target: **local** Supabase (`npx supabase start`), API URL `http://127.0.0.1:54321`. Never the hosted project
- Commit tested: `main` at `e16ceee` (29 Oct, "CTIP-28: stop the species page re-fetching in a loop (#27)")
- Key used: the local publishable key (the same kind that ships in the apps)
- Test accounts, all `@test.local`, password `Test-Pass-2026!`: `botanist-a`, `botanist-b`, `officer`, `admin`, `deactivated` (signed up through the API, then roles set in Studio), `unapproved` (signed up through the API like a stranger, never approved)
- Data: fake species and made-up coordinates only (species `1111…` published, `2222…` unpublished, `3333…` Endangered and published; specimens `TEST-0001` on the Endangered species by botanist A and `TEST-0002` by botanist B; one observation each)
- Hosted project: looked at **read-only** in the dashboard on 29 Oct (settings pages and `select` queries only, nothing changed, no test traffic). Screenshots H1 to H7
- Raw output: `docs/testing/supabase/supabase-results.txt`, the CSVs and screenshots listed below (keys and tokens covered)

## Results

| Test | What was checked | Expected (pass) | Result | Evidence | Finding |
|---|---|---|---|---|---|
| VA-35 | RLS switched on for every table | All `true` | **Pass**. All 16 tables `true` | D3-rls-tables.csv | |
| VA-35 | Policies giving `anon` or `true` access | Only published species and media | **Fail**. `specimens` read is `true` for any logged-in user. Insert on `specimens` and `observations` only checks "it's your own row", not the role. `qr_tags` read is `true` for any logged-in user | D4-table-policies.csv | F-08 |
| VA-35 | `observation-photos` bucket is private | `public = false` | **Pass**. `observation-photos` and `sensor-images` private, `species-media` public | D5-buckets.csv, D5-storage-policies.csv | |
| VA-35 | New accounts get no role until approved | No role, or inactive | **Fail**. `profiles.role` defaults to `botanist` and `is_active` to `true`. All 5 new sign-ups were active botanists | D5c-columns.csv, D2-signup-roles.csv | F-08 |
| VA-35 | No secret or service-role key in the web build | Both `False` | **Pass**. No match in any file of `dist`. The web app only has `VITE_API_URL` (it talks to the API, not Supabase) | D6-web-build-secrets.png, D6b-web-build-check.png | |
| VA-35 | Hosted dashboard admins | Few admins, with MFA | **Fail**. All 7 team members are **Owner** and none has MFA turned on | H6-hosted-team.png (emails blanked) | F-11 |
| VA-35 | Backup decision written down, export before demo | Decision written down, export planned | Waiting for Albian | Albian's answers | |
| VA-30 | Anon can read | Only published species and media | **Pass**. Species 2 rows (the 2 published), every other table 0. The unpublished species stays hidden | D7-va30-anon-read.png | |
| VA-30 | Anon can insert or delete | All refused, 0 rows deleted | **Pass**. Every insert 401, every delete 0 rows (`qr_tags` redone by `qr_id`: 0 rows) | D8-va30-anon-write.png, D8b-va30-qrtags.png | |
| VA-31 | Unapproved user's role | No role | **Fail**. Token says `user_role=botanist` straight after sign-up | D9-va31-read.png | F-08 |
| VA-31 | Unapproved user reads specimens, observations, profiles | No coordinates, only own profile | **Fail** for specimens: both plants with exact `lat`/`lng`, including `TEST-0001` on the Endangered species. Pass for observations (0) and profiles (1, own) | D9-va31-read.png, D9b-va31-locations.png | F-08 |
| VA-31 | Unapproved user inserts | Refused | **Fail**. New specimen 201, new observation on botanist A's plant 201 | D10-va31-insert.png | F-08 |
| VA-31 | Botanist A (comparison) | Own records only | **Pass**. Observations 1 (own). Specimens 3 (includes the stranger's new one) | D11-va31-botanistA.png | |
| VA-32 | Botanist A uploads to own record's folder | Allowed | **Pass**. 200 | D12-va32-photos.png | |
| VA-32 | Anon, unapproved and botanist B list or download it | Refused | **Pass**. 0 files listed, download 400 | D12-va32-photos.png | |
| VA-32 | Botanist A and officer download it | Allowed | **Pass**. 1 file, download 200 | D12-va32-photos.png | |
| VA-32 | Public link to the private photo | Refused | **Pass**. 400 for everyone | D12-va32-photos.png | |
| VA-32 | Botanist B uploads into botanist A's record | Refused | **Pass**. 400 (row-level security) | D12b-va32-upload-other.png | |
| VA-33 | Auth settings in `supabase/config.toml` | Strong rules, email confirmation on | **Fail**. See config values below | D13-va33-config.png | F-09 |
| VA-33 | Weak passwords (`1`, `123456`, `password`) | Refused | **Fail**. `1` refused (422), `123456` and `password` accepted (200) | D14-va33-weak-pw.png | F-09 |
| VA-33 | Login before email is verified | Refused | **Fail**. `unapproved` logged in straight after sign-up. Mailpit received no confirmation emails | D9-va31-read.png, D15-va33-mailpit.png | F-09 |
| VA-33 | Hosted project: sign-up, confirm email, password rules (read-only look in the dashboard) | Recorded | Sign-up **ON**, Confirm email **ON**, minimum password length **6**, no password requirements, secure password change **OFF**. Email uses Supabase's built-in sender (no custom SMTP), which only delivers to team members, so a stranger cannot confirm a sign-up today | H1-hosted-signup.png, H2-hosted-email-password.png, H7-hosted-smtp.png | F-08, F-09 |
| VA-35 | Hosted project has the same rules as the repo (read-only SQL) | Recorded | Same: `specimens: read` is `true`, inserts check only own row, `profiles` defaults `botanist` / `true` | H4-hosted-policies.csv, H5-hosted-profile-defaults.csv | F-08 |
| VA-34 | Hosted token settings | Recorded | Access token expiry 3600 s; refresh token reuse detection ON (good) | H3-hosted-jwt-legacy.png, H3b-hosted-sessions.png | F-10 |
| VA-33 | Sign-up with `role: admin` in metadata | Role ignored | **Pass**. Token says `user_role=botanist` | D19-va33-role-metadata.png | |
| VA-33 | Reset for known vs unknown email | Same response | **Pass**. Both `200 {}` | D20-va33-reset.png | |
| VA-33 | Reset email contains plant data or coordinates | None | **Pass**. Only a reset link | D21-va33-reset-email.png | |
| VA-34 | Old token after logout | Refused, or time recorded | **Fail (Low)**. Logout 204, but the old token still read data (200, 1 row). It works until it expires (`jwt_expiry` = 3600 s, so up to 1 hour) | D16-va34-logout.png | F-10 |
| VA-34 | Deactivated account | Cannot log in, or sees nothing | **Fail**. Logged in (200), read all 3 specimens with coordinates, added a specimen (201) | D17-va34-deactivated.png | F-08 |
| VA-34 | Old token after role change | New role applies | **Pass**. Officer saw 3 observations, after being changed to botanist the same token saw 0 | D18-va34-role-change.png | |

Config values recorded from `supabase/config.toml` (local copy; the hosted project's settings are asked from Amberlyn): `enable_signup` = true, email `enable_signup` = true, `enable_confirmations` = false, `minimum_password_length` = 6, `password_requirements` = "" (none), `secure_password_change` = false, `enable_anonymous_sign_ins` = false, `sign_in_sign_ups` = 30 (per 5 minutes per IP), `jwt_expiry` = 3600.

Good things seen: every table has RLS on; a stranger with no login sees only published species; the private photo bucket works exactly as planned; a role change takes effect on the next request because the policies read the role from the database (`my_role()`), not from the token.

## Findings

### F-08: Anyone who signs up becomes an active botanist and can read exact plant locations

| Field | Value |
|---|---|
| Test case | VA-31, VA-34, VA-35 |
| Threat (CTIP-18) | T2 (a user gains a role they should not have), T13 (endangered plant locations leak) |
| OWASP | A01 Broken Access Control |
| Component | Supabase (profile defaults, RLS on `specimens` and `observations`), Auth sign-up |
| Commit | `main` `e16ceee`, local stack |
| Severity | Likelihood 2 × Impact 3 = **6 (High)**. The hosted project has the same rules and defaults, and sign-up is on. Today a stranger is stopped only because the built-in email sender does not deliver the confirmation email to outsiders; once custom SMTP is set up for real users, this becomes 9 (Critical) |
| Owner | Albian (RLS and profile defaults), Amberlyn (sign-up settings) |
| Ticket | New Bug, linked to CTIP-50 |
| Status | Open. Reported 29 Oct 2026 |

**What happens:** a new account is created with `role = botanist` and `is_active = true` by default, so nobody has to approve it. With that account, a stranger can read every specimen with its exact GPS position, including plants of Endangered species, and can add new specimens and add records on other botanists' plants. A deactivated account can still log in and do the same, because these policies don't check the role or whether the account is active.

**Steps to reproduce (local stack only):**
1. Sign up `unapproved@test.local` through `/auth/v1/signup`. HTTP 200, and login works at once.
2. Decode the token: `user_role=botanist`.
3. `GET /rest/v1/specimens?select=qr_id,lat,lng`: both plants returned with coordinates, including `TEST-0001` (Endangered species).
4. `POST /rest/v1/specimens` with `registered_by` = own id: 201. `POST /rest/v1/observations` on botanist A's specimen: 201.
5. Log in as `deactivated@test.local` (`is_active = false`): login 200, 3 specimens readable, new specimen 201.

**Evidence:** D2-signup-roles.csv, D4-table-policies.csv, D5c-columns.csv, D9, D9b, D10, D17. Hosted (read-only): H1, H4-hosted-policies.csv, H5-hosted-profile-defaults.csv, H7.

**Why it matters here:** the project's main promise is that exact locations of endangered plants are only shown to approved staff. Right now anyone who signs up can download them, and can fill the database with fake plants and records that officers would then have to review. Deactivating a staff member does not stop them either.

**Recommendation:** make new accounts inactive, or give them no role, until an admin approves them. Make the `specimens` read policy and the `specimens`/`observations` insert policies check `my_role()` (which already checks `is_active`). Consider turning off public sign-up and using admin invites only. Also block or sign out deactivated users in Auth.

**Re-test (CTIP-74):** a fresh sign-up has no access (0 specimens, inserts refused); the deactivated account sees nothing and cannot insert; botanists and officers still work.

### F-09: Weak passwords are accepted and email is never confirmed

| Field | Value |
|---|---|
| Test case | VA-33 |
| OWASP | A07 Identification and Authentication Failures |
| Component | Supabase Auth settings (`supabase/config.toml`, and the hosted project's settings) |
| Severity | Likelihood 2 × Impact 2 = **4 (Medium)** |
| Owner | Amberlyn |
| Ticket | New Bug, linked to CTIP-50 |
| Status | Open. Reported 29 Oct 2026. Same on the hosted project (H2): length 6, no requirements, secure password change off; Confirm email is ON there |

**What happens:** passwords only need 6 characters with no other rules, so `123456` and `password` are accepted (local test; the hosted project has the same setting). In the repo config, email confirmation is off, so an account works straight away with any made-up email. Changing the password does not ask for the old one again (`secure_password_change = false`).

**Evidence:** D13-va33-config.png, D14-va33-weak-pw.png, D15-va33-mailpit.png (empty inbox).

**Why it matters here:** staff accounts (officers and admins) can be protected by passwords that are guessed in seconds, and a guessed admin password gives full control. With no email check, fake accounts are free to make, which makes F-08 easier to abuse.

**Recommendation:** raise the minimum length (for example 10) and require a mix of characters; turn on email confirmation; turn on secure password change. Apply the same settings on the hosted project, not only in `config.toml`.

**Re-test (CTIP-74):** `123456` and `password` refused; a new sign-up cannot log in until the email link is clicked.

### F-10: A token still works for up to an hour after logout

| Field | Value |
|---|---|
| Test case | VA-34 |
| OWASP | A07 Identification and Authentication Failures |
| Component | Supabase Auth (`jwt_expiry`) |
| Severity | Likelihood 1 × Impact 2 = **2 (Low)** |
| Owner | Amberlyn |
| Ticket | New Bug, linked to CTIP-50 |
| Status | Open. Reported 29 Oct 2026 |

**What happens:** after botanist B logged out (204), the same access token still read data (200). Supabase tokens are checked by signature and expiry only, so a copied token keeps working until it expires, which is 1 hour here.

**Evidence:** D16-va34-logout.png.

**Why it matters here:** if a token is copied from a shared or lost phone, logging out does not stop it straight away. The risk is small because someone first has to steal the token.

**Recommendation:** shorten `jwt_expiry` (for example 15 minutes; the app refreshes tokens on its own), and sign users out of all sessions when they are deactivated.

**Re-test (CTIP-74):** `jwt_expiry` shortened; the old token is refused after that time.

### F-11: All 7 team members are Owners of the Supabase project, with no MFA

| Field | Value |
|---|---|
| Test case | VA-35 (dashboard admins) |
| OWASP | A07 Identification and Authentication Failures, A05 Security Misconfiguration |
| Component | Supabase organisation (hosted) |
| Severity | Likelihood 2 × Impact 3 = **6 (High)** |
| Owner | Albian |
| Ticket | New Bug, linked to CTIP-50 |
| Status | Open. Reported 29 Oct 2026 |

**What happens:** the Team page lists 7 members and every one has the **Owner** role. The MFA column shows a cross for all 7, so nobody uses two-factor login. Most accounts are personal email addresses.

**Evidence:** H6-hosted-team.png (emails blanked out).

**Why it matters here:** an Owner can read and change every table, see the secret keys, change Auth settings and delete the whole project. If any one of the 7 email accounts is phished or reuses a leaked password, the attacker gets all of that, including every endangered plant location. With 7 Owners, one mistake by anyone (for example deleting a table) also affects the real data, and there are no backups.

**Recommendation:** keep 1 or 2 Owners; give the others Developer or Read-only; turn on MFA for every member.

**Re-test (CTIP-74):** Team page shows at most 2 Owners and MFA on for all members.

## Observations (not findings)

- **Legacy keys still active on the hosted project.** JWT Keys → Legacy JWT Secret says it is "still used", which means the old `anon` and `service_role` JWT API keys still work next to the new publishable and secret keys. `service_role` can do everything the `sb_secret_` key in F-06 can. There is no sign they leaked, but they are no longer needed by the apps and could be turned off (owner Albian). Evidence: H3-hosted-jwt-legacy.png.
- **Built-in email sender on the hosted project.** It only delivers to team members and has a low hourly limit, so real field staff would not get confirmation or reset emails. This is a functional point, but it is also what currently stops F-08 being abused by strangers. Evidence: H7-hosted-smtp.png.
