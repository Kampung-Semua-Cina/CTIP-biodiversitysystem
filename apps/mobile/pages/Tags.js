// apps/mobile/pages/Tags.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { fmtDate } from '../../shared/utils.js';
import { Chip } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileTags() {
  const { db, generateTags, retireTag, notify } = useStore();
  const [count, setCount] = useState('10');
  const [batch, setBatch] = useState('2026-10-A');

  const unused = db.tags.filter((t) => t.status === 'unused');

  const make = () => {
    const n = Math.min(Math.max(Number(count) || 0, 1), 50);
    const ids = generateTags(n, batch.trim() || 'batch');
    notify(`${n} new tag${n > 1 ? 's' : ''} generated (${ids[0]}...)`);
  };

  return (
    <View>
      <View style={commonStyles.card}>
        <Text style={commonStyles.heading}>QR tags</Text>
        <Text style={commonStyles.mute}>
          Generate pre-printed physical plant tags for field botanists or retire damaged tags.
        </Text>

        {/* Generate Batch Form */}
        <View style={styles.batchForm}>
          <Text style={commonStyles.subHeading}>Generate new batch</Text>

          <Text style={commonStyles.label}>How many tags (1 - 50)</Text>
          <TextInput
            style={commonStyles.input}
            value={count}
            onChangeText={setCount}
            keyboardType="numeric"
            placeholder="10"
            placeholderTextColor="#688065"
          />

          <Text style={commonStyles.label}>Batch label</Text>
          <TextInput
            style={commonStyles.input}
            value={batch}
            onChangeText={setBatch}
            placeholder="e.g. 2026-10-A"
            placeholderTextColor="#688065"
          />

          <View style={[commonStyles.row, { marginTop: 10 }]}>
            <TouchableOpacity style={commonStyles.btnPrimary} onPress={make}>
              <Text style={commonStyles.btnPrimaryText}>＋ Generate tags</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Unused Tag Sheet Preview */}
      {unused.length > 0 && (
        <View style={commonStyles.card}>
          <Text style={commonStyles.subHeading}>Unused Tag Stock ({unused.length})</Text>
          <Text style={commonStyles.mute}>These tags are ready to be deployed to field plants.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.qrStockScroll}>
            {unused.map((t) => (
              <View key={t.qr_id} style={styles.qrStockCard}>
                <View style={styles.qrSquare}>
                  <Text style={styles.qrSymbol}>▣</Text>
                </View>
                <Text style={styles.qrStockId}>{t.qr_id}</Text>
                <Text style={styles.qrStockBatch}>{t.batch_label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tags Directory */}
      <View style={commonStyles.card}>
        <Text style={commonStyles.subHeading}>All Tags ({db.tags.length})</Text>

        <View style={styles.tagList}>
          {db.tags.map((t) => (
            <View key={t.qr_id} style={styles.tagRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tagIdText}>{t.qr_id}</Text>
                <Text style={commonStyles.mute}>
                  Batch: {t.batch_label} · Created {fmtDate(t.created_at)}
                </Text>
              </View>

              <View style={[commonStyles.row, { gap: 8 }]}>
                <Chip value={t.status} />
                {t.status === 'unused' && (
                  <TouchableOpacity
                    style={[commonStyles.btnGhost, { paddingVertical: 4, paddingHorizontal: 8 }]}
                    onPress={() => {
                      retireTag(t.qr_id);
                      notify(`Tag ${t.qr_id} retired`);
                    }}
                  >
                    <Text style={[commonStyles.btnGhostText, { color: '#ff8787', fontSize: 12 }]}>
                      Retire
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  batchForm: {
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qrStockScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  qrStockCard: {
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 100,
  },
  qrSquare: {
    width: 50,
    height: 50,
    backgroundColor: '#16301e',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  qrSymbol: {
    color: COLORS.primary,
    fontSize: 26,
  },
  qrStockId: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  qrStockBatch: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  tagList: {
    gap: 8,
    marginTop: 10,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a11',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'space-between',
  },
  tagIdText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
