// apps/web/src/components/Chrome.jsx
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { Avatar } from "./Bits.jsx";
import { SITE, PARK, NAV, FORESTRY, PARK_MAP } from "../../../shared/site.js";
import { useStore } from "../../../shared/store.js";
import { visiblePlants, staffCounts } from "../../../shared/selectors.js";
import { bottomLinks, staffLinks, ROLE_LABEL, TOOLS_LABEL, DASHBOARD_LABEL } from "../../../shared/permissions.js";

// "Plants" is the public species catalogue for everyone, and stays highlighted on plant pages.
// Visitors who open #/dashboard see the catalogue too, so "Plants" stays highlighted for them there.
const navOn = (to, seg, role) =>
  seg === to.slice(1) || (to === "/plants" && (seg === "tag" || (seg === "dashboard" && !DASHBOARD_LABEL[role])));

// Staff swap About us and Contact (still in the footer) for a link to their own role's dashboard.
// Visitors have no dashboard.
const STAFF_HIDDEN = ["/about", "/contact"];
const navLinks = (role) =>
  DASHBOARD_LABEL[role]
    ? [...NAV.filter((l) => !STAFF_HIDDEN.includes(l.to)), { to: "/dashboard", label: "Dashboard", title: DASHBOARD_LABEL[role] }]
    : NAV;

// The parts of the page that stay the same everywhere:
// top navbar, account menu, phone side menu, phone bottom bar, footer, and the theme switch.

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
          {navLinks(role).map((l) => (
            <a key={l.to} href={"#" + l.to} title={l.title} className={navOn(l.to, seg, role) ? "on" : ""}
              aria-current={navOn(l.to, seg, role) ? "page" : undefined}>{l.label}</a>
          ))}
        </nav>
        <div className="right">
          <ThemeMenu mode={mode} theme={theme} onMode={onMode} />
          {role === "visitor"
            ? <a className="btn ghost signin" href="#/staff"><Icon name="user" size={18} /> Staff sign in</a>
            : <AccountMenu me={me} seg={seg} unread={unread} onLogout={onLogout} />}
        </div>
      </div>
    </header>
  );
}

// The staff member's photo, name and role. Clicking it opens a small menu with
// Account settings, Notifications and Sign out. It closes on a click outside, on Escape,
// and when you move to another page.
// The unread count sits on the photo while the menu is closed, and moves onto the
// Notifications bell inside the menu while it is open.
function AccountMenu({ me, seg, unread, onLogout }) {
  const [openAt, setOpenAt] = useState(null); // the page it was opened on, so it closes when you move on
  const open = openAt === seg;
  const box = useRef(null);
  const btn = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpenAt(null); };
    const esc = (e) => { if (e.key === "Escape") { setOpenAt(null); btn.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const close = () => setOpenAt(null);
  const name = `Account menu for ${me.full_name}` + (unread > 0 ? `, ${unread} unread notification${unread > 1 ? "s" : ""}` : "");

  return (
    <div className="account" ref={box}>
      <button ref={btn} className="who" onClick={() => setOpenAt(open ? null : seg)}
        aria-expanded={open} aria-controls="accountmenu" aria-label={name}>
        <span className="badged">
          <Avatar user={me} />
          {unread > 0 && <b className={"badge" + (open ? " gone" : "")} aria-hidden="true">{unread}</b>}
        </span>
        <span className="whoname"><b>{me.full_name}</b><small>{ROLE_LABEL[me.role]}</small></span>
        <Icon name="chevD" size={16} />
      </button>
      <div id="accountmenu" className={"menu" + (open ? " open" : "")}>
        <div className="menuhead">
          <Avatar user={me} />
          <span className="whoname"><b>{me.full_name}</b><small>@{me.username} · {ROLE_LABEL[me.role]}</small></span>
        </div>
        <a href="#/account" onClick={close}><Icon name="settings" size={20} /> Account settings</a>
        <a href="#/notifications" onClick={close}>
          <span className="badged"><Icon name="bell" size={20} />{unread > 0 && open && <b className="badge">{unread}</b>}</span>
          <span className="grow">Notifications</span>
          {unread > 0 && <span className="menucount">{unread} unread</span>}
        </a>
        <hr />
        <button className="item danger" onClick={() => { close(); onLogout(); }}><Icon name="logout" size={20} /> Sign out</button>
      </div>
    </div>
  );
}

export function Drawer({ role, mode, onMode, onClose }) {
  const staff = !!DASHBOARD_LABEL[role];
  const links = [
    { to: "/", label: "Home", icon: "home" },
    staff && { to: "/dashboard", label: DASHBOARD_LABEL[role], icon: "dashboard" },
    { to: "/plants", label: "Plants", icon: "leaf" },
    { to: "/map", label: "Map", icon: "map" },
    { to: "/about", label: "About us", icon: "info" },
    { to: "/contact", label: "Contact", icon: "chat" },
  ].filter(Boolean);
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
        {staff
          ? <a href="#/account" onClick={onClose}><Icon name="settings" size={20} /> Account settings</a>
          : <a href="#/staff" onClick={onClose}><Icon name="user" size={20} /> Staff sign in</a>}
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

// Footer: brand and park, live counts, link columns, and a bottom bar.
// The third column and the counts change with the role: visitors get "Staff sign in",
// staff get their own tools and the counts that need their attention.
// On phones the link columns fold into tap-to-open sections.
const FOOT_COLS = [
  { title: "Explore", links: [{ to: "/", label: "Home" }, { to: "/plants", label: "Plant catalogue" }, { to: "/map", label: "Plant map" }] },
  { title: "About", links: [{ to: "/about", label: "About us" }, { to: "/contact", label: "Contact" }, { href: FORESTRY, label: "Sarawak Forestry" }] },
];

export function Footer({ role, mode, onMode }) {
  const { db, me } = useStore();
  const staff = !!DASHBOARD_LABEL[role];
  const plants = visiblePlants(db, role);
  const species = db.species.filter((s) => !s.is_deleted && (staff || s.is_published)).length;
  const endangered = plants.filter((p) => p.endangered).length;
  const counts = staffCounts(db, me);

  // Counts that need this role's attention, shown after the general ones.
  const alerts = { n: counts.alerts, label: counts.alerts === 1 ? "open alert" : "open alerts", to: "/monitoring" };
  const todo = {
    botanist: [{ n: counts.returned, label: "returned to you", to: "/records" }],
    officer: [{ n: counts.review, label: "awaiting review", to: "/review" }, alerts],
    admin: [alerts],
  }[role] || [];

  const staffCol = staff
    ? { title: TOOLS_LABEL[role], links: [{ to: "/dashboard", label: DASHBOARD_LABEL[role] }, ...staffLinks(role), { to: "/notifications", label: "Notifications" }, { to: "/account", label: "Account settings" }] }
    : { title: "Park staff", links: [{ to: "/staff", label: "Staff sign in" }] };

  return (
    <footer className="foot">
      <svg className="footwave" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
        <path className="fill" d="M0 40V22c120-14 240-18 360-8s240 22 360 12 240-26 360-24 240 12 360 18v20Z" />
        <path className="edge" d="M0 22c120-14 240-18 360-8s240 22 360 12 240-26 360-24 240 12 360 18" />
      </svg>
      <div className="footbody">
        <div className="footgrid">
          <div className="footbrand">
            <a className="logo" href="#/">
              <img src="/logo.svg" alt="" />
              <span>{SITE}</span>
            </a>
            <p>Tagging and monitoring the plant life of {PARK}, one QR tag at a time.</p>
            <a className="footmeta" href={PARK_MAP} target="_blank" rel="noreferrer" title="Open in Google Maps">
              <Icon name="pin" size={18} /> {PARK}, Miri, Sarawak ↗
            </a>
            <ul className="plain footstats" aria-label="Plant counts">
              <li><a href="#/plants"><b>{plants.length}</b> {staff ? "plants tagged" : "plants to explore"}</a></li>
              <li><a href="#/plants"><b>{species}</b> species</a></li>
              <li><b>{endangered}</b> endangered</li>
              {todo.map((t) => (
                <li key={t.label} className={t.n > 0 ? "todo" : ""}><a href={"#" + t.to}><b>{t.n}</b> {t.label}</a></li>
              ))}
            </ul>
          </div>
          {[...FOOT_COLS, staffCol].map((c) => <FootCol key={c.title} {...c} />)}
        </div>
        <div className="footbar">
          <span>
            © 2026 {SITE} · A CTIP project
            {me && <> · Signed in as <b>{me.full_name}</b> ({ROLE_LABEL[me.role]})</>}
          </span>
          <span className="footactions">
            <ThemeSwitch mode={mode} onMode={onMode} />
            <button className="btn ghost small-btn totop" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              Back to top <Icon name="chevD" size={16} />
            </button>
          </span>
        </div>
      </div>
    </footer>
  );
}

// One link column. Always open on wide screens; a tap-to-open section on phones.
function FootCol({ title, links }) {
  const phone = useMedia("(max-width: 800px)");
  const [open, setOpen] = useState(false);
  return (
    <details className="footcol" open={!phone || open} onToggle={(e) => phone && setOpen(e.currentTarget.open)}>
      <summary tabIndex={phone ? 0 : -1} onClick={(e) => !phone && e.preventDefault()}>
        {title} <Icon name="chevD" size={16} />
      </summary>
      <ul className="plain">
        {links.map((l) => (
          <li key={l.label}>
            {l.href
              ? <a href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>
              : <a href={"#" + l.to}>{l.label}</a>}
          </li>
        ))}
      </ul>
    </details>
  );
}

// True while the media query matches, for example "(max-width: 800px)".
function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const change = () => setOn(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, [query]);
  return on;
}
