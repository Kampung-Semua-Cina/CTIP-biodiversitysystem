// apps/mobile/navigation/AppNavigator.js
// Main screen coordinator: mounts screens, enforces permissions, and coordinates TabBar and overlays.
import React, { useRef, useEffect } from 'react';
import { View, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../../shared/store.js';
import { usePlantBook } from '../../shared/plantBook.js';
import { useTheme } from '../components/Theme.js';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset.js';
import { useAppNavigation } from './useAppNavigation.js';
import { SCREENS, NoAccess, DefaultScreen, canAccess, isFullScreen } from './routes.js';
import { badgeCounts } from './tabs.js';
import TabBar from './TabBar.js';
import Toast from '../components/Toast.js';

// Smooth fade-in transition when switching screens (replaces any vertical sliding/jumping)
function FadeScreen({ children }) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  return (
    <Animated.View style={{ flex: 1, opacity: fade }}>
      {children}
    </Animated.View>
  );
}

export default function AppNavigator() {
  const { role, me, db, toast } = useStore();
  const { c, scheme } = useTheme();
  const { keyboard, keyboardOpen } = useKeyboardOffset();
  const navBar = useSafeAreaInsets().bottom;
  usePlantBook(); // keeps the phone's copy up to date, ready for when there is no signal

  const { stack, route, nav, currentTab } = useAppNavigation(role);

  const Screen = SCREENS[route.name] || DefaultScreen;
  const blocked = !canAccess(role, route.name);
  const showTabs = !isFullScreen(route.name);
  const camera = route.name === 'scan';

  const toastBottom = keyboardOpen ? keyboard + 12 : showTabs ? 96 : 24;

  return (
    <View style={{ flex: 1, backgroundColor: camera ? c.camera : c.surface }}>
      <StatusBar style={camera || scheme === 'dark' ? 'light' : 'dark'} />

      {/* While typing, the screen ends exactly at the top of the keyboard, so a reply box has
          the same gap above and below it. Otherwise, screens without the tab bar keep clear of
          Android's navigation bar themselves. The tab bar is hidden while typing. */}
      <View
        style={{
          flex: 1,
          paddingBottom: keyboardOpen ? keyboard : !showTabs && !camera ? navBar : 0,
        }}
      >
        <FadeScreen key={stack.length + route.name}>
          {blocked ? (
            <NoAccess nav={nav} />
          ) : (
            <Screen nav={nav} params={route.params} />
          )}
        </FadeScreen>
      </View>

      <Toast message={toast} bottom={toastBottom} />

      {showTabs && !keyboardOpen ? (
        <TabBar
          role={role}
          current={currentTab}
          badges={badgeCounts(db, me)}
          onTab={(key) => (key === 'scan' ? nav.go('scan') : nav.tab(key))}
        />
      ) : null}
    </View>
  );
}
