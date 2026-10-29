// apps/mobile/App.js
// Daun Sense field app root entry point.
// Initializes fonts, providers (SafeArea, Theme, Store), and mounts the root navigator.
import React from 'react';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import StoreProvider from '../shared/StoreProvider.js';
import { ThemeProvider, FONT_FILES } from './components/Theme.js';
import AppNavigator from './navigation/AppNavigator.js';

export default function App() {
  const [fontsLoaded] = useFonts(FONT_FILES);

  // Keep the splash screen up until custom typography is ready
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StoreProvider>
          <AppNavigator />
        </StoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
