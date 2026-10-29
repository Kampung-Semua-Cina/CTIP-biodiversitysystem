# Must fix: apply three Supabase migrations

**For:** backend team · **Branch:** `PR-rick3` · **Date:** 2026-10-29

## Problem

Officers and admins never get notifications, so new records sit in the review queue unnoticed. Botanists do get theirs.

## Cause

This is a database problem, not an API problem. Notifications are created only by database triggers, and the website reads them straight from Supabase.

The trigger that notifies officers and admins is in a migration that hasn't been applied. On our project this query returns **no rows**:

```sql
select tgname from pg_trigger where tgname = 'trg_notify_on_submission';
```

## What to run

Run these files from `supabase/migrations/`, **in this order**, in the Supabase SQL Editor:

1. **`20261028000000_tag_assignment.sql`**: marks QR tags that already have a plant as used. This fixes the "specimens_qr_id_key" error.
2. **`20261029000000_staff_notifications.sql`**: notifies every active officer and admin when a record is sent for review, and tells staff when a botanist replies. It also creates one notification per record that is already waiting.
3. **`20261029120000_approve_requires_species.sql`**: refuses approval until the plant has a species. It also blocks decisions written straight into the database, so the API's `review_observation()` is the only way to save one.

## Safety

- Each file is safe to run twice.
- Only files 1 and 2 change data: file 1 marks tags, and file 2 adds the notifications for records already waiting.
- A failed notification can never stop a botanist's record from being saved.
- All three were tested on a local Postgres (PGlite) with every migration applied.

## After applying

- [ ] Run the query above again. It should return **one row**.
- [ ] Send a test record as a botanist. Within 30 seconds, the officer's and the admin's bell should show "New record to review".
- [ ] Restart the API (`npm run api`) so the new species photo endpoints load.

## More detail

- `bugs.md`: T8 (staff notifications) and T10 (approving without a species)
- `changes.md`: "Update 3"
