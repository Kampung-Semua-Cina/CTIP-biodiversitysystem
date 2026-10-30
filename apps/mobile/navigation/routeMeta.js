// apps/mobile/navigation/routeMeta.js
// Pure JavaScript route metadata, permissions, and layout rules (zero JSX).
import { can } from "../../shared/permissions.js";

// Which permission (apps/shared/permissions.js) a screen needs.
export const NEEDS = {
  add: "add",
  submitted: "add",
  revisit: "add",
  records: "records",
  record: "records",
  review: "review",
  reviewItem: "review",
  monitor: "monitor",
  alert: "monitor",
  speciesAdmin: "species",
  tags: "tags",
  reports: "reports",
  users: "users",
  audit: "audit",
  alerts: "bell",
  discussion: "discuss",
  staffMore: "pending",
  account: "pending",
  tagQr: "pending", // any signed-in role: a tag's QR code to share or print (CTIP-27)
};

// Screens that cover the whole phone (no bottom bar).
export const FULL_SCREEN = ["scan", "add", "submitted", "revisit", "signin"];

// Core registered route names
export const ROUTE_NAMES = [
  "home", "about", "contact", "more", "signin",
  "plants", "species", "tag", "map", "scan",
  "tagged", "add", "submitted", "revisit",
  "records", "record", "alerts", "discussion",
  "review", "reviewItem", "monitor", "alert",
  "staffMore", "speciesAdmin", "tags", "tagQr", "reports",
  "users", "audit", "account",
];

export function canAccess(role, routeName) {
  const requirement = NEEDS[routeName];
  return !requirement || can(role, requirement);
}

export function isFullScreen(routeName) {
  return FULL_SCREEN.includes(routeName);
}
