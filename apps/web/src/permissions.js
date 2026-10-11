// apps/web/src/permissions.js
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

// Bottom bar on phones: always the same 4 buttons no matter the screen or access.
export const bottomLinks = () => [
  { to: "/", label: "Home", icon: "home" },
  { to: "/add", label: "Scan", icon: "camera" },
  { to: "/dashboard", label: "Plants", icon: "leaf" },
  { to: "/map", label: "Map", icon: "map" },
];

