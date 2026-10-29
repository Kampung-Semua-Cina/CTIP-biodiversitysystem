// apps/shared/permissions.js · used by the web and mobile apps
// Who can do what. The role keys are the exact profiles.role values in the
// database (botanist, officer, admin), plus "visitor" for people who are not signed in.

export const ROLES = [
  { key: "visitor", label: "Visitor", icon: "eye" },
  { key: "botanist", label: "Botanist", icon: "leaf" },
  { key: "officer", label: "Officer", icon: "clipboard" },
  { key: "admin", label: "Admin", icon: "shield" },
];

// profiles.role value -> label shown on the page
export const ROLE_LABEL = {
  botanist: "Botanist",
  officer: "Conservation officer",
  admin: "Administrator",
};

// "allPlants": the dashboard lists everyone's records. Botanists only get their own.
// "pending" doubles as "is staff": unpublished plants, exact endangered locations, conservation status.
const PERMS = {
  visitor: [],
  botanist: ["bell", "add", "editPhotos", "pending", "records", "discuss"],
  officer: ["bell", "editPhotos", "pending", "allPlants", "review", "reports", "species", "monitor", "tags", "discuss"],
  admin: ["bell", "pending", "allPlants", "species", "monitor", "users", "audit", "tags", "discuss"],
};

export const can = (role, perm) => (PERMS[role] || []).includes(perm);

// Each staff role has its own dashboard at #/dashboard. Visitors have none.
export const DASHBOARD_LABEL = { botanist: "Botanist dashboard", officer: "Officer dashboard", admin: "Admin dashboard" };

// Heading above the staff links in the sidebar.
export const TOOLS_LABEL = { botanist: "Botanist tools", officer: "Officer tools", admin: "Admin tools" };

// Staff-only links shown in the dashboard sidebar and the quick buttons.
// `badge` names a count from staffCounts() in selectors.js.
const STAFF_LINKS = {
  botanist: [
    { to: "/add", label: "Add plant", icon: "plus" },
    { to: "/records", label: "My records", icon: "file", badge: "returned" },
    { to: "/discussion", label: "Discussion", icon: "chat" },
  ],
  officer: [
    { to: "/review", label: "Review queue", icon: "clipboard", badge: "review" },
    { to: "/monitoring", label: "Monitoring", icon: "activity", badge: "alerts" },
    { to: "/species", label: "Species", icon: "leaf" },
    { to: "/tags", label: "QR tags", icon: "qr" },
    { to: "/discussion", label: "Discussion", icon: "chat" },
    { to: "/reports", label: "Reports", icon: "chart" },
  ],
  admin: [
    { to: "/users", label: "Users", icon: "users" },
    { to: "/species", label: "Species", icon: "leaf" },
    { to: "/monitoring", label: "Monitoring", icon: "activity", badge: "alerts" },
    { to: "/discussion", label: "Discussion", icon: "chat" },
    { to: "/tags", label: "QR tags", icon: "qr" },
    { to: "/audit", label: "Audit log", icon: "shield" },
  ],
};

export const staffLinks = (role) => STAFF_LINKS[role] || [];

// Bottom bar on phones (5 icons at most). `main` is the raised button in the middle.
export const bottomLinks = (role) => {
  // Staff get their dashboard here; "Plants" means the public catalogue everywhere (visitors' list below).
  const plants = { to: "/plants", label: "Plants", icon: "leaf" };
  const map = { to: "/map", label: "Map", icon: "map" };
  const alerts = { to: "/notifications", label: "Alerts", icon: "bell", bell: true };
  if (role === "botanist") return [{ to: "/records", label: "My records", icon: "file" }, plants, { to: "/add", label: "Add plant", icon: "plus", main: true }, map, alerts];
  if (role === "officer") return [{ to: "/review", label: "Review", icon: "clipboard" }, plants, { to: "/scan", label: "Scan/Add", icon: "qr", main: true }, map, alerts];
  if (role === "admin") return [{ to: "/users", label: "Users", icon: "users" }, plants, { to: "/scan", label: "Scan/Add", icon: "qr", main: true }, map, alerts];
  return [{ to: "/", label: "Home", icon: "home" }, plants, { to: "/scan", label: "Scan", icon: "qr", main: true }, map, { to: "/about", label: "About", icon: "info" }];
};
