// apps/web/src/components/RoleSwitch.jsx
import { useStore } from "../../../shared/store.js";
import Icon from "./Icon.jsx";

// Local development bar at the very top of the page: live API status and a refresh.
// The role switch that used to sit here was removed: it no longer signed in, so
// it showed staff pages the API then refused. Use Staff sign in instead.
export default function RoleSwitch() {
  const { apiStatus, apiError, isSyncing, refreshFromBackend, authToken } = useStore();

  return (
    <div className="protobar">
      <div className="protobar-right">
        {authToken && (
          <span className="api-badge session" title="Signed in with verified Bearer token via /v1/me">
            <Icon name="user" size={12} /> Live Token
          </span>
        )}
        {apiStatus === "connected" ? (
          <span className="api-badge on" title="Connected to Daun Sense API (/v1)">
            <Icon name="wifi" size={12} /> API Connected
          </span>
        ) : apiStatus === "checking" ? (
          <span className="api-badge syncing" title="Checking API status...">
            <Icon name="refresh" size={12} /> Checking API...
          </span>
        ) : (
          <span className="api-badge off" role="status" title={apiError || "The API server is not answering"}>
            <Icon name="wifiOff" size={12} /> API Down
          </span>
        )}
        <button
          className="protobar-sync"
          onClick={refreshFromBackend}
          disabled={isSyncing}
          title="Refresh / Sync with Backend API"
          aria-label="Refresh / Sync with Backend API"
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
    </div>
  );
}
