// The web app's API client (CTIP-54). Usage: see apps/shared/apiClient.js.
// VITE_API_URL comes from apps/web/.env (copy .env.example).
import { createApiClient, ApiError } from "../../shared/apiClient.js";

export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL });
export { ApiError };
