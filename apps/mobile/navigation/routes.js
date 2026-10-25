// apps/mobile/navigation/routes.js
// Screen registry and route permissions for the Daun Sense mobile app.
import { Home, About, Contact, More, NoAccess } from '../pages/Public.js';
import { SpeciesList, TaggedPlants } from '../pages/Dashboard.js';
import { SpeciesProfile, TaggedPlant } from '../pages/PlantPage.js';
import MapPage from '../pages/MapPage.js';
import Scan from '../pages/Scan.js';
import SignIn from '../pages/Login.js';
import { AddPlant, Submitted, Revisit } from '../pages/AddPlant.js';
import { MyRecords, RecordDetail } from '../pages/Records.js';
import { ReviewQueue, ReviewRecord } from '../pages/Review.js';
import { Monitor, AlertDetail } from '../pages/Monitoring.js';
import Alerts from '../pages/Notifications.js';
import Discussion from '../pages/Discussion.js';
import SpeciesAdmin from '../pages/Species.js';
import Tags from '../pages/Tags.js';
import Reports from '../pages/Reports.js';
import { StaffMore, Users, Audit } from '../pages/Admin.js';
import { can } from '../../shared/permissions.js';

// Every screen, by route name. Each screen receives { nav, params }.
export const SCREENS = {
  home: Home, about: About, contact: Contact, more: More, signin: SignIn,
  plants: SpeciesList, species: SpeciesProfile, tag: TaggedPlant, map: MapPage, scan: Scan,
  tagged: TaggedPlants, add: AddPlant, submitted: Submitted, revisit: Revisit,
  records: MyRecords, record: RecordDetail, alerts: Alerts, discussion: Discussion,
  review: ReviewQueue, reviewItem: ReviewRecord, monitor: Monitor, alert: AlertDetail,
  staffMore: StaffMore, speciesAdmin: SpeciesAdmin, tags: Tags, reports: Reports,
  users: Users, audit: Audit,
};

// Which permission (apps/shared/permissions.js) a screen needs.
// The API checks again; this only keeps people away from screens that would fail for them.
export const NEEDS = {
  add: 'add', submitted: 'add', revisit: 'add', records: 'records', record: 'records',
  review: 'review', reviewItem: 'review', monitor: 'monitor', alert: 'monitor',
  speciesAdmin: 'species', tags: 'tags', reports: 'reports', users: 'users', audit: 'audit',
  alerts: 'bell', discussion: 'discuss', tagged: 'pending', staffMore: 'pending',
};

// Screens that cover the whole phone (no bottom bar).
export const FULL_SCREEN = ['scan', 'add', 'submitted', 'revisit', 'signin'];

// Fallback component when a user has no access to a screen
export { NoAccess, Home as DefaultScreen };

export function canAccess(role, routeName) {
  const requirement = NEEDS[routeName];
  return !requirement || can(role, requirement);
}

export function isFullScreen(routeName) {
  return FULL_SCREEN.includes(routeName);
}
