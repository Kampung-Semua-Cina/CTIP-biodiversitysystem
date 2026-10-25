// apps/web/src/routes.js
// Route permissions and access control for web pages.
import { can } from "../../shared/permissions.js";

// Which permission (see permissions.js) a staff page needs.
export const NEEDS = {
  add: "add",
  records: "records",
  review: "review",
  reports: "reports",
  species: "species",
  monitoring: "monitor",
  users: "users",
  audit: "audit",
  tags: "tags",
  notifications: "bell",
  discussion: "discuss",
  account: "pending", // any signed-in staff
};

export function canAccess(role, seg) {
  const needs = NEEDS[seg];
  return !needs || can(role, needs);
}
