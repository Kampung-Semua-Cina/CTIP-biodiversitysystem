// apps/mobile/pages/Reports.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { visiblePlants } from '../../shared/selectors.js';
import { CONSERVATION } from '../../shared/data.js';
import { label } from '../../shared/utils.js';
import { Chip, Empty } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileReports({ onNavigate }) {
  const { db, role, notify } = useStore();
  const [conservation, setConservation] = useState('all');
  const [status, setStatus] = useState('all');

  const all = visiblePlants(db, role);
  const rows = all.filter(
    (p) =>
      (conservation === 'all' || p.conservation === conservation) &&
      (status === 'all' || p.status === status)
  );

  const count = (fn) => all.filter(fn).length;
  const max = Math.max(1, ...CONSERVATION.map((c) => count((p) => p.conservation === c)));

  return (
    <View>
      <View style={commonStyles.card}>
        <View style={[commonStyles.row, { justifyContent: 'space-between' }]}>
          <Text style={commonStyles.heading}>Reports</Text>
          <TouchableOpacity
            style={commonStyles.btnGhost}
            onPress={() => notify('Report summary ready to export')}
          >
            <Text style={commonStyles.btnGhostText}>Export data</Text>
          </TouchableOpacity>
        </View>

        {/* Summary grid */}
        <View style={styles.summaryGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{all.length}</Text>
            <Text style={styles.statLabel}>Tagged plants</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#74c476' }]}>{count((p) => p.isPublic)}</Text>
            <Text style={styles.statLabel}>Published</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#ff8787' }]}>{count((p) => p.endangered)}</Text>
            <Text style={styles.statLabel}>Endangered</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#ffd43b' }]}>
              {count((p) => p.status === 'synced')}
            </Text>
            <Text style={styles.statLabel}>For review</Text>
          </View>
        </View>
      </View>

      {/* Conservation status breakdown */}
      <View style={commonStyles.card}>
        <Text style={commonStyles.subHeading}>By Conservation Status</Text>
        <View style={styles.barsContainer}>
          {CONSERVATION.map((c) => {
            const n = count((p) => p.conservation === c);
            const pct = (n / max) * 100;
            return (
              <View key={c} style={styles.barItem}>
                <View style={[commonStyles.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
                  <Text style={styles.barLabel}>{label(c)}</Text>
                  <Text style={styles.barCount}>{n} plants</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Filter and Table List */}
      <View style={commonStyles.card}>
        <Text style={commonStyles.subHeading}>Records Overview</Text>

        {/* Filter Pills */}
        <Text style={commonStyles.label}>Conservation Filter:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {['all', ...CONSERVATION].map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.filterPill, conservation === c && styles.filterPillActive]}
              onPress={() => setConservation(c)}
            >
              <Text style={[styles.filterPillText, conservation === c && styles.filterPillTextActive]}>
                {label(c)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={commonStyles.label}>Record Status Filter:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {['all', 'approved', 'synced', 'returned', 'rejected', 'draft', 'queued'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterPill, status === s && styles.filterPillActive]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.filterPillText, status === s && styles.filterPillTextActive]}>
                {label(s)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {rows.length === 0 ? (
          <Empty icon="chart">No plants match these filters.</Empty>
        ) : (
          <View style={styles.tableList}>
            {rows.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.plantRow}
                onPress={() => onNavigate?.('dashboard', p.qr_id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.plantName}>{p.name}</Text>
                  <Text style={styles.plantSci}>{p.scientific || p.qr_id}</Text>
                  <Text style={commonStyles.mute}>
                    {p.species?.family || 'Family unconfirmed'} · {p.qr_id}
                  </Text>
                </View>
                <View style={styles.chipCol}>
                  <Chip value={p.status} />
                  {p.species && <Chip value={p.conservation} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statNumber: {
    color: COLORS.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  barsContainer: {
    gap: 12,
    marginTop: 8,
  },
  barItem: {
    backgroundColor: '#0a1a11',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  barLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  barCount: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  barTrack: {
    height: 8,
    backgroundColor: '#16301e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#0a1a11',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },
  tableList: {
    marginTop: 10,
    gap: 8,
  },
  plantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'space-between',
  },
  plantName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  plantSci: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  chipCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
});
