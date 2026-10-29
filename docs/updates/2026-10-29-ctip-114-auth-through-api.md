# CTIP-114: the apps talk only to the API

**Before:** the website and the app signed in, refreshed sessions and changed
passwords by calling Supabase Auth directly (supabase-js in the browser and on
the phone), so both needed the Supabase address and key.

**Now:** they call the API, and the API calls Supabase Auth for them.

| App calls | API does |
|---|---|
| `POST /v1/auth/sign-in` `{ email, password }` | signs in to Supabase Auth, returns `{ access_token, refresh_token, expires_at, user }` |
| `POST /v1/auth/refresh` `{ refresh_token }` | swaps it for a new session (each refresh token works once) |
| `POST /v1/auth/sign-out` (with the token) | ends that session, so its refresh token stops working |
| `POST /v1/auth/password-reset` `{ email }` | emails a reset link; always 202 so it never reveals who has an account |
| `POST /v1/me/password` `{ current_password?, new_password }` | checks the current password, then sets the new one as that user |

- The apps keep the session in `apps/shared/api.js` (`localStorage` on the web,
  memory on the phone) and renew it through the API a minute before it expires.
- A reset link opens the website at `#access_token=…&type=recovery`; the store
  takes the session out of the address and opens `#/login?reset=1` to choose a
  new password.
- Sign-in is limited to 10 tries per caller address every 5 minutes (429
  `TOO_MANY_ATTEMPTS`), because Supabase now sees every attempt coming from the API.
- **Photos are the one exception.** The API still hands out short-lived Supabase
  Storage links, and the apps load those images directly.
- `@supabase/supabase-js` is gone from the web, the mobile app and the repo root;
  only `services/api` uses it.

## Settings to change after merging

**Cloudflare Pages (website):** keep `VITE_API_URL` = the Render address without
`/v1`. Delete `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Redeploy.

**Render (API):** `TRUST_PROXY=1` (needed for the sign-in limit), and
optionally `PASSWORD_RESET_REDIRECT_URL=https://ctip-biodiversitysystem.pages.dev/`.

**Supabase, Authentication > URL Configuration:** Site URL
`https://ctip-biodiversitysystem.pages.dev`, and add the same address under
Redirect URLs (otherwise reset emails link to localhost).

**Mobile (`apps/mobile/eas.json`):** replace the `EXPO_PUBLIC_API_URL`
placeholder with the Render address, then build a new APK. Older APKs keep
signing in to Supabase directly until they are replaced, so ask everyone to
install the new one.
