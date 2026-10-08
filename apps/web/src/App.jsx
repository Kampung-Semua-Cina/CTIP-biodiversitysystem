// web/src/App.jsx
// Needs one extra package:  npm i qrcode.react
// Styles are in App.css. Sample data is in data.js. Who-can-do-what is in permissions.js.

import { useState } from "react";
import "./App.css";

import StoreProvider from "./StoreProvider.jsx";
import { useStore } from "./store.js";
import { useRoute } from "./useRoute.js";
import { can } from "./permissions.js";

import { Navbar, Drawer, BottomBar, Footer } from "./components/Chrome.jsx";
import RoleSwitch from "./components/RoleSwitch.jsx";

import { Home, About, Contact, StaffPage, NoAccess, NotFound } from "./pages/Public.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
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

// Which permission (see permissions.js) a staff page needs.
const NEEDS = {
  add: "add", records: "records", review: "review", reports: "reports", species: "species",
  monitoring: "monitor", users: "users", audit: "audit", tags: "tags", notifications: "bell", discussion: "discuss",
};

function renderPage(seg, arg) {
  switch (seg) {
    case "": return <Home />;
    case "about": return <About />;
    case "contact": return <Contact />;
    case "staff": return <StaffPage />;
    case "login": return <Login />;
    case "dashboard": return <Dashboard arg={arg} />;
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
    default: return <NotFound />;
  }
}

function Site() {
  const { seg, arg } = useRoute();
  const { role, me, db, toast, setRole, logout } = useStore();
  const [light, setLight] = useState(false);
  const [menuAt, setMenuAt] = useState(null); // the page the menu was opened on, so it closes when you move on

  const unread = me ? db.notifications.filter((n) => n.user_id === me.id && !n.is_read).length : 0;
  const menuOpen = menuAt === seg + arg;
  const toggleTheme = () => setLight(!light);

  // Light/dark colours are switched with data-theme (see App.css).
  const needs = NEEDS[seg];
  const page = needs && !can(role, needs) ? <NoAccess /> : renderPage(seg, arg);

  return (
    <div className="site" data-theme={light ? "light" : "dark"}>
      <div className="bg" />
      <Navbar seg={seg} role={role} me={me} unread={unread} light={light} onTheme={toggleTheme}
        onMenu={() => setMenuAt(seg + arg)} onLogout={() => { logout(); window.location.hash = "/"; }} />
      {menuOpen && <Drawer role={role} light={light} onTheme={toggleTheme} onClose={() => setMenuAt(null)} />}

      <main>{page}</main>

      <BottomBar role={role} seg={seg} unread={unread} />
      <Footer light={light} onTheme={toggleTheme} />
      <RoleSwitch role={role} setRole={setRole} />
      {toast && <div className="glass toast" role="status">{toast}</div>}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Site />
    </StoreProvider>
  );
}
