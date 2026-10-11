// apps/mobile/components/PhotoEditor.js
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Modal } from './Bits.js';
import { COLORS, commonStyles } from './Theme.js';
import { nowIso, uid } from '../../shared/utils.js';

const DEMO_EXTRA_PHOTOS = [
  "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=70",
  "https://images.unsplash.com/photo-1466781783364-36c955e42a7f?auto=format&fit=crop&w=800&q=70",
  "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&q=70",
];

export default function PhotoEditor({ photos = [], onSave, onClose }) {
  const [list, setList] = useState(photos);

  const move = (fromIdx, toIdx) => {
    if (fromIdx < 0 || toIdx < 0 || toIdx >= list.length || fromIdx === toIdx) return;
    const next = [...list];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    setList(next);
  };

  const addPhoto = () => {
    const randomUrl = DEMO_EXTRA_PHOTOS[Math.floor(Math.random() * DEMO_EXTRA_PHOTOS.length)];
    const newPhoto = {
      id: uid(),
      observation_id: null,
      url: randomUrl,
      created_at: nowIso(),
      is_primary: false,
    };
    setList([...list, newPhoto]);
  };

  const removePhoto = (id) => {
    if (list.length <= 1) return;
    setList(list.filter((x) => x.id !== id));
  };

  const save = () => {
    onSave(list.map((p, idx) => ({ ...p, is_primary: idx === 0 })));
  };

  return (
    <Modal visible title="Arrange photos" onClose={onClose}>
      <Text style={[commonStyles.mute, { marginBottom: 12 }]}>
        The first photo is the primary photo shown on cards and maps. Use buttons to re-order.
      </Text>

      <TouchableOpacity style={[commonStyles.btnGhost, { marginBottom: 14 }]} onPress={addPhoto}>
        <Text style={commonStyles.btnGhostText}>＋ Add photo</Text>
      </TouchableOpacity>

      <View style={styles.list}>
        {list.map((p, idx) => (
          <View key={p.id || idx} style={styles.card}>
            <Image source={{ uri: p.url }} style={styles.thumb} />
            <View style={styles.cardInfo}>
              <View style={styles.badgeRow}>
                <Text style={styles.photoNum}>Photo {idx + 1}</Text>
                {idx === 0 && (
                  <View style={styles.primaryPill}>
                    <Text style={styles.primaryPillText}>★ Primary</Text>
                  </View>
                )}
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, idx === 0 && styles.disabledBtn]}
                  disabled={idx === 0}
                  onPress={() => move(idx, idx - 1)}
                >
                  <Text style={styles.actionBtnText}>▲ Up</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, idx === 0 && styles.disabledBtn]}
                  disabled={idx === 0}
                  onPress={() => move(idx, 0)}
                >
                  <Text style={styles.actionBtnText}>★ Make primary</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, idx === list.length - 1 && styles.disabledBtn]}
                  disabled={idx === list.length - 1}
                  onPress={() => move(idx, idx + 1)}
                >
                  <Text style={styles.actionBtnText}>▼ Down</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn, list.length <= 1 && styles.disabledBtn]}
                  disabled={list.length <= 1}
                  onPress={() => removePhoto(p.id)}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={[commonStyles.btnPrimary, { marginTop: 16 }]} onPress={save}>
        <Text style={commonStyles.btnPrimaryText}>Save photo order</Text>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  cardInfo: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  photoNum: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryPill: {
    backgroundColor: 'rgba(155, 207, 106, 0.2)',
    borderColor: COLORS.primary,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryPillText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  actionBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionBtnText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '600',
  },
  deleteBtn: {
    borderColor: 'rgba(224, 93, 93, 0.4)',
    backgroundColor: 'rgba(224, 93, 93, 0.15)',
  },
  deleteBtnText: {
    color: '#ff8787',
    fontSize: 11,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.35,
  },
});
