# Encryption at rest and in transit (CTIP-35)

Scope Objective 3: sensitive data is encrypted on every platform. This page says
what is encrypted, where, how to switch it on, and what is still open.
Threats it covers (see [threat-modelling.md](threat-modelling.md)): T12 (sniffed
telemetry), T13 (exact GPS leaks), asset 3 (accounts, emails, tokens).

## Summary

| Requirement | How | Status |
| --- | --- | --- |
| Client to API uses HTTPS; HTTP rejected | `REQUIRE_HTTPS=true` in the API: plain HTTP gets `403 HTTPS_REQUIRED`, HTTPS gets an HSTS header | Done (CTIP-35), tested in `services/api/test/https.test.js` |
| API to Supabase uses TLS | `SUPABASE_URL` is `https://`; the API refuses to start in production otherwise | Done (CTIP-35) |
| MQTT uses TLS | Mosquitto listener on 8883 with TLS only, no anonymous clients | Owned by CTIP-17; settings below |
| Personal data encrypted at rest | Supabase encrypts the whole database and Storage at rest (AES-256), including `profiles` and `audit_logs` | Provided by Supabase; nothing to build |
| Mobile SQLite encrypted | `expo-sqlite` with SQLCipher, key in `expo-secure-store` | To do when the offline database is added; settings below |
| Secrets in env vars, never in the repo | `.env` is git-ignored; only `.env.example` files with placeholders are committed | Done; git history scanned on 26 Oct 2026, no keys found |

## 1. In transit

### Apps to API (HTTPS only)

`services/api/src/https.js`. With `REQUIRE_HTTPS=true`:

- a request that did not arrive over HTTPS is **rejected** with
  `403 { code: "HTTPS_REQUIRED" }`. It is not redirected: by the time an HTTP
  request arrives, its access token and body have already crossed the network
  in the clear, and a redirect would hide that mistake instead of surfacing it;
- every HTTPS response carries `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
  so browsers never try plain HTTP for this host again;
- the API will not start if `SUPABASE_URL` or any `CORS_ORIGINS` entry is not `https://`.

Most hosts (Render, Railway, Fly, an Nginx in front) end TLS in their proxy and
pass the request on over HTTP with `X-Forwarded-Proto: https`. Set
`TRUST_PROXY=1` there so Express believes that header. Without `TRUST_PROXY`
the header is ignored, so a client cannot fake HTTPS (tested).

Local development leaves `REQUIRE_HTTPS` unset, so `http://localhost:8000` still
works. Production `.env` on the host:

```
REQUIRE_HTTPS=true
TRUST_PROXY=1
SUPABASE_URL=https://<project-ref>.supabase.co
CORS_ORIGINS=https://<web app address>
```

The apps read the API address from `.env` (CTIP-54): production builds must use
an `https://` address for `VITE_API_URL` and `EXPO_PUBLIC_API_URL`. Android
blocks plain-HTTP traffic in release builds by default; do not turn on
`usesCleartextTraffic` for release.

### API and apps to Supabase

Supabase's API, Auth and Storage endpoints are HTTPS only. For direct Postgres
connections (SQL clients, migrations), the project owner turns on
**Database settings > SSL Configuration > Enforce SSL on incoming connections**
in the Supabase dashboard.

### Sensor node to MQTT broker (CTIP-17)

Settings for the CTIP-17 owner, so this ticket's requirement is met:

```
# infra/mosquitto/mosquitto.conf
listener 8883
cafile   /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile  /mosquitto/certs/server.key
tls_version tlsv1.2
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file      /mosquitto/config/acl
```

No plain listener on 1883. The ESP32 connects with `WiFiClientSecure` and the CA
certificate. Certificates and the password file are never committed (README).

## 2. At rest

### Database and Storage (Supabase)

Supabase encrypts all project data at rest with AES-256: the Postgres database
(so `profiles.full_name`, `profiles.email`, `audit_logs`) and Storage buckets. This covers "personal data encrypted at rest" without extra code.

We chose not to add column-level encryption (pgcrypto / Vault) for names and
emails: the API and Auth need to search and compare emails, and the key would
have to live in the same database or the API, which adds risk without stopping
the attacker the threat model worries about (one with an officer's login, T18).
Revisit if the project stores phone numbers or addresses.

What still protects personal data beyond disk encryption: RLS on every table,
the publishable key only in clients, and the API's field whitelists (CTIP-89).

### Mobile SQLite (offline records)

The mobile app does not have its SQLite database yet (it runs on sample data).
When the offline story adds it, use SQLCipher, which `expo-sqlite` (SDK 57)
includes:

1. `npx expo install expo-sqlite expo-secure-store expo-crypto`
2. `app.json`: `"plugins": [["expo-sqlite", { "useSQLCipher": true }]]`.
   SQLCipher needs a development build (`npx expo run:android`); Expo Go does
   not include it.
3. Open the database with a random key kept in the phone's secure storage
   (Android Keystore / iOS Keychain), never in code. This sketch has not been run
   yet, because the app has no SQLite database to try it on:

```js
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export async function openEncryptedDb() {
  let key = await SecureStore.getItemAsync('db_key');
  if (!key) {
    key = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync('db_key', key);
  }
  const db = await SQLite.openDatabaseAsync('ctip.db');
  await db.execAsync(`PRAGMA key = "x'${key}'"`); // must be the first statement
  return db;
}
```

The Supabase session on the phone (CTIP-42) should also be kept with
`expo-secure-store` rather than plain AsyncStorage, because it contains the
refresh token.

### Photos

Photo metadata (EXIF GPS) is removed before a species photo is stored in the
public bucket (CTIP-85). Field photos stay in the private `observation-photos`
bucket.

## 3. Secrets

- `.env` and `.env.*` are git-ignored (except `.env.example`), see `.gitignore`.
- Committed: `services/api/.env.example`, `apps/web/.env.example`,
  `apps/mobile/.env.example`, all placeholders only.
- Only the **publishable** Supabase key goes in apps. The secret / service-role
  key is never in an app, and the API does not use it either.
- Hosting: set the values in the host's environment-variable settings, not in a
  file in the repo. CI needs no secrets today.
- Checked on 26 Oct 2026: the whole git history was searched for Supabase
  secret keys, JWTs, private keys and committed `.env` files; none were found.
- Recommended setting (repo admin): GitHub **Settings > Code security > Secret
  scanning > Push protection** on, so a pushed key is blocked before it lands.

## How to check (for the reassessment, CTIP-37)

| Check | Expected |
| --- | --- |
| `curl -i http://<api host>/v1/public/species` | `403 HTTPS_REQUIRED`, or the host refuses HTTP |
| `curl -i https://<api host>/v1/public/species` | `200` with a `Strict-Transport-Security` header |
| Start the API with `REQUIRE_HTTPS=true` and `SUPABASE_URL=http://...` | Refuses to start |
| `mosquitto_sub -h <broker> -p 1883 -t '#'` | Connection refused |
| `mosquitto_sub -h <broker> -p 8883 --cafile ca.crt -t '#'` without a password | Not authorised |
| Pull `ctip.db` off a test phone and open it with `sqlite3` | "file is not a database" |
| `git log --all -p \| grep -E "sb_secret_\|BEGIN PRIVATE KEY"` | No output |
