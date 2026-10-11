// apps/web/src/components/Chrome.jsx
import Icon from "./Icon.jsx";
import { SITE, PARK, NAV } from "../site.js";
import { bottomLinks, staffLinks, ROLE_LABEL, TOOLS_LABEL } from "../permissions.js";
import { initials } from "../utils.js";

// "Plants" stays highlighted on species, plant and table pages too.
const navOn = (to, seg) => seg === to.slice(1) || (to === "/plants" && ["tag", "dashboard"].includes(seg));

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
          <a key={l.to} href={"#" + l.to} className={navOn(l.to, seg) ? "on" : ""} aria-current={navOn(l.to, seg) ? "page" : undefined}>{l.label}</a>
        ))}
      </nav>
      <div className="right">
        <button className="ic" onClick={onTheme} aria-label={light ? "Switch to dark mode" : "Switch to light mode"}>
          <Icon name={light ? "moon" : "sun"} />
        </button>
        {role === "visitor" ? (
          <a className="btn ghost" href="#/staff"><Icon name="user" size={16} /> Staff sign in</a>
        ) : (
          <>
            <a className="ic bell" href="#/notifications" aria-label={`Notifications, ${unread} unread`}>
              <Icon name="bell" />
              {unread > 0 && <b className="badge">{unread}</b>}
            </a>
            <span className="who">
              <span className="avatar" aria-hidden="true">{initials(me.full_name)}</span>
              <span className="whoname"><b>{me.full_name}</b><small>{ROLE_LABEL[me.role]}</small></span>
            </span>
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
        {staffLinks(role).length > 0 && <p className="toolslabel"><Icon name="lock" size={13} /> {TOOLS_LABEL[role]}</p>}
        {staffLinks(role).map((l) => (
          <a key={l.to} href={"#" + l.to} onClick={onClose}><Icon name={l.icon} size={18} /> {l.label}</a>
        ))}
        <div className="grow" />
        <a onClick={onTheme}><Icon name={light ? "moon" : "sun"} size={18} /> {light ? "Dark mode" : "Light mode"}</a>
        <a href="#/staff" onClick={onClose}><Icon name="user" size={18} /> Staff sign in</a>
        <a href="#/about" onClick={onClose}><Icon name="info" size={18} /> About app</a>
      </aside>
    </div>
  );
}

export function BottomBar({ role, seg, unread }) {
  return (
    <nav className="glass bottom" aria-label="Quick links">
      {bottomLinks(role).map((l) => (
        <a key={l.to} href={"#" + l.to} className={(l.main ? "main " : "") + (seg === l.to.slice(1) ? "on" : "")}
          aria-current={seg === l.to.slice(1) ? "page" : undefined}>
          <span className="bi"><Icon name={l.icon} size={l.main ? 26 : 22} />{l.bell && unread > 0 && <b className="badge">{unread}</b>}</span>
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
        <a href="#/staff">Staff sign in</a>
      </span>
      <a onClick={onTheme}>{light ? "Dark mode" : "Light mode"}</a>
    </footer>
  );
}
