// apps/mobile/App.js
// Daun Sense field app. Screens follow the "Mobile app · all flows" canvas (design A):
// a five-slot bottom bar per role with the role's main job raised in the centre, and
// every colour, font and size taken from apps/shared/tokens.js through ThemeProvider.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, BackHandler, Keyboard, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import StoreProvider from '../shared/StoreProvider.js';
import { useStore } from '../shared/store.js';
import { can } from '../shared/permissions.js';

import { ThemeProvider, useTheme, font, FONT_FILES } from './components/Theme.js';
import Icon from './components/Icon.js';

import { Home, About, Contact, More, NoAccess } from './pages/Public.js';
import { SpeciesList, TaggedPlants } from './pages/Dashboard.js';
import { SpeciesProfile, TaggedPlant } from './pages/PlantPage.js';
import MapPage from './pages/MapPage.js';
import Scan from './pages/Scan.js';
import SignIn from './pages/Login.js';
import { AddPlant, Submitted, Revisit } from './pages/AddPlant.js';
import { MyRecords, RecordDetail } from './pages/Records.js';
import { ReviewQueue, ReviewRecord } from './pages/Review.js';
import { Monitor, AlertDetail } from './pages/Monitoring.js';
import Alerts from './pages/Notifications.js';
import Discussion from './pages/Discussion.js';
import SpeciesAdmin from './pages/Species.js';
import Tags from './pages/Tags.js';
import Reports from './pages/Reports.js';
import { StaffMore, Users, Audit } from './pages/Admin.js';

// Every screen, by route name. Each one gets { nav, params }.
const SCREENS = {
  home: Home, about: About, contact: Contact, more: More, signin: SignIn,
  plants: SpeciesList, species: SpeciesProfile, tag: TaggedPlant, map: MapPage, scan: Scan,
  tagged: TaggedPlants, add: AddPlant, submitted: Submitted, revisit: Revisit,
  records: MyRecords, record: RecordDetail, alerts: Alerts, discussion: Discussion,
  review: ReviewQueue, reviewItem: ReviewRecord, monitor: Monitor, alert: AlertDetail,
  staffMore: StaffMore, speciesAdmin: SpeciesAdmin, tags: Tags, reports: Reports,
  users: Users, audit: Audit,
};

// Which permission (apps/shared/permissions.js) a screen needs. The API checks again;
// this only keeps people away from screens that would fail for them.
const NEEDS = {
  add: 'add', submitted: 'add', revisit: 'add', records: 'records', record: 'records',
  review: 'review', reviewItem: 'review', monitor: 'monitor', alert: 'monitor',
  speciesAdmin: 'species', tags: 'tags', reports: 'reports', users: 'users', audit: 'audit',
  alerts: 'bell', discussion: 'discuss', tagged: 'pending', staffMore: 'pending',
};

// The bottom bar for each role. `main` is the raised centre button.
const TABS = {
  visitor: [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'plants', label: 'Plants', icon: 'leaf' },
    { key: 'scan', label: 'Scan', icon: 'scan', main: true },
    { key: 'map', label: 'Map', icon: 'map' },
    { key: 'more', label: 'More', icon: 'more' },
  ],
  botanist: [
    { key: 'tagged', label: 'Plants', icon: 'leaf' },
    { key: 'records', label: 'My records', icon: 'file', badge: 'returned' },
    { key: 'scan', label: 'Add plant', icon: 'scan', main: true },
    { key: 'alerts', label: 'Alerts', icon: 'bell', badge: 'unread' },
    { key: 'staffMore', label: 'More', icon: 'more' },
  ],
  officer: [
    { key: 'tagged', label: 'Plants', icon: 'leaf' },
    { key: 'monitor', label: 'Monitor', icon: 'activity', badge: 'openAlerts' },
    { key: 'review', label: 'Review', icon: 'clipboard', main: true },
    { key: 'alerts', label: 'Alerts', icon: 'bell', badge: 'unread' },
    { key: 'staffMore', label: 'More', icon: 'more' },
  ],
  admin: [
    { key: 'tagged', label: 'Plants', icon: 'leaf' },
    { key: 'users', label: 'Users', icon: 'users' },
    { key: 'monitor', label: 'Monitor', icon: 'activity', main: true },
    { key: 'alerts', label: 'Alerts', icon: 'bell', badge: 'unread' },
    { key: 'staffMore', label: 'More', icon: 'more' },
  ],
};

// Screens that cover the whole phone (no bottom bar).
const FULL_SCREEN = ['scan', 'add', 'submitted', 'revisit', 'signin'];

function badgeCounts(db, me) {
  if (!me) return {};
  return {
    unread: db.notifications.filter((n) => n.user_id === me.id && !n.is_read).length,
    returned: db.observations.filter((o) => o.recorded_by === me.id && o.status === 'returned').length,
    openAlerts: db.alerts.filter((a) => a.status === 'open').length,
  };
}

function TabBar({ role, current, onTab, badges }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'flex-end', height: 76 + insets.bottom, paddingBottom: 12 + insets.bottom, paddingHorizontal: 4, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
      {TABS[role].map((tab) => {
        const on = tab.key === current;
        const count = tab.badge ? badges[tab.badge] : 0;
        return (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={count ? `${tab.label}, ${count} new` : tab.label}
            onPress={() => onTab(tab.key)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            {tab.main ? (
              <View style={{ width: 56, height: 56, marginTop: -30, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, borderWidth: 4, borderColor: c.surface }}>
                <Icon name={tab.icon} size={26} color={c.onAccent} strokeWidth={2} />
              </View>
            ) : (
              <View>
                <Icon name={tab.icon} size={24} color={on ? c.accent : c.ink2} />
                {count > 0 ? (
                  <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: c.danger }}>
                    <Text style={{ fontFamily: font('text', 800), fontSize: 11, color: c.onDanger }}>{count}</Text>
                  </View>
                ) : null}
              </View>
            )}
            <Text numberOfLines={1} style={{ fontFamily: font('text', on || tab.main ? 800 : 700), fontSize: 12, color: tab.main ? c.ink : on ? c.accent : c.ink2 }}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Main() {
  const { role, me, db, toast } = useStore();
  const { c, scheme } = useTheme();
  const first = TABS[role][0].key;
  const [stack, setStack] = useState([{ name: first, params: {} }]);
  const [stackRole, setStackRole] = useState(role);

  // Signing in or out (or switching the prototype role) starts again at that role's first tab.
  if (stackRole !== role) {
    setStackRole(role);
    setStack([{ name: first, params: {} }]);
  }

  const route = stack[stack.length - 1];
  const nav = {
    go: (name, params = {}) => setStack((s) => [...s, { name, params }]),
    replace: (name, params = {}) => setStack((s) => [...s.slice(0, -1), { name, params }]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    tab: (name) => setStack([{ name, params: {} }]),
    home: () => setStack([{ name: first, params: {} }]),
    canGoBack: stack.length > 1,
  };

  // Android hardware back button walks back through the screens.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        setStack((s) => s.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length]);

  // How far the on-screen keyboard reaches up from the bottom of the screen (0 when closed).
  // Expo draws edge-to-edge on Android, so the window no longer shrinks for the keyboard;
  // the screen is lifted by exactly this much instead. On Android the reported height
  // already lines up with the bottom of the app (checked on a phone: adding the
  // navigation bar's height on top left a gap of about 24px under the reply box).
  const [keyboard, setKeyboard] = useState(0);
  const navBar = useSafeAreaInsets().bottom;
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const keyboardOpen = keyboard > 0;

  const Screen = SCREENS[route.name] || Home;
  const blocked = NEEDS[route.name] && !can(role, NEEDS[route.name]);
  const tabKeys = TABS[role].map((t) => t.key);
  const showTabs = !FULL_SCREEN.includes(route.name);
  const currentTab = tabKeys.includes(route.name) ? route.name : tabKeys.includes(stack[0].name) ? stack[0].name : null;
  const camera = route.name === 'scan';

  return (
    <View style={{ flex: 1, backgroundColor: camera ? c.camera : c.surface }}>
      <StatusBar style={camera || scheme === 'dark' ? 'light' : 'dark'} />
      {/* While typing, the screen ends exactly at the top of the keyboard, so a reply box has
          the same gap above and below it. Otherwise, screens without the tab bar keep clear of
          Android's navigation bar themselves. The tab bar is hidden while typing. */}
      <View style={{ flex: 1, paddingBottom: keyboardOpen ? keyboard : !showTabs && !camera ? navBar : 0 }}>
        {blocked ? <NoAccess nav={nav} /> : <Screen key={stack.length + route.name} nav={nav} params={route.params} />}
      </View>
      {toast ? (
        <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 16, right: 16, bottom: keyboardOpen ? keyboard + 12 : showTabs ? 96 : 24, padding: 14, borderRadius: 14, backgroundColor: c.ink }}>
          <Text style={{ fontFamily: font('text', 700), fontSize: 15, color: c.surface }}>{toast}</Text>
        </View>
      ) : null}
      {showTabs && !keyboardOpen ? <TabBar role={role} current={currentTab} badges={badgeCounts(db, me)} onTab={(key) => (key === 'scan' ? nav.go('scan') : nav.tab(key))} /> : null}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(FONT_FILES);
  if (!fontsLoaded) return null; // the splash screen stays up until the fonts are ready
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StoreProvider>
          <Main />
        </StoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
