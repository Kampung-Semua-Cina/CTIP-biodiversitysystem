// apps/mobile/components/Bits.js
import React from 'react';
import { View, Text, StyleSheet, Modal as RNModal, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS, CHIP_COLORS } from './Theme.js';
import { label } from '../../shared/utils.js';

export function Chip({ value, children }) {
  const normKey = String(value || '').toLowerCase().replace(/[\s_]+/g, '-');
  const palette = CHIP_COLORS[normKey] || { bg: 'rgba(185, 205, 176, 0.15)', text: '#b9cdb0', border: 'rgba(185, 205, 176, 0.3)' };

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.chipText, { color: palette.text }]}>
        {children || label(value)}
      </Text>
    </View>
  );
}

export function Empty({ icon = "🌿", children }) {
  const iconEmoji = {
    leaf: '🌿',
    search: '🔍',
    clipboard: '📋',
    file: '📄',
    chart: '📊',
    shield: '🛡️',
    activity: '⚡',
    bell: '🔔',
    chat: '💬',
  }[icon] || (icon.length <= 2 ? icon : '🌱');

  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>{iconEmoji}</Text>
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}

export function Modal({ visible = true, title, onClose, children }) {
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {children}
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

// Visual sensor telemetry chart for mobile without external SVG dependency
export function Sparkline({ values = [], limit, unit = '', title = '' }) {
  if (!values.length) return <Empty icon="activity">No readings yet.</Empty>;

  const all = limit == null ? values : [...values, limit];
  const lo = Math.min(...all) - 1;
  const hi = Math.max(...all) + 1;
  const last = values[values.length - 1];

  return (
    <View style={styles.sparkContainer}>
      <View style={styles.sparkHeader}>
        <Text style={styles.sparkTitle}>{title}</Text>
        <Text style={styles.sparkLast}>
          Latest: <Text style={styles.sparkLastBold}>{last}{unit}</Text>
          {limit != null && <Text style={styles.sparkLimitText}> (Limit: {limit}{unit})</Text>}
        </Text>
      </View>

      <View style={styles.chartArea}>
        {/* Readings as vertical bars */}
        <View style={styles.barsRow}>
          {values.map((v, i) => {
            const pct = Math.max(8, Math.min(100, ((v - lo) / (hi - lo)) * 100));
            const isOverLimit = limit != null && v >= limit;
            return (
              <View key={i} style={styles.barCol}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${pct}%` },
                    isOverLimit ? styles.barDanger : styles.barNormal,
                  ]}
                />
              </View>
            );
          })}
        </View>

        {/* Limit indicator line */}
        {limit != null && (
          <View
            style={[
              styles.limitLine,
              { bottom: `${Math.max(5, Math.min(95, ((limit - lo) / (hi - lo)) * 100))}%` },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginRight: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  emptyContainer: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    padding: 18,
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#122618',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    padding: 16,
  },
  sparkContainer: {
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sparkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sparkTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  sparkLast: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  sparkLastBold: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  sparkLimitText: {
    color: '#ff8787',
    fontSize: 11,
  },
  chartArea: {
    height: 70,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    gap: 3,
  },
  barCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 2,
  },
  barNormal: {
    backgroundColor: '#4ea8de',
  },
  barDanger: {
    backgroundColor: '#e05d5d',
  },
  limitLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: '#ff8787',
    borderStyle: 'dashed',
  },
});
