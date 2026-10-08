import Icon from "./Icon.jsx";
import { staffLinks } from "../permissions.js";
import { useStore } from "../store.js";

// Layout used by the dashboard and every staff page:
// a sidebar on the left (Plant library + the staff links for this role)
// and the page content in a glass panel on the right.
export default function Shell({ seg, children }) {
  const { role } = useStore();
  const links = staffLinks(role);
  return (
    <div className="shell">
      <aside className="glass side" aria-label="Dashboard menu">
        <a href="#/dashboard" className={seg === "dashboard" ? "on" : ""}><Icon name="leaf" size={18} /> Plant library</a>
        {links.map((l) => (
          <a key={l.to} href={"#" + l.to} className={"staff " + (seg === l.to.slice(1) ? "on" : "")}>
            <Icon name={l.icon} size={18} /> {l.label}
          </a>
        ))}
      </aside>
      <section className="content">
        {links.length > 0 && (
          <div className="quick">
            {links.map((l) => (
              <a key={l.to} href={"#" + l.to} className={"pill " + (seg === l.to.slice(1) ? "on" : "")}>{l.label}</a>
            ))}
          </div>
        )}
        <div className="glass pad">{children}</div>
      </section>
    </div>
  );
}
