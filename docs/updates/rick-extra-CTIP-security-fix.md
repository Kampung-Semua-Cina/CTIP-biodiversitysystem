# Branch `rick-extra-CTIP`: confirm screens and account / monitoring fixes

*Written 4 Nov 2026. Web app and database only; the mobile app is not changed.*

Every critical change or delete on the website now asks "are you sure?" before it goes
through. The most serious ones also make the person **type a word** before the Confirm
button turns on, so they cannot be done by a stray click.

**Affects the team:** one database migration (see [Before this goes live](#before-this-goes-live)).
No API or contract change. Nothing here is committed yet.

## Before this goes live

- [ ] Tell Amberlyn, then dry-run and push `supabase/migrations/20261104000000_profile_self_edit.sql`:
      `npx supabase db push --remote --dry-run`, then without `--dry-run`. Without `--remote`
      the CLI targets a local Docker stack and fails with `ECONNREFUSED 127.0.0.1:54322`.
- [ ] After the push, check `profiles` has `username`, `phone` and `avatar_url`, then save a username on the Account page.
- [ ] **Decide:** turn off "Confirm email" in Supabase, or set up custom SMTP (see [fix 3](#3-confirm-your-email-address-first)).

## What asks for a typed word

| Action | Where | Word |
|---|---|---|
| Change your own password | Account | `CHANGE` |
| Make a species public | Species page toggle; Review "Publish species"; "Publish in the public catalogue" when creating a species | `PUBLISH` |
| Approve & publish a record | Review queue, plant page, visit cards | `PUBLISH` |
| Show a plant's exact location to the public (un-tick "hide location") | Plant page | `REVEAL` |
| Change a user's role | Admin → Users | `CHANGE` |
| Turn a user's account off | Admin → Users | `DEACTIVATE` |
| Create a user with a temporary password | Admin → Users | `CREATE` |

The word is not case-sensitive.

## What asks for a plain Confirm

- Unpublish a species
- Return a record for changes, or reject it
- Retire a QR tag
- Remove your profile photo
- Resolve an alert
- Save sensor alert limits
- Invite a user by email (no password)
- Turn a user's account back on

Already had a confirm screen, left as is: delete a species, delete a QR tag.

## Not covered

- **Login password flows** (forgot password, reset-link page, first-login "Set a new password"). The person is already mid-flow.
- **Photo-editor removals.** They only take effect on Save.
- **Mobile app.**

## How it works

- `ConfirmDialog` in `apps/web/src/components/Bits.jsx` is the popup. Passing `word` makes it ask for typing.
- `apps/web/src/useConfirm.jsx` is a hook: `if (!(await ask({ title, body, word }))) return;`. Add it to any new risky button.
- `apps/web/src/decisionPrompt.jsx` holds the wording for approve / return / reject.
- Pages changed: Account, Admin (Users), Species, SpeciesForm, Review, Specimen, Tags, SensorOverview.

## Rule: new password cannot match the old one

This was already in place, checked at three levels:

| Level | Where | Behaviour |
|---|---|---|
| Web and mobile app | `changeMyPassword` in `apps/shared/StoreProvider.js` | Blocks it before calling the API |
| API | `POST /me/password` in `services/api/src/session.js` | 422 `SAME_PASSWORD` when `current_password` equals `new_password` |
| Supabase | Same route | Supabase's own `same_password` error is mapped to the same 422 |

The reset-link and first-login screens send no current password, so only the Supabase
check covers them.

Small fix made with this work: the Account page now runs the same-password check
**before** the confirm popup, so nobody types `CHANGE` only to be told it is the same.

## Fixes

### 1. `column profiles.username does not exist`

**Cause:** the API (`PATCH /me`, `POST /profiles` in `services/api/src/staff.js`) reads and
writes `username`, `phone` and `avatar_url`, but no migration ever created those columns.
A second problem was hiding behind it: only admins had an update policy on `profiles`, so a
botanist or officer saving their own profile changed 0 rows and got "Your profile cannot be changed".

**Fix:** new migration `supabase/migrations/20261104000000_profile_self_edit.sql`:

| Part | What it does |
|---|---|
| Columns | Adds `username`, `phone`, `avatar_url` to `profiles` |
| Username rule | Check constraint `^[a-z0-9._]{3,20}$` (same as the API) and a unique index on `lower(username)` |
| Policy `profiles: update own` | A signed-in person may update their own row |
| Trigger `guard_profile_self_edit` | Non-admins cannot change their own `role`, `is_active`, `email` or `id` (error `42501`). Admins and the service role are not affected. |

The file is safe to run twice (`if not exists`, `drop ... if exists`). Not yet run against any database.

### 2. "Request body is too large" (profile photo)

**Cause:** the photo was sent as a full-size data URL. The API uses `express.json()` with its
default 100 KB body limit, so most phone photos were refused with 413.

**Fix:** the browser now prepares the photo before sending it (`apps/web/src/avatarImage.js`,
used by `apps/web/src/pages/Account.jsx`):

1. Turns the photo upright using the phone's rotation data.
2. Crops the largest centred square.
3. Shrinks it to 256 × 256 in halving steps, so it stays sharp.
4. Saves it as JPEG on a white background (a see-through PNG would otherwise turn black),
   lowering the quality until it is under 60 KB.

A 12 MB camera photo becomes about 15–30 KB. The old 2 MB pick limit is gone; files over
25 MB are refused before they are read. The button shows "Processing…" while it works.

### 3. "Confirm your email address first"

**Not a code bug, so no code change.** This is Supabase's own check (`email_not_confirmed`,
mapped in `services/api/src/session.js`).

- **Why no email arrived:** with "Confirm email" turned on, Supabase's built-in email sender
  only delivers to the project's team members and only a few per hour. Other addresses never get the link.
- **Why the second account worked:** an invite without a password sends a password-reset
  email, and opening that link also confirms the address. An account made with a temporary
  password gets no email it can open, so it stays unconfirmed. (Best guess; the dashboard was not checked.)
- **Options:**
  - Turn off "Confirm email" (Authentication → Providers → Email). Local `supabase/config.toml`
    already has `enable_confirmations = false`, and only admins create accounts here.
  - Confirm one account by hand (Authentication → Users).
  - Set up custom SMTP so confirmation emails reach everyone.

### 4. `/#/monitoring` crashed

**Cause:** a sensor node with no plant attached (or a plant this role cannot see) made
`plantView()` return `null`, and the page read `.name` from it:
`TypeError: Cannot read properties of null (reading 'name')`. An alert with no node or no
`reading` would have crashed the same way.

**Fix** in `apps/web/src/pages/SensorOverview.jsx`:

- A node without a plant shows "No plant assigned".
- An alert without a node shows "Unknown node"; a missing reading shows nothing instead of crashing.
- A node that never reported shows "No data yet" / "Waiting for the first reading" instead of an empty date.

Reproduced with test data only, not the live database.

## Tests

- Lint and `vite build` pass.
- `live-review-map.spec.js` passes (18/18) after two tests were updated to go through the new dialogs (approve, and create-and-publish a species).
- `role-pages.spec.js` has 5 failures per project. They fail the same way without these changes.
- New `monitoring-page.spec.js`: opens monitoring with a node that has no plant and an alert with no node or reading. Passes.
- New `avatar-image.spec.js`: a 4000 × 2500 image becomes a 256 × 256 JPEG under 100 KB with the right crop. Passes.
- `tests/helpers/mockApi.js` now accepts `state.sensorNodes` and `state.alerts`, so tests can send sensor data.
- The migration has not been run against any database yet.
