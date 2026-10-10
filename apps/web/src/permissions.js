// web/src/permissions.js
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

// "pending" doubles as "is staff": unpublished plants, exact endangered locations, conservation status.
const PERMS = {
  visitor: [],
  botanist: ["bell", "add", "editPhotos", "pending", "records", "discuss"],
  officer: ["bell", "editPhotos", "pending", "review", "reports", "species", "monitor", "tags", "discuss"],
  admin: ["bell", "pending", "monitor", "users", "audit", "tags", "discuss"],
};

export const can = (role, perm) => (PERMS[role] || []).includes(perm);

// Staff-only links shown in the dashboard sidebar and the quick buttons.
const STAFF_LINKS = {
  botanist: [
    { to: "/add", label: "Add plant", icon: "plus" },
    { to: "/records", label: "My records", icon: "file" },
    { to: "/discussion", label: "Discussion", icon: "chat" },
  ],
  officer: [
    { to: "/review", label: "Review queue", icon: "clipboard" },
    { to: "/discussion", label: "Discussion", icon: "chat" },
    { to: "/reports", label: "Reports", icon: "chart" },
    { to: "/species", label: "Species", icon: "leaf" },
    { to: "/monitoring", label: "Monitoring", icon: "activity" },
    { to: "/tags", label: "QR tags", icon: "qr" },
  ],
  admin: [
    { to: "/users", label: "Users", icon: "users" },
    { to: "/discussion", label: "Discussion", icon: "chat" },
    { to: "/monitoring", label: "Monitoring", icon: "activity" },
    { to: "/tags", label: "QR tags", icon: "qr" },
    { to: "/audit", label: "Audit log", icon: "shield" },
  ],
};

export const staffLinks = (role) => STAFF_LINKS[role] || [];

// Bottom bar on phones (5 icons at most). Red items are staff-only.
export const bottomLinks = (role) => {
  const base = [
    { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { to: "/map", label: "Map", icon: "map" },
  ];
  if (role === "botanist") return [base[0], { to: "/add", label: "Scan", icon: "camera", staff: true }, base[1], { to: "/notifications", label: "Alerts", icon: "bell", staff: true }];
  if (role === "officer") return [base[0], { to: "/review", label: "Review", icon: "clipboard", staff: true }, base[1], { to: "/notifications", label: "Alerts", icon: "bell", staff: true }];
  if (role === "admin") return [base[0], { to: "/monitoring", label: "Monitor", icon: "activity", staff: true }, base[1], { to: "/notifications", label: "Alerts", icon: "bell", staff: true }];
  return [{ to: "/", label: "Home", icon: "home" }, ...base];
};
