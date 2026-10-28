// apps/mobile/navigation/tabs.js
// Bottom tab definitions and badge counters per role.

export const TABS = {
  visitor: [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'plants', label: 'Plants', icon: 'leaf' },
    { key: 'scan', label: 'Scan', icon: 'scan', main: true },
    { key: 'map', label: 'Map', icon: 'map' },
    { key: 'more', label: 'More', icon: 'more' },
  ],
  botanist: [
    { key: 'records', label: 'My records', icon: 'file', badge: 'returned' },
    { key: 'tagged', label: 'Plants', icon: 'leaf' },
    { key: 'scan', label: 'Add plant', icon: 'scan', main: true },
    { key: 'alerts', label: 'Alerts', icon: 'bell', badge: 'unread' },
    { key: 'staffMore', label: 'More', icon: 'more' },
  ],
  officer: [
    { key: 'review', label: 'Review', icon: 'clipboard', badge: 'pendingReview' },
    { key: 'tagged', label: 'Plants', icon: 'leaf' },
    { key: 'scan', label: 'Add plant', icon: 'scan', main: true },
    { key: 'alerts', label: 'Alerts', icon: 'bell', badge: 'unread' },
    { key: 'staffMore', label: 'More', icon: 'more' },
  ],
  admin: [
    { key: 'users', label: 'Users', icon: 'users' },
    { key: 'tagged', label: 'Plants', icon: 'leaf' },
    { key: 'scan', label: 'Add plant', icon: 'scan', main: true },
    { key: 'alerts', label: 'Alerts', icon: 'bell', badge: 'unread' },
    { key: 'staffMore', label: 'More', icon: 'more' },
  ],
};

export function badgeCounts(db, me) {
  if (!me || !db) return {};
  return {
    unread: (db.notifications || []).filter((n) => n.user_id === me.id && !n.is_read).length,
    returned: (db.observations || []).filter((o) => o.recorded_by === me.id && o.status === 'returned').length,
    openAlerts: (db.alerts || []).filter((a) => a.status === 'open').length,
    pendingReview: (db.observations || []).filter((o) => o.status === 'synced').length,
  };
}

export function getRoleTabs(role) {
  return TABS[role] || TABS.visitor;
}

export function getRoleDefaultTab(role) {
  const tabs = getRoleTabs(role);
  return tabs[0]?.key || 'home';
}
