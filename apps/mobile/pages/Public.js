// apps/mobile/pages/Public.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';

import {
  getAboutContent,
  getHomeContent,
  getContactContent,
  getStaffPageContent,
  getAccessContent,
} from "../../shared/publicContent.js";
import { useStore } from "../../shared/store.js";
import { visiblePlants } from "../../shared/selectors.js";
import { COLORS, commonStyles } from "../components/Theme.js";

export function MobileHome({ park = "Niah National Park", onNavigate }) {
  const store = useStore();
  const db = store?.db;
  const content = getHomeContent(park);
  const latest = db ? visiblePlants(db, "visitor").slice(0, 3) : [];

  return (
    <View>
      {/* Hero section */}
      <View style={styles.heroCard}>
        <Text style={styles.heroBadge}>🌿 DaunSense</Text>
        <Text style={styles.heroTitle}>{content.heroTitle}</Text>
        <Text style={styles.heroSubtitle}>{content.heroSubtitle}</Text>

        <View style={styles.btnRow}>
          <TouchableOpacity style={commonStyles.btnPrimary} onPress={() => onNavigate?.('dashboard')}>
            <Text style={commonStyles.btnPrimaryText}>Browse plants</Text>
          </TouchableOpacity>
          <TouchableOpacity style={commonStyles.btnGhost} onPress={() => onNavigate?.('map')}>
            <Text style={commonStyles.btnGhostText}>Open map</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Features */}
      <View style={commonStyles.card}>
        <Text style={commonStyles.subHeading}>System Features</Text>
        {content.features.map((item, idx) => (
          <View key={idx} style={styles.featureItem}>
            <Text style={styles.featureTitle}>• {item.title}</Text>
            <Text style={commonStyles.mute}>{item.text}</Text>
          </View>
        ))}
      </View>

      {/* Recently Published */}
      {latest.length > 0 && (
        <View style={commonStyles.card}>
          <Text style={commonStyles.subHeading}>{content.recentSectionTitle || "Recently published"}</Text>
          <View style={styles.recentList}>
            {latest.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.recentCard}
                onPress={() => onNavigate?.('dashboard', p.qr_id)}
              >
                <Image
                  source={{ uri: p.photos[0]?.url }}
                  style={styles.recentImg}
                />
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>{p.name}</Text>
                  <Text style={styles.recentSci}>{p.scientific || p.qr_id}</Text>
                </View>
                <Text style={styles.arrowIcon}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export function MobileAbout({ site = "Daun Sense", park = "Niah National Park" }) {
  const content = getAboutContent(site, park);
  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.heading}>{content.title}</Text>
      {content.paragraphs.map((para, i) => (
        <Text key={i} style={[commonStyles.body, { marginBottom: 14 }]}>
          {para}
        </Text>
      ))}
    </View>
  );
}

export function MobileContact() {
  const content = getContactContent();
  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.heading}>{content.title}</Text>
      <Text style={[commonStyles.body, { fontWeight: '600' }]}>Email: {content.email}</Text>
      <Text style={commonStyles.body}>{content.organization}</Text>
      <Text style={commonStyles.mute}>{content.address}</Text>
    </View>
  );
}

export function MobileStaff({ park = "Niah National Park", onNavigate }) {
  const store = useStore();
  const me = store?.me;
  const role = store?.role || "visitor";
  const content = getStaffPageContent(park);

  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.heading}>{content.title}</Text>
      {me ? (
        <View style={{ gap: 12 }}>
          <Text style={commonStyles.body}>
            You are signed in as <Text style={{ fontWeight: '700', color: COLORS.primary }}>{me.full_name}</Text> ({me.role}).
          </Text>
          <TouchableOpacity style={commonStyles.btnPrimary} onPress={() => onNavigate?.('dashboard')}>
            <Text style={commonStyles.btnPrimaryText}>Go to dashboard</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={commonStyles.body}>{content.description}</Text>
          <TouchableOpacity style={commonStyles.btnPrimary} onPress={() => onNavigate?.('login')}>
            <Text style={commonStyles.btnPrimaryText}>Go to login</Text>
          </TouchableOpacity>
        </View>
      )}
      {role === 'visitor' && (
        <Text style={[commonStyles.mute, { marginTop: 14 }]}>{content.visitorHint}</Text>
      )}
    </View>
  );
}

export function MobileNoAccess({ onNavigate }) {
  const store = useStore();
  const role = store?.role || "visitor";
  const content = getAccessContent();

  return (
    <View style={commonStyles.card}>
      <Text style={[commonStyles.heading, { color: COLORS.danger }]}>{content.noAccessTitle}</Text>
      <Text style={[commonStyles.body, { marginBottom: 14 }]}>
        {role === 'visitor' ? content.visitorText : content.staffText}
      </Text>
      <TouchableOpacity
        style={commonStyles.btnPrimary}
        onPress={() => onNavigate?.(role === 'visitor' ? 'login' : 'dashboard')}
      >
        <Text style={commonStyles.btnPrimaryText}>
          {role === 'visitor' ? 'Go to login' : 'Back to dashboard'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function MobileNotFound({ onNavigate }) {
  const content = getAccessContent();
  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.heading}>{content.notFoundTitle}</Text>
      <Text style={[commonStyles.body, { marginBottom: 14 }]}>{content.notFoundText}</Text>
      <TouchableOpacity style={commonStyles.btnPrimary} onPress={() => onNavigate?.('home')}>
        <Text style={commonStyles.btnPrimaryText}>Back to home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#132c1c',
    borderRadius: 18,
    padding: 20,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(155, 207, 106, 0.28)',
  },
  heroBadge: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    lineHeight: 30,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  featureItem: {
    marginVertical: 8,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  recentList: {
    gap: 8,
    marginTop: 6,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f2416',
    borderRadius: 12,
    padding: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  recentImg: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  recentSci: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  arrowIcon: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '700',
  },
});