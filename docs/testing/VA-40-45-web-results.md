# Web app tests (VA-40 to VA-45)

- Date: 3 Nov 2026. Tester: Michelle
- Target: **local** only. Website built with `npm run build` and served by `npm run preview` (http://localhost:4173), local API (http://localhost:8000), local Supabase. Never the Render API, the Cloudflare site or the hosted Supabase
- Commit tested: `main` at `430fb7d` ("Merge pull request #45 from Kampung-Semua-Cina/rick-extra-CTIP") (W1-commit.png)
- Test accounts, all `@test.local`, password `Test-Pass-2026!`: `botanist-a`, `botanist-b`, `officer`, `admin`
- Setup check: officer signs in and sees the local test data (TEST-0002, "Test Published Plant") (W2-setup-officer-signed-in.png)
- Screenshots: `docs/testing/web/` (tokens covered). The ZAP HTML report is kept off the repo because it contains test tokens

## Summary

| Test | Result |
|---|---|
| VA-40 ZAP scan | **Pass** (0 High) |
| VA-41 Script in stored text | **Pass** |
| VA-42 Security headers | **Fail**, F-12 (Low) |
| VA-43 Botanist reaching officer and admin pages | **Pass** |
| VA-44 Endangered plant on the map | **Pass** for officer and a fresh visitor. **Fail** after an officer signs out, F-13 (Medium) |
| VA-45 Session storage and sign-out | **Pass**, except the old access token still works until it expires (known, F-10) |
| Extra: video uploaded as a plant photo | **Pass** |

New problems: **F-12** (Low), **F-13** (Medium), and a bug with a security effect (capital-E `Endangered` not recognised by the website).

## Results

| Test | What was checked | Expected (pass) | Result | Evidence | Finding |
|---|---|---|---|---|---|
| VA-40 | ZAP automated scan (spider, ajax spider, active scan), logged out | No High alerts | **Pass** (0 High). 4 Medium: CSP not set, cross-domain misconfiguration (`Access-Control-Allow-Origin: *`), missing anti-clickjacking header, Sub Resource Integrity missing. 2 Low: `X-Powered-By` header, `X-Content-Type-Options` missing. 1 Info | W5a-va40-alerts-loggedout.png | F-12 |
| VA-40 | ZAP manual explore as officer, then active scan of the API (`http://localhost:8000`) | No High alerts | **Pass** (0 High). Totals for both scans: 0 High, 4 Medium, 5 Low, 6 Info. New Lows: `Server` version header, `Strict-Transport-Security` not set (expected on local `http`; the live API turns HSTS on with `REQUIRE_HTTPS`), Unix timestamp disclosure. Info includes "Information in browser localStorage" (the session, see VA-45) | W5b-va40-alerts-loggedin.png | F-12 |
| VA-41 | Script text saved in a species name and description and in a discussion post, then viewed as officer, botanist and visitor | Shown as text, no script runs | **Pass**. Shown exactly as typed on every page, no pop-up, no broken image | W4a-va41-species-form.png, W4b-va41-species-list.png, W4c-va41-species-page.png, W4d-va41-discussion-post.png, W4e-va41-discussion-officer.png, W4f-va41-visitor-catalogue.png, W4g-va41-visitor-species.png | |
| VA-42 | Security headers on the built site | CSP, `nosniff`, frame protection, Referrer-Policy present | **Fail**. None of the 4 present. Only `Access-Control-Allow-Origin: *` (added by the local preview server) | W3-va42-headers.png | F-12 |
| VA-42 | Header file for the live site (Cloudflare Pages `_headers`) | File exists with the headers | **Fail**. `apps/web/public/_headers` does not exist, so the live site gets no headers from the project | W3b-va42-no-headers-file.png | F-12 |
| VA-43 | Botanist opens `#/users` and other officer and admin pages | Page refused, no data | **Pass**. "You can't open this page" | W8a-va43-botanist-users-page.png | |
| VA-43 | Change the role stored in the browser | Not possible, or the API still refuses | **Pass**. The stored session (`daun_session`) holds only the tokens, email and user id, no role, so there is nothing to change; the role comes from the token | W8b-va43-session-no-role.png | |
| VA-43 | Botanist token sent straight to an admin API call (`GET /v1/profiles`) | `403` | **Pass**. `403 Forbidden` | W8c-va43-api-profiles-403.png | |
| VA-44 | Officer zooms to 20 on TEST-0001 (Endangered, approved for this test) and watches the tile requests | Tiles capped at zoom 15 near the plant | **Pass**. The map shows Zoom 20, but the tile requests are rows `16282`/`16283`, which are zoom 15 for latitude 1.11° (zoom 20 would be about 521,000). The map enlarges zoom-15 tiles instead of asking the tile server for close-ups. The officer sees the exact location (allowed) | W6a-va44-officer-tiles.png, W6c-va44-officer-popup.png | |
| VA-44 | Fresh visitor (Incognito window) searches TEST-0001 on the map | No exact location | **Pass** for the location: pin and pop-up show `1.11500, 111.11500`, ±1100 m (the grid centre, not the real `1.11111, 111.11111`). Tiles requested around the rounded spot only. **But** the page says "Locations of endangered plants are not shown" and a pin is still shown, because of the capital-E bug | W6d-va44-visitor-incognito-map.png, W6e-va44-visitor-incognito-popup.png | Bug |
| VA-44 | Visitor on the same browser straight after the officer signs out (no reload) | No exact location | **Fail**. Pop-up shows the exact `1.11111, 111.11111`. The map centred on the real spot at zoom 20 and requested zoom-19 tiles of it (rows 260524 to 260526; the rounded spot would be row 260520). Cause: `logout()` in `apps/shared/StoreProvider.js` clears the token but not the loaded data | W6b-va44-visitor-map.png, W6f-va44-after-signout-popup.png | F-13 |
| VA-45 | Where the session is kept | Recorded | `localStorage`, key `daun_session` (access token, refresh token, email, user id). Readable by any script on the page; acceptable while VA-41 finds no script injection | W9a-va45-session-stored.png | Observation |
| VA-45 | Sign-out removes the stored session | Removed | **Pass**. `daun_session` gone after sign-out | W9b-va45-after-signout-storage.png | |
| VA-45 | Old refresh token after sign-out | `401` | **Pass**. `401 Unauthorized` | W9c-va45-old-tokens-after-signout.png | |
| VA-45 | Old access token after sign-out | `401` | **Fail (known)**. `200`: works until it expires (up to 1 hour). Same cause as F-10 | W9c-va45-old-tokens-after-signout.png | F-10 |
| Extra (A04) | Officer: `.mp4` picked as a species photo | Refused | **Pass**. The file picker does not allow `.mp4` | W7a-video-upload-mp4.png | |
| Extra (A04) | Officer: video renamed to `.jpg` (gets past the file picker) | Refused, nothing stored | **Pass**. The API checks the file's real content and answered `415`. The website showed a blank photo box and no clear "not a picture" message (usability note) | W7b-video-upload-renamed-jpg.png | |
| Extra (A04) | Botanist, Add plant: `.mp4` as a photo | Refused | **Pass**. The file window only shows image files | W10a-botanist-addplant-mp4.png | |
| Extra (A04) | Botanist, Add plant: video renamed to `.jpg` | Refused, nothing stored | **Pass**. "Failed to add plant: Photos must be JPEG, PNG, WebP or HEIC" | W10b-botanist-addplant-renamed-jpg.png | |
| Extra (A04) | `observation-photos` bucket after the test | No video | **Pass**. Only `va32-test.jpg` from 29 Oct | W10c-botanist-photo-storage-check.png | |

## Findings from these tests

### F-12: Website sends no security headers; API shows its software name (Low, 1 × 2 = 2)

- **Problem:** no `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors` or `Referrer-Policy`. The repo has no `apps/web/public/_headers`, so Cloudflare Pages sends none. The API also sends `X-Powered-By: Express` and a `Server` version.
- **Impact:** no second line of defence. A future script-injection bug could read the session in `localStorage`, and staff pages can be framed by another site (clickjacking). Low because VA-41 found no way to run script.
- **Recommendation:** add a `_headers` file with the four headers; turn off `X-Powered-By` in the API.

### F-13: Exact endangered location still shown after an officer signs out (Medium, 1 × 3 = 3)

- **Problem:** on the same browser, without a reload, a signed-out visitor sees the officer's exact coordinates (`1.11111, 111.11111` instead of `1.115, 111.115`), and the map asks the tile server for close-ups of the real spot.
- **Impact:** exact locations of endangered plants are the most sensitive data in the system (threats T13, T19). On a shared park office computer, the next person sees them.
- **Recommendation:** on sign-out, clear all loaded data (reset the store to its empty start) or reload the page.

### Bug with a security effect: `Endangered` with a capital E is not recognised by the website

- **Problem:** the test species is stored as `Endangered`. The API and database compare without case, so locations stay protected there. The website compares exactly with `endangered` (`THREATENED` in `apps/shared/data.js`, used in `apps/shared/selectors.js`).
- **Impact:** dashboards show "0 endangered"; the visitor map shows a rounded pin although the page says endangered locations are not shown; and the **Edit species form shows "Least concern"** (W4c). If an officer opens Edit and saves, the species becomes Least concern and its plants' exact locations become public.
- **Recommendation:** compare without case in the website too, and make the form keep values it does not recognise. Check whether the hosted data has capitalised values.

## Notes

- **Botanist "Generate new QR" fails on a database built from the migrations.** Message: "Failed to create tags: new row violates row-level security policy for table "qr_tags"" (W10x-botanist-generate-qr-error.png). Known CTIP-111 gap: the migration lets only officers and admins write tags, while the hosted project was changed by hand. Functional bug; the message also shows database details to the user. Workaround in this test: the officer generated tags first.
- **VA-40 Mediums explained.** CSP, anti-clickjacking and `X-Content-Type-Options` are F-12. `Access-Control-Allow-Origin: *` on the website comes from the local preview server; check the live site's headers once before deciding. Sub Resource Integrity: Google Fonts CSS changes per browser, so SRI cannot be added; accepted (or host the fonts with the site).
- To make TEST-0001 appear on the map, the officer approved the test observations on 3 Nov (local only). The map only shows plants with an approved record that has a location.
- Test data left behind (local only): the VA-41 species, the discussion post and the plants added in the video test.
