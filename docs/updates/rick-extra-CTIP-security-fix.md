# Branch `rick-extra-CTIP`: confirm screens for critical actions

*Written 4 Nov 2026. Web app only; the mobile app is not changed.*

Every critical change or delete on the website now asks "are you sure?" before it goes
through. The most serious ones also make the person **type a word** before the Confirm
button turns on, so they cannot be done by a stray click.

**Affects the team:** web UI only. No database, API or contract change. Nothing here is committed yet.

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

## Tests

- Lint and `vite build` pass.
- `live-review-map.spec.js` passes (18/18) after two tests were updated to go through the new dialogs (approve, and create-and-publish a species).
- `role-pages.spec.js` has 5 failures per project. They fail the same way without these changes.
