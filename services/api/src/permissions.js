// Who may call each endpoint. Source: packages/api-contract/openapi.yaml.
// PUBLIC means Visitor: no token needed. SENSOR endpoints use X-Sensor-Key
// (separate ticket). Every other route needs a token and one of the listed roles.
export const PUBLIC = 'public';
export const SENSOR = 'sensor';

const ANY_STAFF = ['botanist', 'officer', 'admin'];
const OFFICER_ADMIN = ['officer', 'admin'];
const ADMIN = ['admin'];

export const routes = [
  // Public (Visitor)
  ['get', '/public/species', PUBLIC],
  ['get', '/public/species/:id', PUBLIC],
  ['get', '/public/workspace', PUBLIC], // published species and photos for the visitor pages

  // Start-up load: everything the apps show, as the signed-in user's RLS allows
  ['get', '/workspace', ANY_STAFF],

  // Profiles
  ['get', '/me', ANY_STAFF],
  ['patch', '/me', ANY_STAFF],
  ['get', '/profiles', ADMIN],
  ['post', '/profiles', ADMIN],
  ['patch', '/profiles/:id', ADMIN],

  // QR tags
  ['get', '/qr-tags', ANY_STAFF],
  ['post', '/qr-tags/batch', OFFICER_ADMIN],
  ['get', '/qr-tags/:qrId', ANY_STAFF],
  ['delete', '/qr-tags/:qrId', OFFICER_ADMIN],
  ['post', '/qr-tags/:qrId/retire', OFFICER_ADMIN],

  // Species
  ['get', '/species', OFFICER_ADMIN],
  ['post', '/species', OFFICER_ADMIN],
  ['get', '/species/:id', OFFICER_ADMIN],
  ['patch', '/species/:id', OFFICER_ADMIN],
  ['delete', '/species/:id', OFFICER_ADMIN],
  ['post', '/species/:id/publish', OFFICER_ADMIN],
  ['post', '/species/:id/restore', OFFICER_ADMIN],
  ['get', '/species/:id/media', OFFICER_ADMIN],
  ['post', '/species/:id/media', OFFICER_ADMIN],
  ['patch', '/species/:id/media/:mediaId', OFFICER_ADMIN],
  ['delete', '/species/:id/media/:mediaId', OFFICER_ADMIN],

  // Specimens (row-level "own record" checks stay in Supabase RLS)
  ['get', '/specimens', ANY_STAFF],
  ['post', '/specimens', ANY_STAFF],
  ['get', '/specimens/by-qr/:qrId', ANY_STAFF],
  ['get', '/specimens/:id', ANY_STAFF],
  ['patch', '/specimens/:id', ANY_STAFF],

  // Observations, photos, reviews, comments, sync
  ['get', '/observations', ANY_STAFF],
  ['post', '/observations', ANY_STAFF],
  ['get', '/observations/:id', ANY_STAFF],
  ['patch', '/observations/:id', ANY_STAFF],
  ['delete', '/observations/:id', ANY_STAFF],
  ['post', '/observations/:id/submit', ANY_STAFF],
  ['get', '/observations/:id/photos', ANY_STAFF],
  ['post', '/observations/:id/photos', ANY_STAFF],
  ['post', '/observations/:id/photos/:photoId/confirm', ANY_STAFF],
  ['get', '/observations/:id/reviews', ANY_STAFF],
  ['post', '/observations/:id/reviews', OFFICER_ADMIN],
  ['get', '/observations/:id/comments', ANY_STAFF],
  ['post', '/observations/:id/comments', ANY_STAFF],
  ['post', '/sync', ANY_STAFF],

  // Distribution map (coordinates of endangered plants reduced by role, CTIP-88)
  ['get', '/distribution', ANY_STAFF],

  // Sensors
  ['get', '/sensor-nodes', OFFICER_ADMIN],
  ['post', '/sensor-nodes', OFFICER_ADMIN],
  ['get', '/sensor-nodes/:id', OFFICER_ADMIN],
  ['patch', '/sensor-nodes/:id', OFFICER_ADMIN],
  ['get', '/sensor-nodes/:id/telemetry', OFFICER_ADMIN],
  ['post', '/telemetry', SENSOR],
  ['get', '/sensor-nodes/:id/images', OFFICER_ADMIN],
  ['post', '/sensor-nodes/:id/images', SENSOR],

  // Alerts
  ['get', '/alerts', OFFICER_ADMIN],
  ['get', '/alerts/:id', OFFICER_ADMIN],
  ['post', '/alerts/:id/assign', OFFICER_ADMIN],
  ['post', '/alerts/:id/acknowledge', OFFICER_ADMIN],
  ['post', '/alerts/:id/resolve', OFFICER_ADMIN],
  ['get', '/alerts/:id/notes', OFFICER_ADMIN],
  ['post', '/alerts/:id/notes', OFFICER_ADMIN],

  // Notifications
  ['get', '/notifications', ANY_STAFF],
  ['post', '/notifications/:id/read', ANY_STAFF],
  ['post', '/notifications/read-all', ANY_STAFF],

  // Reports
  ['get', '/reports/observations', OFFICER_ADMIN],
  ['get', '/reports/species', OFFICER_ADMIN],
];
