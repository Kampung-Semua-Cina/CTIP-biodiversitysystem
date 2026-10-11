// apps/mobile/pages/MapPage.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { can } from '../../shared/permissions.js';
import { familyColors, familyOf, shownCoords, visiblePlants } from '../../shared/selectors.js';
import { MAP_BOUNDS } from '../../shared/site.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileMapPage({ arg, onNavigate }) {
  const { db, role } = useStore();
  const [picked, setPicked] = useState(null);
  const [only, setOnly] = useState(null);

  const staff = can(role, 'pending');
  const all = visiblePlants(db, role)
    .map((p) => ({ p, c: shownCoords(p, role) }))
    .filter((x) => x.c);
  const colors = familyColors(db.species, all.map((x) => x.p));
  const pts = all.filter((x) => !only || familyOf(x.p) === only);

  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const pct = (v) => Math.min(94, Math.max(6, v * 100));

  const selId = picked || arg;
  const sel = pts.find((x) => x.p.qr_id === selId);
  const count = (f) => all.filter((x) => familyOf(x.p) === f).length;

  return (
    <View>
      <View style={commonStyles.card}>
        <Text style={commonStyles.heading}>Plant map</Text>
        <Text style={commonStyles.mute}>
          Each dot is one plant, colored by botanical family. Tap a dot to preview the plant.
          {!staff && ' Locations of endangered plants are hidden to protect them.'}
        </Text>

        {/* Map Canvas */}
        <View style={styles.mapCanvas}>
          <Text style={styles.northIndicator}>▲ N</Text>

          {/* Botanical River & Terrain stylized curves */}
          <View style={styles.terrainBackground}>
            <View style={[styles.riverBand, { top: '35%', transform: [{ rotate: '-8deg' }] }]} />
            <View style={[styles.riverBand, { top: '65%', transform: [{ rotate: '12deg' }] }]} />
            <View style={[styles.contourRing, { width: 140, height: 140, top: 40, left: 20 }]} />
            <View style={[styles.contourRing, { width: 180, height: 180, bottom: 20, right: 20 }]} />
          </View>

          {/* Plant dots */}
          {pts.map(({ p, c }) => {
            const leftPct = pct((c.lng - minLng) / (maxLng - minLng));
            const topPct = pct((maxLat - c.lat) / (maxLat - minLat));
            const isSelected = p.qr_id === selId;
            const dotColor = colors[familyOf(p)] || '#868e96';

            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.plantDot,
                  {
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    backgroundColor: dotColor,
                  },
                  isSelected && styles.plantDotSelected,
                ]}
                onPress={() => setPicked(p.qr_id)}
                activeOpacity={0.7}
              />
            );
          })}
        </View>

        {/* Selected Plant Preview Card */}
        {sel && (
          <View style={styles.selectedPreview}>
            <Image source={{ uri: sel.p.photos[0]?.url }} style={styles.previewThumb} />
            <View style={styles.previewInfo}>
              <Text style={styles.previewTitle}>{sel.p.name}</Text>
              <Text style={styles.previewSci}>{sel.p.scientific || sel.p.qr_id}</Text>
              <View style={[commonStyles.row, { marginTop: 4 }]}>
                <View style={[styles.famDot, { backgroundColor: colors[familyOf(sel.p)] }]} />
                <Text style={commonStyles.mute}>
                  {familyOf(sel.p)} · {sel.c.lat.toFixed(4)}, {sel.c.lng.toFixed(4)}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={commonStyles.btnPrimary}
              onPress={() => onNavigate?.('dashboard', sel.p.qr_id)}
            >
              <Text style={commonStyles.btnPrimaryText}>View</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={commonStyles.divider} />

        {/* Legend */}
        <Text style={commonStyles.subHeading}>Map Legend</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legendScroll}>
          <TouchableOpacity
            style={[styles.legendChip, !only && styles.legendChipActive]}
            onPress={() => setOnly(null)}
          >
            <Text style={[styles.legendText, !only && styles.legendTextActive]}>
              All families ({all.length})
            </Text>
          </TouchableOpacity>

          {Object.entries(colors).map(([fam, color]) => (
            <TouchableOpacity
              key={fam}
              style={[styles.legendChip, only === fam && styles.legendChipActive]}
              onPress={() => setOnly(only === fam ? null : fam)}
            >
              <View style={[styles.famDot, { backgroundColor: color }]} />
              <Text style={[styles.legendText, only === fam && styles.legendTextActive]}>
                {fam} ({count(fam)})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapCanvas: {
    height: 320,
    backgroundColor: '#0c2014',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(155, 207, 106, 0.3)',
    marginVertical: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  northIndicator: {
    position: 'absolute',
    top: 10,
    right: 12,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    zIndex: 10,
  },
  terrainBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  riverBand: {
    position: 'absolute',
    left: -20,
    right: -20,
    height: 6,
    backgroundColor: 'rgba(78, 168, 222, 0.22)',
    borderRadius: 3,
  },
  contourRing: {
    position: 'absolute',
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(185, 205, 176, 0.08)',
  },
  plantDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    marginLeft: -7,
    marginTop: -7,
    zIndex: 5,
  },
  plantDotSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: '#ffffff',
    marginLeft: -11,
    marginTop: -11,
    zIndex: 12,
  },
  selectedPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 12,
    marginVertical: 8,
  },
  previewThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  previewInfo: {
    flex: 1,
  },
  previewTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  previewSci: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
    fontSize: 12,
  },
  famDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 6,
  },
  legendScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0a1a11',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  legendChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(155, 207, 106, 0.15)',
  },
  legendText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  legendTextActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
});
