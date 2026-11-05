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

---

# Since the last commit (`175c2d5`): discussion board and faster live updates

*Written 4 Nov 2026. Web app, mobile app (polling only), API, contract and two database
migrations. Committed in `ca507a4`.*

Two pieces of work:

1. **`#/discussion` is now a discussion board** that works like email: choose who a
   thread goes to (people and/or whole user groups), make it private or public, and
   @mention people.
2. **Live updates fetch only what changed and slow down when the database is busy.**
   This fixes the "Cannot reach the API server" notice that kept coming and going. The
   full design is in [docs/architecture/live-updates.md](../architecture/live-updates.md).

## Before this goes live

- [ ] Tell Amberlyn, then dry-run and push both migrations if not done yet:
      `npx supabase db push --dry-run` should list only the files below that are not applied yet, then
      `npx supabase db push`.
  - `20261104120000_discussion_board.sql`
  - `20261105000000_table_versions.sql`
- [ ] **Two approvals on the PR:** `packages/api-contract/openapi.yaml` changed (team rule).
- [ ] Redeploy the API on Render after merging. Until then the live site has no
      discussion routes (`No such endpoint`) and still does full loads every 5 s.
- [ ] Update CLAUDE.md: the API now has **77 routes** (was 71), 6 more built, and the
      contract has the new paths.

## 1. Discussion board

### What people can do

| Feature | How it works |
|---|---|
| **Start a thread** | Title, who can read it, who it goes to, first message. Optionally linked to a field record. |
| **Send to user groups** | Buttons for *All botanists*, *All conservation officers* and *All administrators*, each showing how many people it covers |
| **Send to single people** | Search by name or username, shown as removable chips. Groups and people can be mixed. |
| **Private** | Only the owner and the people and groups it was sent to can read and reply. It must go to at least one person or group. |
| **Public** | Every signed-in staff member can read and reply. The people and groups chosen are the ones notified. |
| **@mentions** | Typing `@` suggests names; the picked person is notified. Only people who can read the thread can be tagged. |
| **Owner controls** | "Sharing" changes public/private and the recipients; only newly added people are notified. The owner or an admin can delete a thread (with a confirm screen). |
| **Inbox filters** | All, Sent to me, Started by me, Public, Record comments, plus search. Threads with unread notifications are marked **New**. |
| **Notifications** | `discussion_shared`, `discussion_post` and `discussion_mention`. Clicking one opens the thread; opening a thread marks its notifications read. |

The old per-record comments (`observation_comments`) are unchanged. They are listed under
"Record comments", old `#/discussion/<observation id>` links still open them, and the
plant page has a new "Start a discussion" button.

### Who can see what (enforced in the database)

Migration `20261104120000_discussion_board.sql`:

| Part | What it does |
|---|---|
| Tables | `discussions` (owner, title, `public`/`private`, optional observation), `discussion_audience` (one row per person **or** role group), `discussion_posts` (body, `mentions uuid[]`) |
| `can_see_discussion(id)` | True for the owner, anyone on a public thread, a person on the audience, or anyone whose role is on the audience. Deactivated accounts get nothing. |
| RLS | Read: `can_see_discussion`. Create: yourself as owner, and a linked record must be one you can see. Change sharing: owner only. Delete: owner or admin. Reply: anyone who can read it. Posts cannot be edited or deleted one by one. |
| `discussion_directory()` | Botanists cannot read other profiles, so this lists active accounts with **only** id, name, username and role (no email or phone) for sharing and @mentions |
| `create_discussion()`, `update_discussion()` | Create a thread with its audience and first post, or change its sharing, in one transaction. They run as the caller, so RLS still applies. |
| Notification triggers | Mentions are only sent to people who can read the thread. A private thread never notifies outsiders. A failed notification never blocks a post. |

`user_can_see_discussion()` (checking for someone else) cannot be called through the API
or `/rest/v1/rpc`; only the notification trigger uses it.

### API

| Route | Who | Notes |
|---|---|---|
| `POST /v1/discussions` | any staff | Optional client-made `id`: sending it again returns the same thread (200), never a second one |
| `GET /v1/discussions/:id` | any staff | Thread with audience and posts. **404** when you cannot read it (never 403, so nothing leaks) |
| `PATCH /v1/discussions/:id` | owner | Title, visibility, `share_users`, `share_roles`. Others get 403 `NOT_OWNER`. |
| `DELETE /v1/discussions/:id` | owner or admin | Posts and audience go with it |
| `POST /v1/discussions/:id/posts` | anyone who can read it | Optional client-made `id`, as above |

Code: `services/api/src/discussions.js`. The workspace load also returns `discussions`,
`discussion_audience`, `discussion_posts` and `directory`.

## 2. Faster live updates

Summary only; see [docs/architecture/live-updates.md](../architecture/live-updates.md).

| Change | Where |
|---|---|
| Per-table change counters | `supabase/migrations/20261105000000_table_versions.sql` |
| `GET /v1/workspace?cursor=` sends only what changed, or `unchanged: true` | `services/api/src/staff.js` |
| The API measures how busy the database is and sends `poll_after_ms` (5 to 60 s) | `services/api/src/dbLoad.js`, `services/api/src/supabase.js` |
| `GET /v1/health`: no database call | `services/api/src/handlers.js` |
| Store merges partial answers, waits as the API says, "API down" after 2 misses | `apps/shared/StoreProvider.js`, `apps/shared/api.js` |
| Web and mobile pollers use the new delay | `apps/web/src/useLiveUpdates.js`, `apps/mobile/hooks/usePolling.js` |
| Removed the separate 30 s notifications poll and 30 s open-thread poll | `apps/shared/StoreProvider.js`, `apps/web/src/pages/Discussion.jsx` |

## 3. Bugs fixed

| Bug | Cause | Fix |
|---|---|---|
| "Cannot reach the API server" came and went while the API was up | The health check was a database query with a 3 s limit, and the apps' polling kept the shared database busy | See section 2 |
| Mobile app polled again straight after every store update | `usePolling` restarted its effect whenever the store changed, and the effect polls on start | Functions kept in a ref; the timer restarts only when the screen, sign-in or foreground state changes |
| Staff saw broken field photos after signing in (for up to 12 hours) | The photo-link cache (`keepPhotoUrl` in `apps/shared/utils.js`) kept the first link it saw for each photo. The login page loads the visitor data first, whose field-photo links do not work (see [section 7](#7-found-in-the-page-check-not-fixed)), so the working signed link was ignored | Only a link to the same address is kept; a different kind of link replaces it at once. New test in `apps/shared/test/reports-book.test.js` |
| "Add a person by name" dropdown would not close after picking someone | The picked name disappeared while it had focus, so the browser never reported focus leaving | Closes on any click outside the box; focus returns to the search box after a pick |

## 4. Files

| Area | Files |
|---|---|
| Database | `supabase/migrations/20261104120000_discussion_board.sql`, `supabase/migrations/20261105000000_table_versions.sql` (new) |
| API | `src/discussions.js`, `src/dbLoad.js` (new); `src/staff.js`, `src/handlers.js`, `src/permissions.js`, `src/supabase.js` |
| Contract | `packages/api-contract/openapi.yaml`: `/health`, `/discussions`, `/discussions/{id}`, `/discussions/{id}/posts`; the workspace `cursor` parameter and new fields; new notification types; `Discussion`, `DiscussionPost`, `DbLoad` schemas |
| Shared | `apps/shared/StoreProvider.js`, `apps/shared/api.js`, `apps/shared/data.js` |
| Web | `src/pages/Discussion.jsx` (rewritten), `src/pages/AlertsNotice.jsx`, `src/pages/Specimen.jsx`, `src/useLiveUpdates.js`, `src/App.css` |
| Mobile | `hooks/usePolling.js` |
| Tests | `services/api/test/discussions.test.js`, `services/api/test/dbLoad.test.js` (new); `services/api/test/field-and-staff.test.js` |

## 5. Tests

- API: **153/153 pass** (`npm run api:test`), including 24 new:
  - `discussions.test.js` (10): private/public reading, recipient checks, retry safety, owner-only sharing, admin delete, 404 for outsiders
  - `dbLoad.test.js` (6): the adaptive poll rate
  - 8 in `field-and-staff.test.js`: change-only workspace loads and `/health`
- Shared: 56/56 pass. Web lint and `vite build` pass. Mobile bundle builds (`expo export`).
- Contract lints with no errors (`npx @redocly/cli lint`). There are 37 warnings, one more than before: `/health` has no 4xx response.
- Measured live with 4 simulated tabs: a poll when nothing changed takes about 0.2 s and
  589 bytes, against 3.3 s and 140 KB for a full load (table in the architecture page, §4.3).
- Shared tests: 57/57 after the photo-cache fix.
- **Page check:** every page and link opened in a browser for visitor, botanist, officer
  and admin (130 page visits, 4 external links). No crashes, missing pages, wrongly
  blocked or wrongly allowed pages, stuck pages or failed API calls. Findings in section 7.

## 6. Not done

- **Mobile Discussion screen** still shows only record comments. Tapping a discussion
  notification on the phone does nothing yet.
- No browser (Playwright) test for the discussion board yet.

## 7. Found in the page check, not fixed

| Problem | Where | Cause | Needs |
|---|---|---|---|
| **Field photos never load for visitors** (about 24 photos; home page, plant catalogue, species and plant pages) | `get /public/workspace` in `services/api/src/staff.js` | It builds *public* links into `observation-photos`, but that folder is private by design, so Supabase answers "Bucket not found". Came with the visitor catalogue (#43). | **A decision:** hide field photos from visitors (show species photos only), or let the API hand out short-lived signed links for photos of approved, published plants. The second needs a storage policy for that, and the photos must have their location data removed first (CTIP-110). |
| Two broken photos on tag NIAH-0002 (rejected record, 26 Oct) | Plant page, dashboard | The two `observation_photos` rows hold a temporary browser address (`blob:http://localhost:5173/...`) instead of a file path. They were saved before the apps went through the API. | Delete the two rows (`90939609-…`, `e3101523-…`), with the team's OK, since it is shared data |
| `href="#"` links | Every map | Leaflet's zoom in / zoom out buttons | Nothing; this is how Leaflet works |

---

# Since commit `ca507a4`: deleting users, the email limit and clearer form errors

*Written 5 Nov 2026. Web app (Users page), API, contract and one database migration.
Committed in `7126118`.*

Four pieces of work on the admin **Users** page (`#/users`) and the account emails
behind it, and one change for every page:

1. **Two tables, and delete with 30 days to undo.** Users are split into *Active* and
   *Not active*. A trash icon deletes a user; for 30 days the account can be restored.
2. **Supabase's email limit is reported.** When Supabase refuses to send an email, every
   admin gets a notification saying so and roughly how long to wait.
3. **Bug fix: a failed attempt to create an account no longer uses up the email limit.**
4. **The form says why a value is wrong**, e.g. why `1@gmail.com` cannot be used.
5. **Pop-up messages stay on screen 3 seconds longer** (5.6 s instead of 2.6 s).

## Before this goes live

- [ ] Tell Amberlyn, then dry-run and push `supabase/migrations/20261105120000_user_soft_delete.sql`:
      `npx supabase db push --dry-run` should list only this file, then `npx supabase db push`.
      Until then deleting a user fails (no `deleted_at` column) and no email-limit notification is made.
- [ ] Optional: turn on **pg_cron** (Database > Extensions) *before* pushing, so accounts past
      their 30 days are removed daily. Without it they are removed when an admin opens the app
      (see [How the final removal runs](#how-the-final-removal-runs)).
- [ ] **Two approvals on the PR:** `packages/api-contract/openapi.yaml` changed (team rule).
- [ ] Restart local APIs and redeploy Render after merging.
- [ ] If the project's email limit is ever raised (custom SMTP), set `EMAIL_RATE_LIMIT_PER_HOUR`
      on Render and in `services/api/.env` to match. It is only used to work out the wait.
- [ ] **Decide** about "Confirm email" (Authentication > Providers > Email). While it is on, one
      invitation sends **two** emails (confirmation + invitation), so only one person can be
      invited per hour. See [section 2](#2-supabases-email-limit).
- [ ] After the push, try delete and restore on a throwaway account. They were not run against
      the shared database.
- [ ] Update CLAUDE.md: the API now has **79 routes** (was 77).

## 1. Users page: Active and Not active, delete and restore

### What admins see

| Table | Who is in it | What can be done |
|---|---|---|
| **Active** | Accounts that can sign in | Change role, turn off, delete (trash icon) |
| **Not active** | Turned-off accounts, and deleted ones waiting out their 30 days | Turned off: turn on, or delete. Deleted: **Restore** |

- Search and sort (name, newest, role, email) apply to both tables.
- A deleted account shows a **Deleted** label, the date it will be removed for good, and the
  days left. Deleted accounts are listed first, soonest to be removed at the top.
- Nobody gets a trash icon on their own row.

### Deleting

The trash icon opens a confirm screen that needs **`DELETE`** typed. It explains what happens:

| When | What happens |
|---|---|
| **Straight away** | The account is turned off, so the person cannot sign in or use anything. It moves to *Not active*. |
| **Within 30 days** | An admin can press **Restore**. The account comes back turned **off**; switch it on when the person should sign in again. |
| **After 30 days** | The sign-in account is removed for good. Their **plants, visits, photos and reviews stay**, shown as by a former member. **Discussion threads they started are removed.** |

Field records are safe because every record points to its author with `on delete set null`.
Discussion threads use `on delete cascade` on their owner, so they go with the account.

**Refused**, with the reason:

| Case | Answer |
|---|---|
| Deleting yourself | 422 |
| Deleting the last active admin | 409 `LAST_ADMIN` |
| Deleting an account that is already deleted | 409 `ALREADY_DELETED` |
| Turning on a deleted account without restoring it | 409 `USER_DELETED` |
| Restoring an account that is not deleted | 409 `NOT_DELETED` |
| Anyone but an admin | 403 |

### How the final removal runs

`purge_deleted_users()` removes every account deleted more than 30 days ago. It runs:

- **daily at 03:17**, if pg_cron was turned on when the migration was pushed, and
- whenever an **admin** opens the app or the user list, at most **once an hour** per API.

**Not yet confirmed:** it removes the account from Supabase's own user table (`auth.users`).
Supabase may not allow that from a database function. If it refuses, that account is skipped,
stays turned off for good, and a warning goes to the database log. This will only show after a
real 30-day wait.

### Database (`20261105120000_user_soft_delete.sql`)

| Part | What it does |
|---|---|
| `profiles.deleted_at`, `profiles.deleted_by` | When and by whom the account was deleted |
| Check `profiles_deleted_is_inactive` | A deleted account is always turned off |
| `guard_profile_self_edit()` (updated) | Only admins may set or clear `deleted_at` / `deleted_by` |
| `purge_deleted_users()` | Removes accounts past their 30 days. Admins or a scheduled job only. |
| pg_cron job `purge-deleted-users` | Created only if pg_cron is already on |
| `notify_email_rate_limit()` | Tells every active admin about the email limit (section 2). Admins only. |
| New notification type `email_rate_limit` | |

## 2. Supabase's email limit

### What it is

Supabase Auth sends the account emails: the confirmation when an account is created
("Confirm email" on), the invitation, and password resets. With Supabase's built-in email
sender the **whole project** may send only **2 emails an hour**, whoever asks for them (Render,
anyone's local API, the Supabase dashboard). Over that, Supabase refuses with
`over_email_send_rate_limit` ("email rate limit exceeded") and the email is simply not sent.

Before this change the site hid it: a refused invitation still said "Account created", and a
refused password reset said nothing at all. The limit can only be raised by setting up custom
SMTP (Authentication > SMTP Settings), after which it is changed under Authentication > Rate Limits.

### What happens now

| Where | What the person sees |
|---|---|
| Invite member, invitation refused | The account is created; the admin sees why the invitation was not sent and how long to wait |
| Create account, refused ("Confirm email" on) | 429 `EMAIL_RATE_LIMIT`; the account is not created; the same message |
| **Every active admin** | A notification: *"Email limit reached (2/2 per hour). The invitation to x@y.com was not sent. Supabase allows 2 emails an hour. Try again in about 38 minutes."* At most one every 10 minutes. Clicking it opens `#/users`. |
| Forgot password form | *"The email limit is reached (2/2 per hour). Try again in up to 60 minutes. No reset email was sent."* The limit is for the whole project, so this says nothing about whether an address has an account. |

### How the wait is worked out

Supabase does not say when the next email will be allowed. The API remembers when **it** had
emails sent (`services/api/src/emailLimit.js`) and counts from the oldest one in the last hour.
Emails sent by another copy of the API (Render, someone's laptop) are not known to it, so with
nothing on record the answer is "up to 60 minutes". The limit it assumes is
`EMAIL_RATE_LIMIT_PER_HOUR` (2 by default).

## 3. Bug fixed: failed account creations used up the email limit

**Seen:** two unsuccessful attempts to create an account, and the limit was reached.

**Cause:** the API asked Supabase to create the account first and checked for problems after.
Supabase sends its email the moment it creates an account, so the email was spent even when
the attempt then failed:

- **Address already registered:** with "Confirm email" on, Supabase does not refuse it. It
  hides the existing account behind a made-up user and may resend that person's confirmation.
  The API then treated it as new and also sent an invitation: both of the hour's emails, for an
  attempt that should have failed.
- **Username taken, or the profile could not be saved:** the confirmation email had already
  gone out, and trying again sent another.

**Fix** (`post /profiles` in `services/api/src/staff.js`):

1. Before Supabase is asked, the address and username are checked against every account,
   ignoring upper and lower case. Turned-off and deleted accounts count. A deleted account's
   address answers *"belongs to a deleted account. Restore it from Not active instead."*
2. Supabase's made-up "already registered" user (it has no sign-in identities) is recognised:
   409 `EMAIL_TAKEN`, and no invitation is sent.
3. The invitation is sent only after the account is fully saved. If the profile cannot be saved
   the answer is 502 `PROFILE_NOT_SAVED` with "do not create it again", so a retry does not
   send another email.
4. Only emails sent for a successful creation are counted, so "x/2" and the wait reflect real emails.

## 4. The form says why a value is wrong

The Invite member form checks its fields **before** the confirm screen. A field that cannot be
used is outlined in red with the reason underneath, the cursor moves to the first one, and
nothing is sent, so no email is used. A reason disappears as the field is fixed; the email is
also checked when you leave the field.

| Field | Examples of what it explains |
|---|---|
| Email | No `@` or more than one; spaces; a dot at the start or two in a row; a domain that is not real (`name@localhost`); common typos (*"gmial.com" looks like a typo. Did you mean gmail.com?*); **Gmail's own rule**: `1@gmail.com` → *Gmail addresses have 6 to 30 letters or numbers before the @; "1" has 1.* |
| Temporary password | Fewer than 8 characters (*"it has 3"*); a space at the start or end. Left blank, an invitation is sent instead. |
| Name | Required |

- The rules are in `apps/shared/accountRules.js`. The API checks the same rules in its own copy,
  `services/api/src/accountRules.js`, because the API is deployed without `apps/`. A test fails
  if the two copies differ, so change both together.
- If an address passes these checks and Supabase still refuses it, the answer is 422
  `INVALID_EMAIL` (*"Supabase refused … Check the spelling, or use another address"*). A password
  Supabase finds too weak gives 422 `WEAK_PASSWORD` in plain words (for example, *"it has
  appeared in a known data leak"*). Both show under their field.
- **Everywhere in the app**, a form the API refuses now shows the reasons (*"Gmail addresses
  have…"*) instead of only the field names (*"Request body failed validation (email)"*)
  (`callApi` in `apps/shared/StoreProvider.js`).

## 5. Pop-up messages stay on screen longer

The short message at the bottom of the screen ("User deleted…", "Invitation sent…", the
email limit's wait time) now stays for **5.6 seconds instead of 2.6**. The longer messages
added here could not be read in time.

- One setting, `TOAST_MS` in `apps/shared/StoreProvider.js`, so it applies to the website
  **and** the mobile app.
- A new message still replaces the one on screen straight away, and starts its own 5.6 seconds.
- The web browser tests only wait for a message to appear, so none of them is affected.

## 6. API changes

| Route | Who | Notes |
|---|---|---|
| `DELETE /v1/profiles/:id` | admin | Soft delete; answers the profile and `remove_at` |
| `POST /v1/profiles/:id/restore` | admin | Undo within 30 days; the account stays turned off |
| `POST /v1/profiles` | admin | Checks before Supabase; new answers `USERNAME_TAKEN`, `INVALID_EMAIL`, `WEAK_PASSWORD`, `PROFILE_NOT_SAVED`, 429 `EMAIL_RATE_LIMIT`; `email_limit` in the answer when only the invitation was refused |
| `PATCH /v1/profiles/:id` | admin | 409 `USER_DELETED` when turning on a deleted account |
| `POST /v1/auth/password-reset` | public | 429 `EMAIL_RATE_LIMIT` with the wait |

Contract: both new paths; `deleted_at`, `deleted_by` on `Profile`; new `EmailLimit` schema and
`EmailRateLimit` response; `email_rate_limit` notification type.

## 7. Files

| Area | Files |
|---|---|
| Database | `supabase/migrations/20261105120000_user_soft_delete.sql` (new) |
| API | `src/emailLimit.js`, `src/accountRules.js` (new); `src/staff.js`, `src/session.js`, `src/permissions.js`; `.env.example` (`EMAIL_RATE_LIMIT_PER_HOUR`) |
| Contract | `packages/api-contract/openapi.yaml` |
| Shared | `apps/shared/accountRules.js` (new); `apps/shared/StoreProvider.js` (also the pop-up time), `apps/shared/api.js` |
| Web | `src/pages/Admin.jsx`, `src/pages/AlertsNotice.jsx`, `src/App.css` |
| Tests | `services/api/test/users.test.js`, `services/api/test/accountRules.test.js` (new) |

## 8. Tests

- API: **179/179 pass** (`npm run api:test`), 26 new:
  - `users.test.js` (21): delete and restore, the safeguards, final removal at most hourly,
    the email limit (invitation, account creation, password reset, the wait), a failed
    creation sends no email (address or username in use, deleted account, Supabase's hidden
    user, profile not saved), a successful invitation counts 2 emails, and invalid details
    refused with their reason before Supabase is asked
  - `accountRules.test.js` (5): every email, password and name reason, and that the two copies match
- Shared: 57/57 pass. Web lint and `vite build` pass. The contract lints with no errors.
  Re-run after the pop-up change: shared tests, lint and build still pass.
- **In a browser, as the admin:**
  - The Users page shows both tables with live data (Active 6, Not active 4). The delete
    confirm screen opens with the right wording; it was cancelled, so no account was changed.
  - Invite member with `1@gmail.com`, a 3-character password and no name shows all three
    reasons and sends **no** request to the API. A typo (`gmial.com`) is caught on leaving the field.
- **Not tested:** delete and restore against the shared database (needs the migration), the
  removal after 30 days (needs a real 30-day wait; see the `auth.users` note above), and a
  real email-limit refusal from Supabase (tested with a fake Supabase).

## 9. Known limits

- The wait is an **estimate**: each API only knows the emails it sent itself.
- The Users page reads `deleted_at` from the start-up load; before the migration, nobody shows as deleted.
- A deleted user's notifications, and discussion threads they started, are removed with the
  account after 30 days.
- The mobile app has no Users page, so none of this applies there.

---

# Since commit `7126118`: security fixes (conservation status, files that are not pictures)

*Written 5 Nov 2026. Web app, mobile app (sorting only), shared code and one database
migration. No API or contract change. Committed in `5c8f01e`.*

Two findings from security testing:

1. **"Endangered" with a capital E was not recognised by the website**, so endangered species
   could be shown, counted and edited as if they were not. In the worst case, opening
   **Edit species** and saving turned an endangered species into "Least concern" and made its
   plants' exact locations public. **Severity: high** (threat T13, protecting endangered
   locations). Fixed.
2. **A video renamed to `.jpg`** was refused by the API, but the website showed an empty
   preview box with no reason. **Severity: low.** Fixed.

## Before this goes live

- [ ] Tell Amberlyn, then dry-run and push
      `supabase/migrations/20261105180000_species_status_lower_case.sql`
      (`npx supabase db push --dry-run`, then `npx supabase db push`). The website fix works
      without it; the migration corrects the stored data and keeps it correct.
- [ ] Redeploy the website (Cloudflare Pages) after merging. The API does not change.
- [ ] Build a new APK if the mobile "Endangered first" sort should be fixed on phones.
- [ ] Ask the security testers to retest both findings ([how](#how-to-retest)).

## 1. "Endangered" with a capital E

### What was wrong

| Where | What people saw |
|---|---|
| Officer dashboard | "Endangered species: 0" |
| Plant catalogue | Filter by status and its counts missed the species; "Endangered first" did not put it first |
| Species page (web and mobile) | "Endangered first" did not put it first |
| **Edit species form** | The status list showed **Least concern**. Saving could make the species least concern, after which its plants' exact locations were shown to the public. |
| Map | The page says endangered locations are hidden, but one way of building the map could still put a pin on them (see below) |

### Cause

Some species hold `"Endangered"` or `"Near Threatened"`, saved before the API existed or
typed in by hand. The API (`distribution.js`) and the database functions compare statuses in
any case, so they protected these plants correctly. The website compared them exactly as typed
(`conservation_status === "endangered"`), so a capital letter matched nothing. The Edit form's
list holds only lower-case values: `"Endangered"` matched no option, so the browser showed the
first one, "Least concern".

Live data on 5 Nov 2026: **Nepenthes rajah** (`"Endangered"`, currently in Recently deleted) and
**Shorea leprosula** (`"Near Threatened"`).

### Fix

| Change | Where |
|---|---|
| **Every status is stored in the app in one form** (trimmed, lower case) as it is loaded: the start-up load and live updates, the staff species list, saved species and single species pages | `statusKey()` and `withStatusKey()` in `apps/shared/data.js`, used in `apps/shared/StoreProvider.js` |
| **Every comparison ignores case:** the dashboard count, the catalogue filter and counts, and "Endangered first" sorting now use `isThreatened()` or `statusKey()`. Sorting and the dashboard now also include **critically endangered**, which they missed before. | `apps/shared/selectors.js` (`speciesCatalogue`), `apps/web/src/pages/Catalogue.jsx`, `apps/web/src/pages/Species.jsx`, `apps/mobile/pages/Species.js`, `apps/mobile/pages/Dashboard.js` |
| **The Edit species form never falls back to another status.** It opens on the species' real status. A status it does not know is shown as *"… is not a known status. Choose one"*, and the form will not save until one is chosen. | `apps/web/src/components/SpeciesForm.jsx` |
| **Map: no pin for an endangered plant unless you may see exact locations.** Points from the API's `/distribution` used to be pinned as they came; that includes endangered plants at their reduced (about 1.1 km) location. They now follow the same rule as every other map point (`shownCoords`), and the status is checked in any case. | `apps/web/src/pages/MapPage.jsx` |
| **The stored data:** existing statuses are lower-cased, and a trigger lower-cases every later insert or update, whoever makes it (API, SQL Editor, an old app build) | `supabase/migrations/20261105180000_species_status_lower_case.sql` |

About the map: visitors' maps are built from the visitor data, which already handled the
capital E, and with today's data no stray visitor pin could be reproduced. The `/distribution`
path above is the one that could pin a protected plant, so it was closed as well.

## 2. A video renamed to `.jpg`

### What was wrong

The API reads a file's first bytes and refused the video correctly
(`detectImageType` in `services/api/src/images.js`). The website only checked the type the
browser reports, which comes from the **file name**, so `video.jpg` passed as `image/jpeg`. The
preview could not be drawn, the image component hides images that fail, and an empty box was
left with no message.

### Fix

Every picture picker on the website now reads the file's first bytes, the same test as the API,
before showing a preview (`sniffFileKind()` and `photoFileProblem()` in `apps/shared/utils.js`):

| Picker | Where |
|---|---|
| Add plant photos | `apps/web/src/pages/AddPlant.jsx` |
| Photo editor (arrange photos) | `apps/web/src/components/PhotoEditor.jsx` |
| Scan a QR from an image (Add plant and Scan) | `apps/web/src/pages/AddPlant.jsx`, `apps/web/src/pages/Scan.jsx` |

| File | Message |
|---|---|
| A video (MP4, MOV, WebM, AVI) | *"field-video.jpg is a video, not a picture. Choose a JPG, PNG or WebP photo."* |
| An iPhone HEIC photo | *"… is an iPhone HEIC photo. Save it as JPG first."* |
| Anything else that is not a JPG, PNG or WebP | *"… is not a picture, whatever its name says. Choose a JPG, PNG or WebP photo."* |

Good files picked at the same time are still added. On Add plant's QR picker this also stops a
non-picture from falling through to the "next unused tag" fallback (the known S6 leftover).

The API check is unchanged and still the real guard; this only gives the person the reason.

## How to retest

**Finding 1**, as an officer:

1. In the SQL Editor (test only), set one species to `'Endangered'` with a capital E. After
   the migration the trigger lower-cases it at once, which is itself the first check: reading
   it back shows `endangered`.
2. To test the website alone, without the migration: the dashboard's "Endangered species" count
   includes its plants, the catalogue's Endangered filter lists it, and Edit species shows
   **Endangered**, not Least concern.
3. Sign out: the visitor map shows no pin for its plants, and the note under the map counts them
   as not shown.

**Finding 2:** rename any `.mp4` to `.jpg` and choose it under Add plant → Add photos, or in the
photo editor. Expect the "is a video" message and no empty box. Choose it together with a real
photo: only the real photo is added.

## Files

| Area | Files |
|---|---|
| Database | `supabase/migrations/20261105180000_species_status_lower_case.sql` (new) |
| Shared | `apps/shared/data.js`, `apps/shared/selectors.js`, `apps/shared/StoreProvider.js`, `apps/shared/utils.js`; `apps/shared/test/status-and-photos.test.js` (new) |
| Web | `src/components/SpeciesForm.jsx`, `src/components/PhotoEditor.jsx`, `src/pages/Catalogue.jsx`, `src/pages/Species.jsx`, `src/pages/MapPage.jsx`, `src/pages/AddPlant.jsx`, `src/pages/Scan.jsx` |
| Mobile | `pages/Species.js`, `pages/Dashboard.js` (sorting only) |

## Tests

- Shared: **62/62 pass**, 5 new in `status-and-photos.test.js`:
  - statuses put in one form
  - a capitalised Endangered or CRITICALLY ENDANGERED species counts as endangered
  - visitors get no pin for an endangered point
  - files recognised by their first bytes (JPG, PNG, WebP, MP4, HEIC, WebM, PDF)
  - a renamed video or PDF refused with its reason, while a real JPG passes
- API: 179/179 pass (unchanged). Web lint and `vite build` pass. Mobile bundle builds (`expo export`).
- **In a browser, nothing saved:**
  - The officer dashboard counts **8** endangered plants.
  - Edit species on a species capitalised to `"Endangered"` shows **Endangered**. The
    capitals were added in the test browser only, because the one live capitalised endangered
    species is in Recently deleted.
  - The visitor map with **every** status capitalised still shows only 3 pins and *"5
    endangered plants are not shown on the map"*.
  - Add plant with a renamed MP4 and a real JPG shows the "is a video" message and adds only
    the JPG.
- **Not tested:** the migration against the database (not pushed yet).

## Not covered

- **Mobile photo pickers** were not changed. Every one asks the phone for pictures only
  (`mediaTypes: ['images']` in `apps/mobile/pages/AddPlant.js` and `pages/Scan.js`), and the API
  refuses anything else.

---

# Since commit `5c8f01e`: IoT monitoring access (sensor nodes admin only, alerts for officers and admins)

*Written 5 Nov 2026, corrected later that day. API permissions, contract and database
migrations. Nothing below is committed yet.*

The team's role table (Nicole): **only adding, editing or deleting sensor nodes is admin only.
Officers see the nodes, and officers and admins do everything with alerts** (CTIP-78:
officers acknowledge and resolve). Admin-only node editing matches Michelle's CTIP-48 change
on main (#54).

| | Botanist | Officer | Admin |
|---|---|---|---|
| See nodes, live readings, history and webcam images | No | Yes | Yes |
| See alerts and get a notification when one is raised | No | Yes | Yes |
| Assign, acknowledge, add notes to and resolve alerts | No | Yes | Yes |
| Change a node's alert limits (thresholds) | No | No | Yes |
| Register, edit and deactivate nodes; manage device keys | No | No | Yes |

- **Botanists get no access** because each node sits next to an endangered plant, so its
  position gives away the plant's exact spot.
- **Officers handle alerts** because they are the people who act on a disturbance.
- **Only admins manage devices:** CTIP-48, CLAUDE.md (IoT node registration under the System
  Administrator), and least privilege.

## What went wrong, and the fix

`20261105210000_alerts_admin_write.sql` made alerts **read-only for officers**, based on a
misreading of "Officer can READ" (it applies to sensor nodes, not alerts). It was pushed to
the live database before the branch was merged, while the live API and website (from main)
still let officers act on alerts. **Result on the live site: officers got an error when they
acknowledged, resolved, assigned or added a note to an alert.**

Also, 7 migrations of this branch (`20261104000000` to `20261105210000`) were live but not on
main, so nobody working from main could run `db push`, and the "Supabase Preview" check
failed. Merging this branch (PR #56) fixes that.

The fix, **`20261105220000_alerts_officer_admin_write.sql`** (written by the team):

- Gives officers alert and alert-note writes back (`alerts: staff write`,
  `alert notes: staff write`). `20261105210000` is already live, so it is **not edited**.
- Drops `trg_sensor_nodes_guard` in case the first version of `20261105200000` went live:
  that file was edited after it may have been pushed.
- Adds F-08's "active users only" rule again on `discussions`, `discussion_audience`,
  `discussion_posts` and `table_versions`, in case F-08 ran before those tables existed
  (F-08 skips tables that do not exist yet).

Both extra steps do nothing if already done.

**Rule from now on: never edit a migration after it is pushed; add a new one. Tell Michelle
and Amberlyn before any `db push`.**

### Other force-pushed migrations: checked, no harm to main

| Migration | Effect on the live site built from main |
|---|---|
| `profile_self_edit` | New profile columns; main does not use them |
| `discussion_board`, `table_versions` | New tables and change-counting triggers only |
| `user_soft_delete` | Soft delete and a 30-day purge (only with pg_cron or this branch's API). The new notification-type list still allows every type main creates. |
| `species_status_lower_case` | Rewrites statuses to lower case. Main ignores case already, and its species form uses lower-case options, so this helps. |
| `sensor_nodes_admin_manage` | Nodes admin only; matches the team rule |

## Before this goes live

- [ ] Tell Michelle and Amberlyn, then push. `npx supabase@2 db push --dry-run --linked`
      (5 Nov 2026) lists exactly:
      `20261105220000_alerts_officer_admin_write.sql` and
      `20261105230000_specimen_delete_admin_only.sql` (next section).
- [ ] **Two approvals on the PR:** `packages/api-contract/openapi.yaml` changed (team rule).
- [ ] Redeploy the API on Render after merging.
- [ ] Update `docs/security/threat-modelling.md` (lines 44 and 56 say only the Admin reads
      alerts): officers see nodes and handle alerts; only the Admin manages nodes.

## What changed (compared with main)

| Before | Now | Where |
|---|---|---|
| `POST /sensor-nodes` allowed officers and admins | **Admins only.** The route still answers 501 (not built). | `services/api/src/permissions.js`, contract |
| `PATCH /sensor-nodes/:id` allowed officers and admins | **Admins only**, alert limits included (also on main, #54) | `services/api/src/permissions.js`, contract |
| Alert routes (assign, acknowledge, resolve, notes) | **Unchanged: officers and admins** | `services/api/src/permissions.js` |
| The database let officers insert, update and delete nodes (`nodes: staff`) | Read: officers and admins. Register, change and delete: **admins only**. | `20261105200000_sensor_nodes_admin_manage.sql` |
| Alerts and alert notes in the database | Officers and admins read and write (after `20261105210000` and `20261105220000`) | migrations |
| Web Monitoring page: alert-limits form for officers | Admins only; officers see the limits (main, #54). The alert controls are unchanged. | `apps/web/src/pages/SensorOverview.jsx` |
| The test only pinned node registration | One test: node writes admin only; node reads and every alert route officer and admin; never botanists | `services/api/test/rbac.test.js` |

The coming telemetry ingest (setting `last_seen` or `status`, creating alerts) will need a
server-side key that bypasses row-level security, or its own policy.

## Only admins delete plants (`20261105230000_specimen_delete_admin_only.sql`)

Team rule: officers cannot delete plants. The API and the apps have **no way to delete a plant**
(`PATCH /specimens/:id` only accepts `species_id`, `proposed_species_name` and
`endangered_override`), so nothing visible changes. The gap was in the database: the
`specimens: update` policy lets officers (any plant) and botanists (their own) update the row,
and `guard_specimen_update()` did not check `is_deleted`, so either could soft-delete a plant
straight through Supabase.

The migration replaces `guard_specimen_update()` (last set in `20261028000000`) with the same
checks plus: **only an admin may change `is_deleted`** (delete or restore). Nothing in the API,
the apps or the database functions sets `is_deleted` on a plant today, so nothing stops working.
There is still no "delete plant" button for admins; that would be a new feature.

## Still to build (not permissions)

- **Device keys** per node: today one shared `X-Sensor-Key` from the API's `.env` (CTIP-48).
- **Choosing which officers get alerts for each node:** only per-alert assignment exists
  (`POST /alerts/:id/assign`). Per-node routing is not built.
- `POST /sensor-nodes`, `GET /sensor-nodes/:id`, `/telemetry` and the webcam image routes still
  answer 501.

## Tests

- API: **181/181 pass**. The role test checks every route.
- **Not tested against the database** until the push. After it, check:
  - as an officer: acknowledging, resolving, assigning and adding a note to an alert work again
  - as an officer, through Supabase directly: changing a node, its alert limits, or a plant's
    `is_deleted` is refused
  - as a deactivated user: discussions cannot be read

---

# Merge with main (5 Nov 2026), checklist items and page check

*Written 5 Nov 2026. Nothing below is committed yet.*

## 1. Merged `origin/main` into this branch

Nine commits from main (CTIP-50 security fixes F-04, F-08, F-09/F-10, F-12, F-13, F-14,
CTIP-48, CTIP-57, CTIP-111). Two files conflicted:

| File | Resolved as |
|---|---|
| `services/api/src/permissions.js` | Main's (Michelle's) rule: `PATCH /sensor-nodes/:id` is **Admin only**. The database, contract and test were changed to match (section above). |
| `apps/shared/StoreProvider.js` | **Both kept:** this branch's cursor-based workspace load, then main's F-13 check `if (epoch !== sessionEpoch.current) return { ok: true };`, which drops a load that was started for the previous user after sign-out. |

Also in `StoreProvider.js`:

- Main still had the old 30-second `refreshNotifications` poll. This branch removed it on
  purpose (notifications now come with the workspace load), so it stays removed.
- When the session ends on its own (not just on sign-out), the cached workspace
  (`lastWorkspace`) is now cleared too, so the old user's data cannot come back through it.

## 2. "Just looking around?" on the sign-in page

From the team's feature list. Below the sign-in form: "Just looking around? Browse the plant
library or the plant map, no account needed", linking to `#/plants` and `#/map`.
File: `apps/web/src/pages/Login.jsx`.

## 3. Bug fixed: a visitor's QR tag page could crash

`#/tag/<code>` for a visitor showed "This page hit a problem" when the API's answer had no
`species` with the plant (`TypeError: Cannot read properties of undefined (reading
'common_name')` in `PublicPlant.jsx`). The real API always sends the species or answers 404,
so this was only seen with the test's fake API, but the page now shows "We could not load
this plant right now" instead of crashing. File: `apps/web/src/pages/PublicPlant.jsx`.

## 4. Feature list checked (web)

| Item | Status |
|---|---|
| Map zooms; clicking a circle opens the plant pop-up; groups show a number | Done |
| Present again with new data | **Open:** the built-in sample data (`apps/shared/data.js`, used when the API is offline) has 5 of its 7 plants at the same point (3.8031, 113.7762) |
| Create new species | Done |
| Search and filter by family, genus, conservation status | Done (status filter is staff only) |
| "Are you sure you want to make this public?" when creating a species | Done (typed word `PUBLISH`) |
| Discussion (botanists, officers), sent to particular people | Done: group buttons plus a people search; the tick-box drop-down is "Send to…" |
| "Just looking around?" with links to the plant library and map | Done (section 2) |
| IoT monitoring: sensor nodes admin only, officers see them; alerts for officers and admins | Done (section above) |
| Email account rate limit | Done (`services/api/src/emailLimit.js`) |
| Deactivated users kept apart from current users | Done ("Not active" table) |
| Harder deactivation with a confirmation | Done (typed word `DEACTIVATE`) |
| Soft deletion with a 30-day grace period | Done (restore, days-left count) |

## 5. Page check: every page, every role

New browser test `apps/web/tests/every-page.spec.js`. Against the fake API, it opens every
page as a visitor, botanist, officer and admin, on a desktop and a phone-sized screen. It fails
on any uncaught error, console error, the error screen or a "no access" message. It also checks
that officers and admins both get the alert buttons (Acknowledge, Resolve, Add note).

- Pages: `#/`, about, contact, staff, book, plants, a species page, a tag page, map, scan,
  login, plus each role's staff pages (dashboard, add, records, review, reports, species,
  monitoring, users, audit, tags, notifications, discussion, account).
- **Result: 12/12 pass** (6 tests × 2 screen sizes), after the fix in section 3.
- The fake API (`tests/helpers/mockApi.js`) can now sign in as any role (`state.role`,
  officer by default so older specs are unchanged) and answers `/public/tags/:qrId` with 404
  like the real API.

## 6. All tests

| Suite | Result |
|---|---|
| API (`npm run api:test`) | 181/181 pass |
| Shared (`apps/shared/test`) | 62/62 pass |
| Mobile (`apps/mobile/tests`) | 78 pass, 3 fail. **The same 3 fail on main**: map-coordinate rounding (CTIP-71), map clustering and `zoomToShowLayer` (CTIP-70). |
| Web lint and build | Clean |
| Web browser tests, desktop | 62 pass, 17 fail, 5 skipped. **16 of the failures also fail on main.** They click the old role buttons (`.roleswitch`), which were taken out of the dev bar in CTIP-113, so they time out. The 17th ("Search Resilience") passed 3 times out of 3 when run alone, so it is flaky when the whole suite runs. |

**Needs doing:** rewrite `role-pages.spec.js`, `agent-advanced.spec.js`, `agent-audit.spec.js`
and `agent-jira-traceability.spec.js` to sign in through the fake API (`open(page, newState({ role }), hash)`)
instead of the role switch, and fix the 3 mobile map tests.
