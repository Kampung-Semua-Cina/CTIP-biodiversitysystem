// apps/web/src/components/Shell.jsx
import Icon from "./Icon.jsx";
import { can, staffLinks, TOOLS_LABEL } from "../../../shared/permissions.js";
import { staffCounts } from "../../../shared/selectors.js";
import { useStore } from "../../../shared/store.js";

// Layout used by the dashboard and every staff page:
// a sidebar on the left (Library + the staff tools for this role)
// and the page content on the right. On narrower screens the sidebar is hidden and
// the staff tools show as a row of pills instead.
// `plain` pages lay out their own cards; other pages sit on one card.
export default function Shell({ seg, children, plain }) {
  const { role, db, me } = useStore();
  const links = staffLinks(role);
  const counts = staffCounts(db, me);
  const isOn = (to) => seg === to.slice(1);
  const link = (to, icon, text, badge) => (
    <a key={to} href={"#" + to} className={isOn(to) ? "on" : ""} aria-current={isOn(to) ? "page" : undefined}>
      <Icon name={icon} size={20} /> <span className="grow">{text}</span>
      {badge && counts[badge] > 0 && <b className={"count count-" + badge}>{counts[badge]}</b>}
    </a>
  );
  return (
    <div className="shell">
      <aside className="glass side" aria-label="Staff menu">
        <p className="overline toolslabel">Library</p>
        {link("/dashboard", "file", can(role, "allPlants") ? "Tagged plants" : "My plants")}
        {link("/plants", "leaf", "Species catalogue")}
        {links.length > 0 && <p className="overline toolslabel">{TOOLS_LABEL[role]}</p>}
        {links.map((l) => link(l.to, l.icon, l.label, l.badge))}
      </aside>
      <section className="content">
        {links.length > 0 && (
          <nav className="quick" aria-label="Staff tools">
            {links.map((l) => (
              <a key={l.to} href={"#" + l.to} className={"pill " + (isOn(l.to) ? "on" : "")}>{l.label}</a>
            ))}
          </nav>
        )}
        {plain ? children : <div className="glass pad shellcard">{children}</div>}
      </section>
    </div>
  );
}
