# IoT tests (VA-60 to VA-67): code review

- Date: 4 Nov 2026. Tester: Michelle
- Target: Norman's IoT files, sent on 4 Nov (not on `main` yet):
  - `wiretrap.ino`: ESP32 sensor node (DHT11, YL-69, HC-SR04, tripwire), publishes over MQTT
  - `Nodegateway.py`: MQTT gateway and laptop webcam capture, saves readings and photos
- Method: reading the code only. No traffic was sent to the broker, the API or Supabase
- Live tests (VA-60 to VA-67) wait until the team's own broker is set up (F-14 fix); the public broker is only observed, never attacked
- Screenshots: `docs/testing/iot/`

## Summary

| Test | Result |
|---|---|
| MQTT transport and login (VA-60, VA-61, by code) | **Fail**, F-14 (High) |
| Gateway input checks (VA-62, VA-63, by code) | **Fail**, F-15 (Medium) |
| Live tests VA-60 to VA-67 | Not run yet |

New problems: **F-14** (High), **F-15** (Medium).

## Results

| Test | What was checked | Expected (pass) | Result | Evidence | Finding |
|---|---|---|---|---|---|
| VA-60 (code) | Encryption between the node, the broker and the gateway | TLS (port 8883) | **Fail**. Node: `MQTT_BROKER = "broker.hivemq.com"`, `MQTT_PORT = 1883`, plain `WiFiClient`. Gateway: `BROKER = "broker.hivemq.com"`, `PORT = 1883`, no `tls_set` | I3-f14-public-broker-1883.png | F-14 |
| VA-61 (code) | Login to the broker | Username and password per device | **Fail**. Node connects with a client ID only (`mqttClient.connect(clientId)`); the gateway sets no username or password. The broker is a public test broker shared with anyone | I3-f14-public-broker-1883.png | F-14 |
| VA-62 (code) | Gateway checks the node ID | Only registered nodes accepted | **Fail** for readings: the node ID from the topic is used as is. Camera triggers check that it is a UUID (pass), but unregistered UUIDs are accepted | | F-15 |
| VA-63 (code) | Gateway checks the message content | Bad or unexpected values refused | **Partly**. Pass: bad JSON skipped, readings without `ts` skipped, only contract fields kept, photos capped at 2 MB, 5 s camera cooldown. **Fail**: trigger `source` goes into the photo file name unchecked; cooldown is per node ID, so new IDs bypass it; readings are not range-checked | | F-15 |
| VA-64 to VA-67 | Replay, flooding, node silent alert, device keys | | Not run yet. Need the team's own broker and `POST /telemetry` (still 501) | | |

## Findings from these tests

### F-14: Sensor readings go through a public MQTT broker with no TLS and no login (High, 3 × 2 = 6)

- **Problem:** the node and the gateway use the public test broker `broker.hivemq.com` on port 1883, with no TLS and no username or password.
- **Impact:** anyone on the internet can read every reading (and see when people are near an endangered plant), and publish fake readings or camera triggers that the gateway saves in the real database.
- **Recommendation:** the team's own Mosquitto broker with TLS on port 8883, a username and password per device, and an ACL so each device can only publish to its own topic.

### F-15: Gateway trusts the camera trigger's text and unregistered node IDs (Medium, 2 × 2 = 4)

- **Problem:** (1) the trigger's `source` is put into the photo file name, so a value with `..\` can save the photo outside the `captures` folder on the Windows laptop; (2) any UUID-shaped node ID is accepted, so the 5 s cooldown can be bypassed with new IDs; (3) readings are not range-checked.
- **Impact:** filling the laptop disk and the `sensor-images` bucket; fake values that raise or hide alerts. Only reachable while F-14 is open.
- **Recommendation:** allow only known sources (`motion`, `tripwire`); accept only node IDs registered in `sensor_nodes`; add an overall photo rate limit; check values in `POST /telemetry` once the gateway uses the API.

## Notes

- The Wi-Fi password is stored on the node (`secrets.h`, gitignored). Normal for a prototype; not a finding.
- Officers and admins see sensors through the website's Monitoring page (API routes are officer and admin only). The broker change does not affect them.
