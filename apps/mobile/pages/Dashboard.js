// apps/mobile/pages/Dashboard.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { can } from '../../shared/permissions.js';
import { familyOf, shownCoords, visiblePlants } from '../../shared/selectors.js';
import { CONSERVATION } from '../../shared/data.js';
import { Chip, Empty } from '../components/Bits.js';
import PhotoGallery from '../components/PhotoGallery.js';
import PhotoEditor from '../components/PhotoEditor.js';
import { COLORS, commonStyles } from '../components/Theme.js';

const fmtHeight = (cm) => (cm == null ? '-' : cm >= 100 ? `${(cm / 100).toFixed(1)} m` : `${cm} cm`);

export default function MobileDashboard({ arg, onNavigate }) {
  const { db, role, setPlantPhotos, notify } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(false);
  const [selectedQr, setSelectedQr] = useState(arg || null);

  const staff = can(role, 'pending');
  const plants = visiblePlants(db, role);

  const options = staff ? CONSERVATION : [...new Set(plants.map(familyOf))].sort();
  const active = options.includes(filter) ? filter : 'all';

  const shown = plants.filter(
    (p) =>
      (active === 'all' || (staff ? p.conservation : familyOf(p)) === active) &&
      `${p.name} ${p.scientific} ${p.qr_id}`.toLowerCase().includes(q.toLowerCase())
  );

  // If a specific plant is selected (via arg or user click), pick it; otherwise show first or none
  const currentQr = selectedQr || arg;
  const sel = currentQr ? plants.find((p) => p.qr_id === currentQr) : null;

  return (
    <View>
      {/* If a plant is selected on mobile, show the detailed plant view */}
      {sel ? (
        <View style={commonStyles.card}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              setSelectedQr(null);
              if (arg) onNavigate?.('dashboard');
            }}
          >
            <Text style={styles.backBtnText}>‹ Back to plant list</Text>
          </TouchableOpacity>

          <PhotoGallery
            key={sel.id}
            photos={sel.photos}
            canEdit={can(role, 'editPhotos')}
            onEdit={() => setEditing(true)}
          />

          <View style={[commonStyles.row, { flexWrap: 'wrap', marginTop: 10 }]}>
            <Text style={[commonStyles.heading, { marginBottom: 0, flex: 1 }]}>{sel.name}</Text>
            {staff && <Chip value={sel.status} />}
          </View>

          {sel.scientific ? <Text style={styles.sciText}>{sel.scientific}</Text> : null}
          {sel.species?.description ? <Text style={commonStyles.mute}>{sel.species.description}</Text> : null}

          <View style={commonStyles.divider} />

          <Text style={commonStyles.subHeading}>Plant Details</Text>
          <PlantDetails plant={sel} role={role} onNavigate={onNavigate} />

          {staff && (
            <View style={styles.qrCard}>
              <View style={styles.qrBadgeIcon}>
                <Text style={styles.qrIconEmoji}>🏷️</Text>
                <Text style={styles.qrCodeLabel}>{sel.qr_id}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={commonStyles.mute}>Permanent tag assigned to this specimen.</Text>
                {role === 'officer' && (
                  <TouchableOpacity
                    style={[commonStyles.btnGhost, { marginTop: 8, alignSelf: 'flex-start' }]}
                    onPress={() => onNavigate?.('species')}
                  >
                    <Text style={commonStyles.btnGhostText}>Edit species details</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {editing && (
            <PhotoEditor
              photos={sel.photos}
              onClose={() => setEditing(false)}
              onSave={(list) => {
                setPlantPhotos(sel.id, list);
                setEditing(false);
                notify('Photos saved');
              }}
            />
          )}
        </View>
      ) : (
        /* Plant Library List view */
        <View>
          <View style={commonStyles.card}>
            <Text style={commonStyles.heading}>Plant library</Text>
            <Text style={commonStyles.mute}>
              {staff
                ? 'Browse all registered and pending plants. Filter by conservation status.'
                : 'Browse verified botanical species recorded in Niah.'}
            </Text>

            {/* Search */}
            <TextInput
              style={commonStyles.input}
              placeholder="Search by name, scientific name, or tag..."
              placeholderTextColor="#688065"
              value={q}
              onChangeText={setQ}
            />

            {/* Filter pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              <TouchableOpacity
                style={[styles.filterPill, active === 'all' && styles.filterPillActive]}
                onPress={() => setFilter('all')}
              >
                <Text style={[styles.filterPillText, active === 'all' && styles.filterPillTextActive]}>
                  {staff ? 'All status' : 'All families'}
                </Text>
              </TouchableOpacity>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.filterPill, active === opt && styles.filterPillActive]}
                  onPress={() => setFilter(opt)}
                >
                  <Text style={[styles.filterPillText, active === opt && styles.filterPillTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Plant cards */}
          {shown.length === 0 ? (
            <View style={commonStyles.card}>
              <Empty icon="search">No plants match your search.</Empty>
            </View>
          ) : (
            shown.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.plantRowCard}
                onPress={() => setSelectedQr(p.qr_id)}
              >
                <Image
                  source={{ uri: p.photos[0]?.url }}
                  style={styles.plantRowThumb}
                />
                <View style={styles.plantRowDetails}>
                  <Text style={styles.plantRowName}>{p.name}</Text>
                  <Text style={styles.plantRowSci}>{p.scientific || p.qr_id}</Text>
                  <View style={[commonStyles.row, { marginTop: 4 }]}>
                    <Text style={commonStyles.mute}>{p.qr_id}</Text>
                    {staff && p.status !== 'approved' && <Chip value={p.status} />}
                  </View>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function PlantDetails({ plant, role, onNavigate }) {
  const c = shownCoords(plant, role);
  const staff = can(role, 'pending');

  return (
    <View style={styles.dl}>
      <DetailItem label="Family" value={plant.species ? `${plant.species.family} · ${plant.species.genus}` : 'Not confirmed yet'} />
      {staff && (
        <View style={styles.detailRow}>
          <Text style={styles.dt}>Conservation</Text>
          <View style={styles.dd}>
            {plant.species ? <Chip value={plant.conservation} /> : <Text style={commonStyles.mute}>-</Text>}
          </View>
        </View>
      )}
      <View style={styles.detailRow}>
        <Text style={styles.dt}>Location</Text>
        <View style={styles.dd}>
          {c ? (
            <View>
              <TouchableOpacity
                style={[commonStyles.btnGhost, { paddingVertical: 4, paddingHorizontal: 8, marginBottom: 4 }]}
                onPress={() => onNavigate?.('map', plant.qr_id)}
              >
                <Text style={commonStyles.btnGhostText}>📍 View on map</Text>
              </TouchableOpacity>
              <Text style={commonStyles.mute}>
                {c.lat.toFixed(5)}, {c.lng.toFixed(5)} (±{plant.gps_accuracy_m} m)
              </Text>
            </View>
          ) : (
            <Text style={commonStyles.mute}>Hidden to protect this plant.</Text>
          )}
        </View>
      </View>
      <DetailItem label="ID" value={plant.qr_id} />
      <DetailItem label="Height" value={fmtHeight(plant.height_cm)} />
      {plant.morphology ? <DetailItem label="Appearance" value={plant.morphology} /> : null}
      {plant.species?.cultural_significance ? <DetailItem label="Cultural note" value={plant.species.cultural_significance} /> : null}
    </View>
  );
}

function DetailItem({ label: dt, value: dd }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.dt}>{dt}</Text>
      <Text style={[styles.dd, commonStyles.body, { marginBottom: 0 }]}>{dd}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    paddingVertical: 6,
    marginBottom: 8,
  },
  backBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  sciText: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
    fontSize: 14,
    marginVertical: 4,
  },
  qrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    marginTop: 14,
  },
  qrBadgeIcon: {
    backgroundColor: '#16301e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  qrIconEmoji: {
    fontSize: 22,
  },
  qrCodeLabel: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 11,
    marginTop: 4,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
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
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  filterPillTextActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },
  plantRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  plantRowThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  plantRowDetails: {
    flex: 1,
  },
  plantRowName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  plantRowSci: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
    fontSize: 12,
  },
  rowChevron: {
    color: COLORS.textMuted,
    fontSize: 22,
    fontWeight: '600',
  },
  dl: {
    gap: 10,
    marginVertical: 8,
  },
  detailRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: 6,
  },
  dt: {
    width: 100,
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  dd: {
    flex: 1,
  },
});
