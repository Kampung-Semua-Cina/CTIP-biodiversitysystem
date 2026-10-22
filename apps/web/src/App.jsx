// apps/web/src/App.jsx
// Needs one extra package:  npm i qrcode.react
// Styles are in App.css and theme.js. Sample data, the store and who-can-do-what live in apps/shared.

import { useEffect, useState } from "react";
import "./App.css";

import StoreProvider from "../../shared/StoreProvider.js";
import { useStore } from "../../shared/store.js";
import { useRoute } from "./useRoute.js";
import { can } from "../../shared/permissions.js";
import { themeVars, useThemeMode } from "./theme.js";

import { Navbar, Drawer, BottomBar, Footer } from "./components/Chrome.jsx";
import RoleSwitch from "./components/RoleSwitch.jsx";

import { Home, About, Contact, StaffPage, NoAccess, NotFound } from "./pages/Public.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Catalogue from "./pages/Catalogue.jsx";
import SpeciesPage from "./pages/SpeciesPage.jsx";
import Specimen from "./pages/Specimen.jsx";
import MapPage from "./pages/MapPage.jsx";
import AddPlant from "./pages/AddPlant.jsx";
import Records from "./pages/Records.jsx";
import Review from "./pages/Review.jsx";
import Reports from "./pages/Reports.jsx";
import Species from "./pages/Species.jsx";
import Monitoring from "./pages/Monitoring.jsx";
import { Users, Audit } from "./pages/Admin.jsx";
import Tags from "./pages/Tags.jsx";
import Notifications from "./pages/Notifications.jsx";
import Discussion from "./pages/Discussion.jsx";
import Account from "./pages/Account.jsx";

// Which permission (see permissions.js) a staff page needs.
const NEEDS = {
  add: "add", records: "records", review: "review", reports: "reports", species: "species",
  monitoring: "monitor", users: "users", audit: "audit", tags: "tags", notifications: "bell", discussion: "discuss",
  account: "pending", // any signed-in staff
};

function renderPage(seg, arg) {
  switch (seg) {
    case "": return <Home />;
    case "about": return <About />;
    case "contact": return <Contact />;
    case "staff": return <StaffPage />;
    case "login": return <Login />;
    case "dashboard": return <Dashboard arg={arg} />;
    case "plants": return arg ? <SpeciesPage key={arg} id={arg} /> : <Catalogue />;
    case "tag": return <Specimen key={arg} qr={arg} />;
    case "map": return <MapPage arg={arg} />;
    case "add": return <AddPlant />;
    case "records": return <Records />;
    case "review": return <Review />;
    case "reports": return <Reports />;
    case "species": return <Species />;
    case "monitoring": return <Monitoring />;
    case "users": return <Users />;
    case "audit": return <Audit />;
    case "tags": return <Tags />;
    case "notifications": return <Notifications />;
    case "discussion": return <Discussion arg={arg} />;
    case "account": return <Account />;
    default: return <NotFound />;
  }
}

function Site() {
  const { seg, arg } = useRoute();
  const { role, me, db, toast, setRole, logout } = useStore();
  const { mode, theme, setMode } = useThemeMode(); // Light, Dark, or follow the device (remembered)
  const [menuAt, setMenuAt] = useState(null); // the page the menu was opened on, so it closes when you move on

  const unread = me ? db.notifications.filter((n) => n.user_id === me.id && !n.is_read).length : 0;
  const menuOpen = menuAt === seg + arg;
  // Light/dark colours come from apps/shared/tokens.js as CSS variables (see theme.js).
  // A new page starts at the top (the hash router does not do this by itself).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seg, arg]);

  const needs = NEEDS[seg];
  const page = needs && !can(role, needs) ? <NoAccess /> : renderPage(seg, arg);

  return (
    <div className="site" data-theme={theme} style={themeVars(theme)}>
      <RoleSwitch role={role} setRole={setRole} />
      <Navbar seg={seg} role={role} me={me} unread={unread} mode={mode} theme={theme} onMode={setMode}
        onMenu={() => setMenuAt(seg + arg)} onLogout={() => { logout(); window.location.hash = "/"; }} />
      {menuOpen && <Drawer role={role} mode={mode} onMode={setMode} onClose={() => setMenuAt(null)} />}

      {/* key: each page change remounts <main>, which replays its entrance animation */}
      <main id="main" key={seg + "/" + arg}>{page}</main>

      <BottomBar role={role} seg={seg} unread={unread} />
      <Footer role={role} mode={mode} onMode={setMode} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider deviceId="web">
      <Site />
    </StoreProvider>
  );
}
