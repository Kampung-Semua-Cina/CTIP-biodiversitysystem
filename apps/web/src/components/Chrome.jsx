// apps/web/src/components/Chrome.jsx
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { Avatar } from "./Bits.jsx";
import { SITE, PARK, NAV } from "../site.js";
import { bottomLinks, staffLinks, ROLE_LABEL, TOOLS_LABEL, DASHBOARD_LABEL } from "../permissions.js";

// "Plants" stays highlighted on plant pages too, and on #/dashboard for visitors (it shows them the catalogue).
const navOn = (to, seg, role) => seg === to.slice(1) || (to === "/plants" && (seg === "tag" || (seg === "dashboard" && !DASHBOARD_LABEL[role])));

// Staff swap About us and Contact for a link to their own role's dashboard, last so it sits by the theme button.
// Visitors have no dashboard.
const STAFF_HIDDEN = ["/about", "/contact"];
const navLinks = (role) =>
  DASHBOARD_LABEL[role]
    ? [...NAV.filter((l) => !STAFF_HIDDEN.includes(l.to)), { to: "/dashboard", label: "Dashboard", title: DASHBOARD_LABEL[role] }]
    : NAV;

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
        {navLinks(role).map((l) => (
          <a key={l.to} href={"#" + l.to} title={l.title} className={navOn(l.to, seg, role) ? "on" : ""} aria-current={navOn(l.to, seg, role) ? "page" : undefined}>{l.label}</a>
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
            <ProfileMenu me={me} seg={seg} unread={unread} onLogout={onLogout} />
          </>
        )}
      </div>
    </header>
  );
}

// Profile button in the navbar. Clicking it slides down a small menu with
// Account settings, Notifications and Sign out. Closes on a click outside, Escape, or moving to another page.
// The unread count sits on the profile picture while the menu is closed, and moves onto the
// Notifications bell inside the menu while it is open.
function ProfileMenu({ me, seg, unread, onLogout }) {
  const [openAt, setOpenAt] = useState(null); // the page it was opened on, so it closes when you move on
  const open = openAt === seg;
  const setOpen = (on) => setOpenAt(on ? seg : null);
  const box = useRef(null);
  const btn = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="profile" ref={box}>
      <button ref={btn} className="who" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="profilemenu"
        aria-label={`Account menu for ${me.full_name}` + (unread > 0 ? `, ${unread} unread notification${unread > 1 ? "s" : ""}` : "")}>
        <span className="badged">
          <Avatar user={me} />
          {unread > 0 && <b className={"badge" + (open ? " gone" : "")} aria-hidden="true">{unread}</b>}
        </span>
        <span className="whoname"><b>{me.full_name}</b><small>{ROLE_LABEL[me.role]}</small></span>
        <Icon name="chevD" size={16} />
      </button>
      <div id="profilemenu" className={"glass menu" + (open ? " open" : "")}>
        <div className="menuhead">
          <Avatar user={me} />
          <span className="whoname"><b>{me.full_name}</b><small>@{me.username} · {ROLE_LABEL[me.role]}</small></span>
        </div>
        <a href="#/account" onClick={() => setOpen(false)}><Icon name="settings" size={18} /> Account settings</a>
        <a href="#/notifications" onClick={() => setOpen(false)}>
          <span className="badged"><Icon name="bell" size={18} />{unread > 0 && open && <b className="badge">{unread}</b>}</span>
          <span className="grow">Notifications</span>
          {unread > 0 && <span className="mute small">{unread} unread</span>}
        </a>
        <button className="item danger" onClick={() => { setOpen(false); onLogout(); }}><Icon name="logout" size={18} /> Sign out</button>
      </div>
    </div>
  );
}

export function Drawer({ role, light, onTheme, onClose }) {
  const middle = DASHBOARD_LABEL[role] ? { to: "/dashboard", label: DASHBOARD_LABEL[role] } : { to: "/plants", label: "Plants" };
  const links = [{ to: "/", label: "Home" }, middle, { to: "/map", label: "Map" }, { to: "/contact", label: "Contact" }];
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
        {role === "visitor"
          ? <a href="#/staff" onClick={onClose}><Icon name="user" size={18} /> Staff sign in</a>
          : <a href="#/account" onClick={onClose}><Icon name="settings" size={18} /> Account settings</a>}
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

export function Footer({ role, light, onTheme }) {
  return (
    <footer className="glass foot">
      <span>© 2026 {SITE} · {PARK}</span>
      <span className="footlinks">
        <a href="#/about">About us</a>
        <a href="#/contact">Contact</a>
        {role === "visitor" && <a href="#/staff">Staff sign in</a>}
      </span>
      <a onClick={onTheme}>{light ? "Dark mode" : "Light mode"}</a>
    </footer>
  );
}
