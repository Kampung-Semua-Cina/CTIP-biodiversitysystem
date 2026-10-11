import Icon from "./Icon.jsx";
import { staffLinks, TOOLS_LABEL } from "../permissions.js";
import { staffCounts } from "../selectors.js";
import { useStore } from "../store.js";

// Layout used by the dashboard and every staff page:
// a sidebar on the left (Plant library + the staff tools for this role)
// and the page content on the right. On phones the sidebar is hidden and
// the staff tools show as a row of pills instead.
export default function Shell({ seg, children, plain }) {
  const { role, db, me } = useStore();
  const links = staffLinks(role);
  const counts = staffCounts(db, me);
  const isOn = (to) => seg === to.slice(1);
  return (
    <div className="shell">
      <aside className="glass side" aria-label="Dashboard menu">
        <a href="#/dashboard" className={isOn("/dashboard") ? "on" : ""} aria-current={isOn("/dashboard") ? "page" : undefined}>
          <Icon name="file" size={18} /> Tagged plants
        </a>
        <a href="#/plants">
          <Icon name="leaf" size={18} /> Species catalogue
        </a>
        {links.length > 0 && <p className="toolslabel"><Icon name="lock" size={13} /> {TOOLS_LABEL[role]}</p>}
        {links.map((l) => (
          <a key={l.to} href={"#" + l.to} className={isOn(l.to) ? "on" : ""} aria-current={isOn(l.to) ? "page" : undefined}>
            <Icon name={l.icon} size={18} /> <span className="grow">{l.label}</span>
            {l.badge && counts[l.badge] > 0 && <b className={"count count-" + l.badge}>{counts[l.badge]}</b>}
          </a>
        ))}
      </aside>
      <section className="content">
        {links.length > 0 && (
          <nav className="quick" aria-label="Staff tools">
            {links.map((l) => (
              <a key={l.to} href={"#" + l.to} className={"pill " + (isOn(l.to) ? "on" : "")}>{l.label}</a>
            ))}
          </nav>
        )}
        {plain ? children : <div className="glass pad">{children}</div>}
      </section>
    </div>
  );
}
