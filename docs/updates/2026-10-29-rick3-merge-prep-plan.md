# Prepare `rick3` for merge into `main` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #26 (`rick3` → `main`) mergeable: no conflicts, CI green, no endangered-location leak, contract complete, repo root tidy.

**Architecture:** Bring `main` into `rick3` (not the other way round), so the PR shows a clean diff and CI runs on the real merged result. Fix what blocks CI and review on top of that merge, one commit per task, then fast-forward `origin/rick3`.

**Tech Stack:** Node 24, Express 5, Zod, `node --test` + supertest (API), React + Vite 8 + ESLint (web), Expo SDK 57 (mobile), OpenAPI 3 (Redocly lint).

**Spec:** the review of PR #26 on 29 Oct 2026 (blockers 1–5) and `CLAUDE.md` (security requirements: endangered coordinates reduced server-side; contract first).

## Global Constraints

- Plain JavaScript, no TypeScript. PowerShell-friendly commands in any docs.
- Commit messages start with an issue key: `CTIP-…: …`.
- Exact-location roles are `EXACT_LOCATION_ROLES = ['officer', 'admin']` from `services/api/src/distribution.js`; endangered means `endangered_override` or species status `endangered` / `critically endangered` (any case). Reuse these, do not redefine them.
- Reduced coordinates use the existing 0.01° grid (`GRID_DEGREES`, `REDUCED_PRECISION_M = 1100`).
- Do not apply migrations to the live Supabase project; that is a separate step for the database team after merge (`npx supabase db push`).
- Never push to `main`. Push only to `rick3`, and only as a fast-forward of what is on GitHub now (`64849c1`).

## Review Focus

1. A plant with no GPS (`lat`/`lng` null) must keep null coordinates after protection, not turn into a grid point. → Task 3 test `null coordinates stay null`.
2. A botanist must still see the exact location of a plant **they** registered (they stood next to it). → Task 3 test `own plant stays exact`.
3. Officers and admins always get exact coordinates. → Task 3 test `officer sees exact`.
4. Status written as "Critically Endangered" (capitals) counts as endangered; the officer's `endangered_override` counts even with no species. → Task 3 test `override and capitalised status both reduce`.
5. Scanning another botanist's endangered plant's tag (`GET /specimens/by-qr/:qrId`) must not reveal the exact spot either, since any botanist can list every tag. → Task 3 test `by-qr reduces another botanist's endangered plant`.

---

### Task 1: Merge `main` into `rick3`

**Files:** the 13 conflicting files: `apps/mobile/.env.example`, `apps/mobile/api.js`, `apps/shared/apiClient.js`, `apps/web/.env.example`, `apps/web/src/api.js`, `packages/api-contract/openapi.yaml`, `services/api/src/{handlers,observations,species,speciesMedia}.js`, `services/api/test/{observation-review,species-media,species}.test.js`.

- [ ] **Step 1:** `git merge origin/main` on a branch from `origin/rick3`. Resolve each conflict to `rick3`'s side (its files are `main`'s plus additions).
- [ ] **Step 2: Check nothing from `main` was dropped.** For each conflicting file, `git diff origin/main HEAD -- <file>` must show only additions, or removals that `rick3` made on purpose (named in the commit message).
- [ ] **Step 3: Check `main`'s other work survived:** CI has the `Shared (tests)` job; `docs/security/encryption.md` and `services/api/src/https.js` exist.
- [ ] **Step 4:** `npm test` in `services/api` (expect 94 pass), `node --test` in `apps/shared` (11 pass), `npm test` in `apps/mobile` (53 pass).
- [ ] **Step 5: Commit** `CTIP-31: merge main into rick3`.

### Task 2: Make the web CI job pass

**Files:** Modify `apps/web/vite.config.js` (`resolve.dedupe`), `apps/web/src/pages/Scan.jsx`.

- [ ] **Step 1:** In `apps/web`, from a clean install (`npm ci`, as CI does): `npm run lint` fails (6 errors in `Scan.jsx`) and `npm run build` fails ("failed to resolve import @supabase/supabase-js").
- [ ] **Step 2:** Add `'@supabase/supabase-js'` to `resolve.dedupe`.
- [ ] **Step 3:** `Scan.jsx`: import `extractTag` from `apps/shared/selectors.js` (same function) instead of exporting its own copy; navigate with `go()` from `useRoute.js` instead of assigning `window.location.hash`; drop the unused `Chip` import and the unused `err` binding.
- [ ] **Step 4:** `npm ci && npm run lint && npm run build` in `apps/web` → lint clean, build succeeds.
- [ ] **Step 5: Commit** `CTIP-49: fix web lint and CI build on rick3`.

### Task 3: Stop `/workspace` and `/specimens/by-qr` leaking endangered locations

**Files:** Modify `services/api/src/distribution.js`, `services/api/src/staff.js` (`get /workspace`), `services/api/src/field.js` (`get /specimens/by-qr/:qrId`). Test: `services/api/test/field-and-staff.test.js`.

**Interfaces:**
- Produces: `protectSpecimen(specimen, { role, userId, status })` in `distribution.js` → a copy of the specimen. When the plant is endangered (`isEndangered`, using `status` as the species' conservation status), the role is not in `EXACT_LOCATION_ROLES`, and `specimen.registered_by !== userId`: `lat`/`lng` snapped to the grid (null stays null), `gps_accuracy_m: REDUCED_PRECISION_M`, `location_reduced: true`. Otherwise unchanged with `location_reduced: false`.

- [ ] **Step 1: Write the failing tests** (in `field-and-staff.test.js`):
  - `workspace: another botanist's endangered plant comes back reduced` → botanist gets `lat`/`lng` ≠ stored values, on the 0.01 grid, `location_reduced: true`.
  - `workspace: officer sees exact` → stored values, `location_reduced: false`.
  - `workspace: own plant stays exact` (botanist is `registered_by`).
  - `workspace: null coordinates stay null`.
  - `workspace: override and capitalised status both reduce` (`endangered_override: true` with no species; species status `Critically Endangered`).
  - `workspace: a species the botanist cannot see (unpublished) counts as endangered` (added during implementation: RLS shows botanists only published species, so an unknown status must fail closed).
  - `by-qr reduces another botanist's endangered plant`.
- [ ] **Step 2:** Run `npm test` in `services/api` → the new tests fail.
- [ ] **Step 3:** Implement `protectSpecimen` in `distribution.js` (export it and reuse `snap`). In `get /workspace`, map `out.specimens` through it, looking up each specimen's status in `out.species` by `species_id`. In `get /specimens/by-qr/:qrId`, look up the species' `conservation_status` when `species_id` is set, then return `protectSpecimen(data, …)`.
- [ ] **Step 4:** `npm test` → all pass (94 + 7).
- [ ] **Step 5: Commit** `CTIP-71: reduce endangered coordinates in workspace and tag lookup`.

### Task 4: Add the seven new routes to the API contract

**Files:** Modify `packages/api-contract/openapi.yaml`. Create `services/api/test/contract.test.js`.

- [ ] **Step 1: Write the failing test** `every route in permissions.js is in the contract`: read `openapi.yaml` as text, and for each `[method, path]` in `routes` (with `:param` → `{param}`), assert the path block contains the method. Currently fails on 7 routes.
- [ ] **Step 2:** Add to `openapi.yaml`, following the existing style (tags, `security`, error responses): `GET /public/workspace` (no auth), `GET /workspace`, `PATCH /me`, `POST /profiles`, `DELETE /qr-tags/{qrId}`, `POST /qr-tags/{qrId}/retire`, `POST /species/{id}/restore`. Describe the coordinate protection on `/workspace`.
- [ ] **Step 3:** `npm test` in `services/api` passes, and `npx @redocly/cli lint packages/api-contract/openapi.yaml` reports no errors.
- [ ] **Step 4: Commit** `CTIP-13: add rick3's new routes to the API contract`.

### Task 5: Tidy the repo root and the migration instructions

**Files:** Move `bugs.md`, `changes.md`, `must_fix.md` → `docs/updates/rick3-bugs.md`, `docs/updates/rick3-changes.md`, `docs/updates/rick3-must-fix.md`.

- [ ] **Step 1:** `git mv` the three files; fix their relative links (`services/…` → `../../services/…`).
- [ ] **Step 2:** In `rick3-must-fix.md`, replace "run in the Supabase SQL Editor" with: `npx supabase db push --dry-run` from the repo root (must list exactly `20261028000000`, `20261029000000`, `20261029120000`), then `npx supabase db push`, and tell Amberlyn.
- [ ] **Step 3: Commit** `CTIP-24: move rick3 notes into docs/updates`.

### Task 6: Verify, push and describe the PR

- [ ] **Step 1:** From a clean checkout of the branch: API, shared and mobile tests pass; `apps/web` `npm ci && npm run lint && npm run build` pass; a trial `git merge origin/main` reports "Already up to date".
- [ ] **Step 2:** Confirm `origin/rick3` is still `64849c1` (nobody pushed meanwhile), then `git push origin HEAD:rick3` (fast-forward only).
- [ ] **Step 3:** Wait for CI on PR #26; all three jobs green.
- [ ] **Step 4:** Write the PR #26 description: stories covered, what changed, the post-merge database step, "Squash and merge" (keeps the leaked key's old commits out of `main`'s history), and the manual checks still to do.
