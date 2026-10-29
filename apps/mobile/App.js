// apps/mobile/App.js
// Daun Sense field app root entry point.
// Initializes fonts, providers (SafeArea, Theme, Store), and mounts the root navigator.
import React from 'react';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { setStorageAdapter, setApiBaseUrl } from '../shared/api.js';
import StoreProvider from '../shared/StoreProvider.js';
import { ThemeProvider, FONT_FILES } from './components/Theme.js';
import AppNavigator from './navigation/AppNavigator.js';

// Persist user sessions across mobile app restarts
setStorageAdapter(AsyncStorage);

// Explicitly configure API base URL for the mobile app
setApiBaseUrl(process.env.EXPO_PUBLIC_API_URL || 'https://ctip-biodiversitysystem.onrender.com');

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
