# Mobile app tests on the new build (VA-50, VA-52, VA-53, VA-55)

- Date: 3 Nov 2026. Tester: Michelle
- APK: `app3.apk`, Biodiversity Field App 1.0.0 (version code 6), package `com.ctip.biodiversity`, Target SDK 36, Min SDK 24
- SHA-256: `DAC123116E5FE583A20ACC47111458E81633AEF16605F83D8F02DEEE54BB843C` (M1-va50-app3-hash.png)
- Static tests (VA-50) on the laptop only (MobSF in Docker, PowerShell search of the unzipped APK)
- Phone tests (VA-52, 53, 55) on an Android Studio emulator: Pixel 6, API 34, "Google APIs" image, `adb root`. The app talks to the real API (Render), so it was only used as a normal user would: signed in with Michelle's own account, nothing submitted, no attack traffic
- Files copied off the emulator were only searched for word counts (no token values shown) and were deleted straight after (`C:\ctip-test\mobile-pull`)
- Screenshots: `docs/testing/mobile/`. Older mobile screenshots moved to `docs/testing/mobile/28oct-old-apk/` and `docs/testing/mobile/29oct-old-apk/`

## Summary

| Test | Result |
|---|---|
| VA-50 MobSF static scan | **Fail**: F-01, F-02, F-03 still present. Score 52/100 (was 47) |
| VA-50 secrets in the app | **Pass**. No secret key, no token, no saved accounts. **F-07 fixed** |
| VA-52 where the sign-in is kept | **Pass**. Encrypted (SecureStore), nothing in plain storage |
| VA-53 draft database encrypted | **Pass** |
| VA-55 sign-out clears the session | **Pass** (the encrypted draft stays, see Notes) |
| Extra: admin tries to start a plant record | **Pass**. Only botanists can |

No new findings. F-07 can be closed.

## Results

| Test | What was checked | Expected (pass) | Result | Evidence | Finding |
|---|---|---|---|---|---|
| VA-50 | APK identity | Hash recorded | SHA-256 `DAC12311…BB843C`, version code 6 | M1-va50-app3-hash.png, M2-va50-app3-score.png | |
| VA-50 | Permissions | Only camera, location, internet, network state, vibrate | **Fail**. Still `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`. New: `USE_BIOMETRIC` / `USE_FINGERPRINT` (normal level, from the secure storage library), accepted | M3-va50-app3-permissionsa.png, M3-va50-app3-permissionsb.png | F-02 |
| VA-50 | allowBackup | `false` | **Fail**. Still `true` | M4-va50-app3-manifest.png | F-01 |
| VA-50 | minSdk | 29 or an accepted-risk note | **Fail**. Still 24; MobSF now rates it **high** | M4-va50-app3-manifest.png | F-03 |
| VA-50 | Exported receiver | Only the standard library one | Pass. `ProfileInstallReceiver` (protected by `DUMP`), same as before | M4-va50-app3-manifest.png | |
| VA-50 | Secrets in the app's code (`assets/index.android.bundle`) | 0 for `sb_secret_`, `service_role`, `eyJhbGci` (token), `signInWithPassword`, shared account emails | **Pass**. All 0. The one `@gmail.com` is the author of an open-source library, not a team account. `supabase.co` 7 = old sample photo links in `apps/shared/data.js` (public photos, no key). Check words `NIAH-` and `botanist` found 10 times each, so the search worked | M5-va50-app3-secret-search.png, M6-va50-app3-gmail-context.png | F-07 fixed |
| VA-52 | App files after signing in | Recorded | `databases/RKStorage` (plain storage), `shared_prefs/SecureStore.xml` (encrypted) | M7-va52-emulator-setup.png, M8a-va52-app-signed-in.png, M8b-va52-app-files-list.png | |
| VA-52 | Sign-in tokens in plain storage | Not there | **Pass**. RKStorage: `daun_session` 0, `refresh_token` 0. SecureStore: `daun_session` 1 (entry name only), `refresh_token` 0, `eyJhbGci` 0, so the value is encrypted | M9-va52-token-storage-check.png | |
| VA-53 | Plant draft database (`files/SQLite/daun_drafts_secure.db`), with a draft holding the note "VA53 test" on tag `NIAH-0042` | File cannot be read | **Pass**. Header is random bytes, not "SQLite format 3"; "VA53 test" 0, "NIAH-0042" 0 | M13-va53-draft-db-files.png, M14-va53-draft-db-encrypted.png | |
| VA-55 | Session after sign-out | Removed | **Pass**. SecureStore `daun_session` 0 | M15-va55-after-signout.png | |
| VA-55 | Draft after sign-out | Removed, or encrypted | Encrypted draft is still on the phone (`daun_drafts_secure.db`); pulled files deleted afterwards | M15b-va55-draft-after-signout.png | Observation |
| Extra | Admin scans an unused tag (`NIAH-0042`) | Cannot start a plant record | **Pass**. "This tag is not on a plant yet", no Start button | M13a-va53-admin-cannot-add-plant.png | |

## Notes

- **Draft stays after sign-out (observation, low).** The draft is encrypted, but the key stays on the phone too, so the app can still open it. If another botanist signs in on the same phone and scans the same tag, they may see the earlier notes, photos and GPS. Recommendation: clear drafts on sign-out, or keep them per user.
- **Not tested here:**
  - The VA-55 "deactivate, then sync" step: offline sync is not built yet (CTIP-16), and deactivating would change a real account.
  - VA-54 (network traffic through ZAP): it would send the app's traffic to the real API. Still to decide whether to run it in passive mode only.
  - VA-51 (QR input): passed on the 29 Oct build; not repeated.
- **Functional bugs seen (not security):**
  - The website's Monitoring page (`#/monitoring`) crashes on the real site because a sensor node has no plant linked (`SensorOverview.jsx` line 71, `plantOf(n).name`).
  - The app's Users page closed the app once, because an account had no name or role. It was fixed during the test.
