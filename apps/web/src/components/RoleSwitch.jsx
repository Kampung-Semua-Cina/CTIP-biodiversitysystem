// apps/web/src/components/RoleSwitch.jsx
import { ROLES } from "../../../shared/permissions.js";
import { useStore } from "../../../shared/store.js";
import Icon from "./Icon.jsx";

// Demo bar at the very top of the page: switch role in prototype mode or view live backend status.
export default function RoleSwitch({ role, setRole }) {
  const { apiStatus, apiError, isSyncing, refreshFromBackend, authToken } = useStore();

  return (
    <div className="protobar">
      <div className="protobar-left">
        <span>Prototype · view the site as</span>
        <div className="roleswitch" role="radiogroup" aria-label="View the site as">
          {ROLES.map((r) => (
            <button
              key={r.key}
              role="radio"
              aria-checked={role === r.key}
              className={role === r.key ? "on" : ""}
              onClick={() => setRole(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

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
