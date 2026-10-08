import Icon from "./Icon.jsx";
import { ROLES } from "../permissions.js";

// Demo switch: icons only. Hover or long-press shows the role name.
// Remove this when the real login decides the role.
export default function RoleSwitch({ role, setRole }) {
  return (
    <div className="roleswitch glass" role="radiogroup" aria-label="View the site as">
      {ROLES.map((r) => (
        <button
          key={r.key}
          role="radio"
          aria-checked={role === r.key}
          className={role === r.key ? "on" : ""}
          title={r.label}
          aria-label={r.label}
          onClick={() => setRole(r.key)}
        >
          <Icon name={r.icon} />
        </button>
      ))}
    </div>
  );
}
