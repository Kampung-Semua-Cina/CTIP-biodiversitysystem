// apps/mobile/apiAddress.js
// Where the phone finds the Express API (services/api). On a phone "localhost"
// is the phone itself, so in order:
//   1. EXPO_PUBLIC_API_URL from apps/mobile/.env or eas.json (APK builds, tunnel mode)
//   2. In development, the computer running `npx expo start`: the app's code
//      comes from there (Constants.expoConfig.hostUri, e.g. 192.168.1.20:8081),
//      so the API on port 8000 of the same computer is reachable too
//   3. localhost, which only works in a web browser on the same computer
import Constants from 'expo-constants';

import { setApiBaseUrl } from '../shared/api.js';

const API_PORT = 8000;

// A host on the local network: an IP address, localhost or a .local name.
// Tunnel hosts (*.exp.direct) only forward the Expo dev server, not the API.
const isLocalHost = (host) => /^(\d{1,3}(\.\d{1,3}){3}|localhost|[\w-]+\.local)$/i.test(host);

export function configureApiAddress() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return setApiBaseUrl(`${fromEnv.replace(/\/+$/, '')}/v1`);

  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost && isLocalHost(devHost)) return setApiBaseUrl(`http://${devHost}:${API_PORT}/v1`);

  if (__DEV__) {
    console.warn('API address unknown: set EXPO_PUBLIC_API_URL in apps/mobile/.env, e.g. http://192.168.1.20:8000');
  }
}
