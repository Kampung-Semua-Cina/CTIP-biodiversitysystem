// apps/mobile/components/SpeciesForm.js
// Add a species in a window, so an officer can create it without leaving the record
// under review. Starts from the botanist's guess.
import React, { useState } from 'react';
import { View, Text, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../../shared/store.js';
import { BLANK_SPECIES, CONSERVATION } from '../../shared/data.js';
import { label } from '../../shared/utils.js';
import { useTheme, font } from './Theme.js';
import { Field, Area, Pills, Check, Button, IconButton, Txt } from './Bits.js';

export default function SpeciesForm({ guess, onClose, onSaved }) {
  const { db, saveSpecies, setSpeciesPublished, notify } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ ...BLANK_SPECIES, scientific_name: guess?.trim() || '', conservation_status: 'not evaluated' });
  const [publish, setPublish] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm({ ...form, [k]: v });

  const save = async () => {
    const name = form.scientific_name.trim();
    if (!name) return notify('Enter the scientific name');
    if (db.species.some((s) => !s.is_deleted && s.scientific_name.toLowerCase() === name.toLowerCase())) {
      return notify('This species is already in the list');
    }
    setSaving(true);
    const r = await saveSpecies({ ...form, scientific_name: name });
    if (r.ok && publish) await setSpeciesPublished(r.species.id, true);
    setSaving(false);
    if (r.ok) onSaved(r.species); // on failure the form stays open with what was typed
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 20, color: c.ink }}>Add species</Text>
          <IconButton name="x" label="Close" onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 16 }}>
          <Field label="Scientific name" value={form.scientific_name} onChangeText={set('scientific_name')} italic />
          <Field label="Common name" optional value={form.common_name || ''} onChangeText={set('common_name')} />
          <Field label="Family" optional value={form.family || ''} onChangeText={set('family')} />
          <Field label="Genus" optional value={form.genus || ''} onChangeText={set('genus')} />
          <View style={{ gap: 6 }}>
            <Txt v="label">Conservation status</Txt>
            <Pills value={form.conservation_status} onChange={set('conservation_status')} items={CONSERVATION.map((k) => ({ key: k, label: label(k) }))} />
          </View>
          <Area label="Description" optional value={form.description || ''} onChangeText={set('description')} />
          <Area label="Cultural significance" optional rows={2} value={form.cultural_significance || ''} onChangeText={set('cultural_significance')} />
          <Check label="Publish it in the public catalogue" value={publish} onChange={setPublish} />
          <Button label={saving ? 'Saving…' : 'Save species'} icon="check" disabled={saving} onPress={save} />
        </ScrollView>
      </View>
    </Modal>
  );
}
