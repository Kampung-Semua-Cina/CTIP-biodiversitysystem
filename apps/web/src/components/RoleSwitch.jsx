// apps/web/src/components/RoleSwitch.jsx
import { ROLES } from "../../../shared/permissions.js";

// Demo bar at the very top of the page: switch which role you are viewing the site as.
// It sits above the navbar so it never covers page content.
// Remove this when the real login decides the role.
export default function RoleSwitch({ role, setRole }) {
  return (
    <div className="protobar">
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
  );
}
