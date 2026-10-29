// apps/web/src/components/Site.jsx
// Main application layout shell for web: navbar, drawer, active page, bottom bar, footer, and toast.
import { useEffect, useState } from "react";
import { useRoute } from "../useRoute.js";
import { useStore } from "../../../shared/store.js";
import { themeVars, useThemeMode } from "../theme.js";
import { Navbar, Drawer, BottomBar, Footer } from "./Chrome.jsx";
import RoleSwitch from "./RoleSwitch.jsx";
import RouteView from "./RouteView.jsx";

export default function Site() {
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

  return (
    <div className="site" data-theme={theme} style={themeVars(theme)}>
      {/* Local development only (CTIP-113): it signs in to the real demo accounts. */}
      {import.meta.env.DEV && <RoleSwitch role={role} setRole={setRole} />}
      <Navbar
        seg={seg}
        role={role}
        me={me}
        unread={unread}
        mode={mode}
        theme={theme}
        onMode={setMode}
        onMenu={() => setMenuAt(seg + arg)}
        onLogout={() => {
          logout();
          window.location.hash = "/";
        }}
      />
      {menuOpen && <Drawer role={role} mode={mode} onMode={setMode} onClose={() => setMenuAt(null)} />}

      {/* key: each page change remounts <main>, which replays its entrance animation */}
      <main id="main" key={seg + "/" + arg}>
        <RouteView seg={seg} arg={arg} role={role} />
      </main>

      <BottomBar role={role} seg={seg} unread={unread} />
      <Footer role={role} mode={mode} onMode={setMode} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
