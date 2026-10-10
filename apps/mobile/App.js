// mobile/App.js
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, ScrollView, SafeAreaView, View, TouchableOpacity, Text } from 'react-native';
import { MobileHome, MobileAbout, MobileContact, MobileStaff } from './pages/Public.js';

const SITE = "DaunSense";
const PARK = "Niah";

export default function App() {
  const [tab, setTab] = useState('home');

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Mini top tab switcher */}
      <View style={styles.tabNav}>
        {['home', 'about', 'contact', 'staff'].map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabActiveText]}>
              {t.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {tab === 'home' && <MobileHome park={PARK} onNavigate={setTab} />}
        {tab === 'about' && <MobileAbout site={SITE} park={PARK} />}
        {tab === 'contact' && <MobileContact />}
        {tab === 'staff' && <MobileStaff park={PARK} onNavigate={setTab} />}
        <StatusBar style="light" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0e2217',
  },
  tabNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#16301e',
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#9bcf6a',
  },
  tabText: {
    color: '#b9cdb0',
    fontWeight: '600',
    fontSize: 12,
  },
  tabActiveText: {
    color: '#14301d',
    fontWeight: '700',
  },
  container: {
    padding: 16,
  },
});