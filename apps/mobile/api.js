// apps/mobile/api.js
// The mobile app's API client (CTIP-54). Usage: see apps/shared/apiClient.js.
// EXPO_PUBLIC_API_URL comes from apps/mobile/.env (copy .env.example).
import { createApiClient, ApiError } from '../shared/apiClient.js';

export const api = createApiClient({ baseUrl: process.env.EXPO_PUBLIC_API_URL });
export { ApiError };
