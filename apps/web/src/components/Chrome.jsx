// web/src/components/Chrome.jsx
import Icon from "./Icon.jsx";
import { SITE, PARK, NAV } from "../site.js";
import { bottomLinks, staffLinks } from "../permissions.js";
import { initials } from "../utils.js";

// The parts of the page that stay the same everywhere:
// top navbar, phone side menu, phone bottom bar, and footer.

export function Navbar({ seg, role, me, unread, light, onTheme, onMenu, onLogout }) {
  return (
    <header className="glass top">
      <button className="ic drawerbtn" onClick={onMenu} aria-label="Open menu"><Icon name="menu" /></button>
      <a className="logo" href="#/">
        <img src="/logo.svg" alt="" />
        <span>{SITE}</span>
      </a>
      <nav className="links" aria-label="Main">
        {NAV.map((l) => (
          <a key={l.to} href={"#" + l.to} className={seg === l.to.slice(1) ? "on" : ""}>{l.label}</a>
        ))}
      </nav>
      <div className="right">
        <button className="ic" onClick={onTheme} aria-label={light ? "Switch to dark mode" : "Switch to light mode"}>
          <Icon name={light ? "moon" : "sun"} />
        </button>
        {role === "visitor" ? (
          <a className="btn staff" href="#/staff"><Icon name="user" size={16} /> Staff</a>
        ) : (
          <>
            <a className="ic bell" href="#/notifications" aria-label={`Notifications, ${unread} unread`}>
              <Icon name="bell" />
              {unread > 0 && <b className="badge">{unread}</b>}
            </a>
            <span className="avatar" title={me.full_name}>{initials(me.full_name)}</span>
            <button className="ic" onClick={onLogout} aria-label="Sign out"><Icon name="logout" /></button>
          </>
        )}
      </div>
    </header>
  );
}

export function Drawer({ role, light, onTheme, onClose }) {
  const links = [{ to: "/", label: "Home" }, { to: "/dashboard", label: "Dashboard" }, { to: "/map", label: "Map" }, { to: "/contact", label: "Contact" }];
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="glass drawer" onClick={(e) => e.stopPropagation()} aria-label="Menu">
        <button className="ic" onClick={onClose} aria-label="Close menu"><Icon name="menu" /></button>
        {links.map((l) => <a key={l.to} href={"#" + l.to} onClick={onClose}>{l.label}</a>)}
        {staffLinks(role).length > 0 && <hr />}
        {staffLinks(role).map((l) => (
          <a key={l.to} className="staff" href={"#" + l.to} onClick={onClose}><Icon name={l.icon} size={18} /> {l.label}</a>
        ))}
        <div className="grow" />
        <a onClick={onTheme}><Icon name={light ? "moon" : "sun"} size={18} /> {light ? "Dark mode" : "Light mode"}</a>
        <a href="#/staff" onClick={onClose}><Icon name="user" size={18} /> Staff</a>
        <a href="#/about" onClick={onClose}><Icon name="info" size={18} /> About app</a>
      </aside>
    </div>
  );
}

export function BottomBar({ role, seg, unread }) {
  return (
    <nav className="glass bottom" aria-label="Quick links">
      {bottomLinks(role).map((l) => (
        <a key={l.to} href={"#" + l.to} className={(l.staff ? "staff " : "") + (seg === l.to.slice(1) ? "on" : "")}>
          <span className="bi"><Icon name={l.icon} size={22} />{l.icon === "bell" && unread > 0 && <b className="badge">{unread}</b>}</span>
          {l.label}
        </a>
      ))}
    </nav>
  );
}

export function Footer({ light, onTheme }) {
  return (
    <footer className="glass foot">
      <span>© 2026 {SITE} · {PARK}</span>
      <span className="footlinks">
        <a href="#/about">About us</a>
        <a href="#/contact">Contact</a>
        <a href="#/staff">Staff</a>
      </span>
      <a onClick={onTheme}>{light ? "Dark mode" : "Light mode"}</a>
    </footer>
  );
}
