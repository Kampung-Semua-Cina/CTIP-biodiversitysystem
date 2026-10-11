// apps/mobile/pages/AddPlant.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { COLORS, commonStyles } from '../components/Theme.js';

const DEMO_PRESET_PHOTOS = [
  "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=70",
  "https://images.unsplash.com/photo-1466781783364-36c955e42a7f?auto=format&fit=crop&w=800&q=70",
  "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=70",
];

export default function MobileAddPlant({ onNavigate }) {
  const { db, addPlant, generateTags, notify } = useStore();
  const [qr, setQr] = useState('');
  const [guess, setGuess] = useState('');
  const [morphology, setMorphology] = useState('');
  const [height, setHeight] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([{ url: DEMO_PRESET_PHOTOS[0] }]);
  const [spot, setSpot] = useState({ lat: 3.8031, lng: 113.7762, acc: 6 });

  const unused = db.tags.filter((t) => t.status === 'unused');

  const generate = () => {
    const [id] = generateTags(1, 'field');
    setQr(id);
    notify(`Generated new tag: ${id}`);
  };

  const addDemoPhoto = () => {
    const nextUrl = DEMO_PRESET_PHOTOS[photos.length % DEMO_PRESET_PHOTOS.length];
    setPhotos([...photos, { url: nextUrl }]);
    notify('Photo added');
  };

  const removePhoto = (idx) => {
    setPhotos(photos.filter((_, i) => i !== idx));
  };

  const updateLocation = () => {
    // Generate realistic slight GPS jitter for simulation in field
    const dLat = (Math.random() - 0.5) * 0.002;
    const dLng = (Math.random() - 0.5) * 0.002;
    setSpot({
      lat: +(3.8031 + dLat).toFixed(5),
      lng: +(113.7762 + dLng).toFixed(5),
      acc: Math.floor(Math.random() * 5) + 4,
    });
    notify('GPS location acquired (high accuracy)');
  };

  const save = () => {
    if (!qr) return notify('Choose or generate a QR tag first');
    if (!photos.length) return notify('Add at least one photo');

    addPlant({
      qr_id: qr,
      proposed_species: guess.trim(),
      morphology: morphology.trim(),
      height_cm: height,
      notes: notes.trim(),
      photos,
      lat: spot.lat,
      lng: spot.lng,
      gps_accuracy_m: spot.acc ?? 10,
    });

    notify('Plant record saved and queued for review');
    onNavigate?.('records');
  };

  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.heading}>Add plant</Text>
      <Text style={commonStyles.mute}>
        Field registration for botanists. Tag the specimen, take photos, and record morphological traits.
      </Text>

      {/* Step 1: Tag the plant */}
      <View style={styles.stepSection}>
        <View style={commonStyles.row}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>1</Text>
          </View>
          <Text style={styles.stepTitle}>Tag the plant</Text>
        </View>

        <View style={[commonStyles.rowWrap, { marginTop: 10 }]}>
          <TouchableOpacity style={commonStyles.btnGhost} onPress={generate}>
            <Text style={commonStyles.btnGhostText}>🏷️ Generate new QR</Text>
          </TouchableOpacity>
        </View>

        <Text style={commonStyles.label}>Or pick an unused tag:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagSelector}>
          {unused.map((t) => (
            <TouchableOpacity
              key={t.qr_id}
              style={[styles.tagOption, qr === t.qr_id && styles.tagOptionSelected]}
              onPress={() => setQr(t.qr_id)}
            >
              <Text style={[styles.tagOptionText, qr === t.qr_id && styles.tagOptionTextSelected]}>
                {t.qr_id}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {qr ? (
          <View style={styles.qrPreviewCard}>
            <View style={styles.qrBox}>
              <Text style={styles.qrSymbol}>▣</Text>
              <Text style={styles.qrTagText}>{qr}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.qrActiveLabel}>Active Tag Selected</Text>
              <Text style={commonStyles.mute}>This tag will be permanently bound to this plant.</Text>
            </View>
          </View>
        ) : (
          <Text style={[commonStyles.mute, { fontStyle: 'italic', marginTop: 6 }]}>
            No tag selected yet.
          </Text>
        )}
      </View>

      <View style={commonStyles.divider} />

      {/* Step 2: Record details */}
      <View style={styles.stepSection}>
        <View style={commonStyles.row}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>2</Text>
          </View>
          <Text style={styles.stepTitle}>Record what you see</Text>
        </View>

        <Text style={commonStyles.label}>Species guess (optional)</Text>
        <TextInput
          style={commonStyles.input}
          value={guess}
          onChangeText={setGuess}
          placeholder="e.g. Nepenthes ampullaria or Calamus sp."
          placeholderTextColor="#688065"
        />

        <Text style={commonStyles.label}>Appearance & Morphology</Text>
        <TextInput
          style={[commonStyles.input, { height: 75, textAlignVertical: 'top' }]}
          value={morphology}
          onChangeText={setMorphology}
          placeholder="Describe leaves, stem, pitchers, flowers, root systems..."
          placeholderTextColor="#688065"
          multiline
        />

        <Text style={commonStyles.label}>Height (cm)</Text>
        <TextInput
          style={commonStyles.input}
          value={height}
          onChangeText={setHeight}
          placeholder="e.g. 185"
          placeholderTextColor="#688065"
          keyboardType="numeric"
        />

        <Text style={commonStyles.label}>Field notes</Text>
        <TextInput
          style={[commonStyles.input, { height: 65, textAlignVertical: 'top' }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Surrounding habitat, nearby trail, moisture..."
          placeholderTextColor="#688065"
          multiline
        />

        <Text style={commonStyles.label}>Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosScroll}>
          {photos.map((p, idx) => (
            <View key={idx} style={styles.photoThumbWrap}>
              <Image source={{ uri: p.url }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.removePhotoBtn} onPress={() => removePhoto(idx)}>
                <Text style={styles.removePhotoText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addPhotoSlot} onPress={addDemoPhoto}>
            <Text style={styles.addPhotoPlus}>＋</Text>
            <Text style={styles.addPhotoLabel}>Add</Text>
          </TouchableOpacity>
        </ScrollView>

        <Text style={commonStyles.label}>Location & GPS</Text>
        <View style={styles.gpsRow}>
          <TouchableOpacity style={commonStyles.btnGhost} onPress={updateLocation}>
            <Text style={commonStyles.btnGhostText}>📍 Acquire GPS</Text>
          </TouchableOpacity>
          <Text style={[commonStyles.mute, { flex: 1 }]}>
            {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)} (±{spot.acc} m)
          </Text>
        </View>

        <TouchableOpacity style={[commonStyles.btnPrimary, { marginTop: 20 }]} onPress={save}>
          <Text style={commonStyles.btnPrimaryText}>✓ Save plant record</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepSection: {
    marginVertical: 10,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  stepBadgeText: {
    color: COLORS.textDark,
    fontWeight: '800',
    fontSize: 14,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  tagSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  tagOption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#0a1a11',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(155, 207, 106, 0.2)',
  },
  tagOptionText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  tagOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  qrPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 12,
    gap: 12,
    marginTop: 10,
  },
  qrBox: {
    backgroundColor: '#16301e',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 70,
  },
  qrSymbol: {
    color: COLORS.primary,
    fontSize: 26,
  },
  qrTagText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  qrActiveLabel: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  photosScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  photoThumbWrap: {
    position: 'relative',
    width: 65,
    height: 65,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  addPhotoSlot: {
    width: 65,
    height: 65,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a1a11',
  },
  addPhotoPlus: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  addPhotoLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
});
