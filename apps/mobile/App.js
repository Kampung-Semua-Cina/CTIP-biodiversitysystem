// apps/mobile/App.js
// Daun Sense field app root entry point.
// Initializes fonts, providers (SafeArea, Theme, Store), and mounts the root navigator.
import React from 'react';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setStorageAdapter, setApiBaseUrl, restoreSession, onSignOut } from '../shared/api.js';
import StoreProvider from '../shared/StoreProvider.js';
import { ThemeProvider, FONT_FILES } from './components/Theme.js';
import AppNavigator from './navigation/AppNavigator.js';
import { secureStorage } from './secureStorage.js';
import { clearAllDrafts } from './draftStore.js';

// Clear plant drafts on sign-out to prevent leak across users on shared devices
onSignOut(async () => {
  try {
    await clearAllDrafts();
  } catch (err) {
    console.warn('[DraftStore] Failed to clear drafts on sign-out:', err);
  }
});

// Persist user sessions securely in Keystore/Keychain across mobile app restarts (CTIP-119)
setStorageAdapter(secureStorage);

// Explicitly configure API base URL for the mobile app
setApiBaseUrl(process.env.EXPO_PUBLIC_API_URL || 'https://ctip-biodiversitysystem.onrender.com');

// Pre-warm secure session restoration in parallel with font loading for fast app initialisation
restoreSession().catch(() => {});

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
