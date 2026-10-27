// apps/web/src/api.js
// Express API client for the web application (CTIP-54).
import { createApiClient, ApiError } from "../../shared/apiClient.js";
import { getApiBaseUrl } from "../../shared/api.js";

export const api = createApiClient({
  baseUrl: getApiBaseUrl(),
});

export { ApiError };
export * from "../../shared/api.js";
