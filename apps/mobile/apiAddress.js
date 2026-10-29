// apps/mobile/apiAddress.js
// Where the phone finds the Express API (services/api). Points to the remote Render API.
import { setApiBaseUrl } from '../shared/api.js';

export const REMOTE_API_URL = 'https://ctip-biodiversitysystem.onrender.com/v1';

export function configureApiAddress() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return setApiBaseUrl(`${fromEnv.replace(/\/+$/, '')}/v1`);
  return setApiBaseUrl(REMOTE_API_URL);
}
