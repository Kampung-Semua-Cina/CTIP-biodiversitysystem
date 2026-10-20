// apps/web/src/components/Chrome.jsx
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { SITE, PARK, NAV } from "../../../shared/site.js";
import { bottomLinks, staffLinks, ROLE_LABEL, TOOLS_LABEL } from "../../../shared/permissions.js";
import { initials } from "../../../shared/utils.js";

// "Plants" stays highlighted on species, plant and table pages too.
const navOn = (to, seg) => seg === to.slice(1) || (to === "/plants" && ["tag", "dashboard"].includes(seg));

// The parts of the page that stay the same everywhere:
// top navbar, phone side menu, phone bottom bar, footer, and the theme switch.

const THEMES = [
  { key: "light", label: "Light", icon: "sun" },
  { key: "dark", label: "Dark", icon: "moon" },
  { key: "device", label: "Device", icon: "monitor" },
];

// Light / Dark / Device. "Device" follows the computer or phone setting.
export function ThemeSwitch({ mode, onMode }) {
  return (
    <div className="themeswitch" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button key={t.key} type="button" role="radio" aria-checked={mode === t.key} className={mode === t.key ? "on" : ""} onClick={() => onMode(t.key)}>
          <Icon name={t.icon} size={16} /> {t.label}
        </button>
      ))}
    </div>
  );
}

// Header button that opens the theme switch in a small popover.
function ThemeMenu({ mode, theme, onMode }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => (e.key === "Escape" || (e.type === "pointerdown" && !box.current?.contains(e.target))) && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="thememenu" ref={box}>
      <button className="ic boxed" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Theme">
        <Icon name={theme === "light" ? "sun" : "moon"} />
      </button>
      {open && (
        <div className="popover">
          <p className="overline">Theme</p>
          <ThemeSwitch mode={mode} onMode={(m) => { onMode(m); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

export function Navbar({ seg, role, me, unread, mode, theme, onMode, onMenu, onLogout }) {
  return (
    <header className="top">
      <div className="topinner">
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
          <ThemeMenu mode={mode} theme={theme} onMode={onMode} />
          {role === "visitor" ? (
            <a className="btn ghost signin" href="#/staff"><Icon name="user" size={18} /> Staff sign in</a>
          ) : (
            <>
              <a className="ic bell" href="#/notifications" aria-label={`Notifications, ${unread} unread`}>
                <Icon name="bell" size={22} />
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
      </div>
    </header>
  );
}

export function Drawer({ role, mode, onMode, onClose }) {
  const links = [{ to: "/", label: "Home", icon: "home" }, { to: "/plants", label: "Plants", icon: "leaf" }, { to: "/map", label: "Map", icon: "map" }, { to: "/about", label: "About us", icon: "info" }, { to: "/contact", label: "Contact", icon: "chat" }];
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Menu">
        <button className="ic" onClick={onClose} aria-label="Close menu"><Icon name="x" /></button>
        {links.map((l) => <a key={l.to} href={"#" + l.to} onClick={onClose}><Icon name={l.icon} size={20} /> {l.label}</a>)}
        {staffLinks(role).length > 0 && <p className="overline toolslabel">{TOOLS_LABEL[role]}</p>}
        {staffLinks(role).map((l) => (
          <a key={l.to} href={"#" + l.to} onClick={onClose}><Icon name={l.icon} size={20} /> {l.label}</a>
        ))}
        <div className="grow" />
        <p className="overline toolslabel">Theme</p>
        <ThemeSwitch mode={mode} onMode={onMode} />
        {role === "visitor" && <a href="#/staff" onClick={onClose}><Icon name="user" size={20} /> Staff sign in</a>}
      </aside>
    </div>
  );
}

export function BottomBar({ role, seg, unread }) {
  return (
    <nav className="bottom" aria-label="Quick links">
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

export function Footer({ mode, onMode }) {
  return (
    <footer className="foot">
      <div className="footinner">
        <span>© 2026 {SITE} · {PARK}</span>
        <span className="footlinks">
          <a href="#/about">About us</a>
          <a href="#/contact">Contact</a>
          <a href="#/staff">Staff sign in</a>
        </span>
        <ThemeSwitch mode={mode} onMode={onMode} />
      </div>
    </footer>
  );
}
