// apps/mobile/components/PhotoGallery.js
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from './Theme.js';

export default function PhotoGallery({ photos = [], canEdit = false, onEdit }) {
  const [cur, setCur] = useState(0);
  const n = photos.length;
  const activeIdx = Math.min(cur, Math.max(n - 1, 0));

  if (!n) {
    return (
      <View style={styles.emptyGallery}>
        <Text style={styles.emptyIcon}>📷</Text>
        <Text style={styles.emptyText}>No photos yet</Text>
        {canEdit && (
          <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
            <Text style={styles.editBtnText}>✏️ Add photos</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const go = (delta) => setCur((activeIdx + delta + n) % n);

  return (
    <View style={styles.container}>
      <View style={styles.mainSlide}>
        <Image
          source={{ uri: photos[activeIdx]?.url }}
          style={styles.mainImage}
          resizeMode="cover"
        />



        {canEdit && (
          <TouchableOpacity style={styles.editIconBtn} onPress={onEdit}>
            <Text style={styles.editIconBtnText}>✏️ Edit</Text>
          </TouchableOpacity>
        )}

        {n > 1 && (
          <>
            <TouchableOpacity style={[styles.navArrow, styles.leftArrow]} onPress={() => go(-1)}>
              <Text style={styles.navArrowText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navArrow, styles.rightArrow]} onPress={() => go(1)}>
              <Text style={styles.navArrowText}>›</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {n > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailStrip}>
          {photos.map((p, idx) => (
            <TouchableOpacity
              key={p.id || idx}
              style={[styles.thumbnailWrap, idx === activeIdx && styles.thumbnailActive]}
              onPress={() => setCur(idx)}
            >
              <Image source={{ uri: p.url }} style={styles.thumbnailImg} />
              <Text style={styles.thumbnailNum}>{idx + 1}</Text>

            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  mainSlide: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0a1a11',
    position: 'relative',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(20, 48, 29, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  primaryBadgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  editIconBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(20, 48, 29, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editIconBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  navArrow: {
    position: 'absolute',
    top: '40%',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftArrow: {
    left: 10,
  },
  rightArrow: {
    right: 10,
  },
  navArrowText: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
  },
  thumbnailStrip: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  thumbnailWrap: {
    width: 54,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  thumbnailActive: {
    borderColor: COLORS.primary,
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
  },
  thumbnailNum: {
    position: 'absolute',
    bottom: 2,
    right: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 3,
    borderRadius: 3,
  },
  thumbPrimaryDot: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  emptyGallery: {
    height: 160,
    backgroundColor: '#0a1a11',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyIcon: {
    fontSize: 30,
    marginBottom: 6,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  editBtn: {
    marginTop: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
