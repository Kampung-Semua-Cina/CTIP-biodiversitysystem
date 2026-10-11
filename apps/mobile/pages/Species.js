// apps/mobile/pages/Species.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { CONSERVATION } from '../../shared/data.js';
import { label } from '../../shared/utils.js';
import { Chip, Empty, Modal } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

const BLANK = {
  scientific_name: '',
  common_name: '',
  family: '',
  genus: '',
  description: '',
  conservation_status: 'least concern',
  cultural_significance: '',
};

export default function MobileSpecies() {
  const { db, saveSpecies, togglePublish, deleteSpecies, notify } = useStore();
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // active species being edited or BLANK
  const [removing, setRemoving] = useState(null);

  const list = db.species
    .filter((s) => !s.is_deleted)
    .filter((s) => `${s.scientific_name} ${s.common_name} ${s.family}`.toLowerCase().includes(q.toLowerCase()));

  const save = () => {
    if (!form.scientific_name.trim()) return notify('Enter the scientific name');
    const name = form.scientific_name.trim();
    if (
      db.species.some(
        (s) => !s.is_deleted && s.id !== form.id && s.scientific_name.toLowerCase() === name.toLowerCase()
      )
    ) {
      return notify('This species is already in the encyclopedia');
    }
    saveSpecies({ ...form, scientific_name: name });
    setForm(null);
    notify('Species saved');
  };

  const inUse = removing ? db.plants.filter((p) => p.species_id === removing.id).length : 0;

  return (
    <View>
      <View style={commonStyles.card}>
        <View style={[commonStyles.row, { justifyContent: 'space-between' }]}>
          <Text style={commonStyles.heading}>Species</Text>
          <TouchableOpacity style={commonStyles.btnPrimary} onPress={() => setForm(BLANK)}>
            <Text style={commonStyles.btnPrimaryText}>＋ Add species</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={commonStyles.input}
          placeholder="Search by scientific name, common name, or family..."
          placeholderTextColor="#688065"
          value={q}
          onChangeText={setQ}
        />
      </View>

      {list.length === 0 ? (
        <View style={commonStyles.card}>
          <Empty>No species match your search.</Empty>
        </View>
      ) : (
        list.map((s) => (
          <View key={s.id} style={commonStyles.card}>
            <View style={[commonStyles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.commonName}>{s.common_name || s.scientific_name}</Text>
                <Text style={styles.sciName}>{s.scientific_name}</Text>
                <Text style={commonStyles.mute}>
                  Family: {s.family} {s.genus ? `· ${s.genus}` : ''}
                </Text>
              </View>
              <Chip value={s.conservation_status} />
            </View>

            <View style={[commonStyles.row, styles.bottomActionRow]}>
              <View style={commonStyles.row}>
                <Text style={commonStyles.mute}>Public:</Text>
                <Switch
                  value={s.is_published}
                  onValueChange={() => togglePublish(s.id)}
                  trackColor={{ false: '#26422f', true: COLORS.primary }}
                  thumbColor={s.is_published ? '#14301d' : '#889e82'}
                />
              </View>

              <View style={[commonStyles.row, { gap: 6 }]}>
                <TouchableOpacity style={commonStyles.btnGhost} onPress={() => setForm(s)}>
                  <Text style={commonStyles.btnGhostText}>✏️ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnGhost, { borderColor: 'rgba(224, 93, 93, 0.4)' }]}
                  onPress={() => setRemoving(s)}
                >
                  <Text style={[commonStyles.btnGhostText, { color: '#ff8787' }]}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))
      )}

      {/* Add / Edit Modal */}
      {form && (
        <Modal
          visible
          title={form.id ? 'Edit species' : 'Add species'}
          onClose={() => setForm(null)}
        >
          <Text style={commonStyles.label}>Scientific Name (required)</Text>
          <TextInput
            style={commonStyles.input}
            value={form.scientific_name}
            onChangeText={(v) => setForm({ ...form, scientific_name: v })}
            placeholder="e.g. Nepenthes ampullaria"
            placeholderTextColor="#688065"
          />

          <Text style={commonStyles.label}>Common Name</Text>
          <TextInput
            style={commonStyles.input}
            value={form.common_name}
            onChangeText={(v) => setForm({ ...form, common_name: v })}
            placeholder="e.g. Ampullaria pitcher plant"
            placeholderTextColor="#688065"
          />

          <Text style={commonStyles.label}>Family</Text>
          <TextInput
            style={commonStyles.input}
            value={form.family}
            onChangeText={(v) => setForm({ ...form, family: v })}
            placeholder="e.g. Nepenthaceae"
            placeholderTextColor="#688065"
          />

          <Text style={commonStyles.label}>Genus</Text>
          <TextInput
            style={commonStyles.input}
            value={form.genus}
            onChangeText={(v) => setForm({ ...form, genus: v })}
            placeholder="e.g. Nepenthes"
            placeholderTextColor="#688065"
          />

          <Text style={commonStyles.label}>Conservation Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusScroll}>
            {CONSERVATION.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.statusChip, form.conservation_status === c && styles.statusChipActive]}
                onPress={() => setForm({ ...form, conservation_status: c })}
              >
                <Text style={[styles.statusChipText, form.conservation_status === c && styles.statusChipTextActive]}>
                  {label(c)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={commonStyles.label}>Description</Text>
          <TextInput
            style={[commonStyles.input, { height: 70, textAlignVertical: 'top' }]}
            value={form.description}
            onChangeText={(v) => setForm({ ...form, description: v })}
            placeholder="Botanical characteristics and habitat..."
            placeholderTextColor="#688065"
            multiline
          />

          <Text style={commonStyles.label}>Cultural significance</Text>
          <TextInput
            style={[commonStyles.input, { height: 60, textAlignVertical: 'top' }]}
            value={form.cultural_significance}
            onChangeText={(v) => setForm({ ...form, cultural_significance: v })}
            placeholder="Indigenous uses or folklore..."
            placeholderTextColor="#688065"
            multiline
          />

          <TouchableOpacity style={[commonStyles.btnPrimary, { marginTop: 16 }]} onPress={save}>
            <Text style={commonStyles.btnPrimaryText}>✓ Save species</Text>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {removing && (
        <Modal visible title="Delete species" onClose={() => setRemoving(null)}>
          <Text style={commonStyles.body}>
            Delete <Text style={{ fontWeight: '700' }}>{removing.scientific_name}</Text>?
          </Text>
          {inUse > 0 ? (
            <Text style={[commonStyles.mute, { color: COLORS.warning, marginBottom: 12 }]}>
              ⚠️ {inUse} tagged plant{inUse > 1 ? 's currently reference' : ' references'} this species and will display as unconfirmed.
            </Text>
          ) : null}

          <View style={[commonStyles.row, { gap: 10, marginTop: 8 }]}>
            <TouchableOpacity
              style={commonStyles.btnDanger}
              onPress={() => {
                deleteSpecies(removing.id);
                setRemoving(null);
                notify('Species deleted');
              }}
            >
              <Text style={commonStyles.btnDangerText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={commonStyles.btnGhost} onPress={() => setRemoving(null)}>
              <Text style={commonStyles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  commonName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sciName: {
    color: COLORS.primary,
    fontStyle: 'italic',
    fontSize: 13,
    marginVertical: 2,
  },
  bottomActionRow: {
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  statusScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0a1a11',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusChipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  statusChipTextActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },
});
