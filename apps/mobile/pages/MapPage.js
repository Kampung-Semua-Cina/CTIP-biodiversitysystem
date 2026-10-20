// apps/mobile/pages/MapPage.js
// Plant map: every plant this role may see as a dot. Endangered plants have no
// dot for visitors (their location is never sent to the public, CTIP-71).
// Leaflet/OpenStreetMap tiles come with CTIP-31; this draws the park outline only.
import React, { useState } from 'react';
import { View, Pressable, ScrollView, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStore } from '../../shared/store.js';
import { visiblePlants, shownCoords } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { MiniMap, Thumb, Sci, Mono, Txt, IconButton } from '../components/Bits.js';
import { mapPoint } from './PlantPage.js';

export default function MapPage({ nav, params = {} }) {
  const { db, role } = useStore();
  const { c } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [family, setFamily] = useState('all');
  const [q, setQ] = useState('');
  const plants = visiblePlants(db, role);
  const families = [...new Set(plants.map((p) => p.species?.family).filter(Boolean))].sort();
  const needle = q.trim().toLowerCase();
  const shown = plants
    .filter((p) => family === 'all' || p.species?.family === family)
    .filter((p) => !needle || [p.name, p.scientific, p.qr_id].join(' ').toLowerCase().includes(needle))
    .map((p) => ({ p, where: shownCoords(p, role) }));
  const onMap = shown.filter((s) => s.where);
  const hidden = shown.length - onMap.length;
  const firstForSpecies = params.species ? onMap.find((s) => s.p.species_id === params.species)?.p.id : null;
  const [selectedId, setSelectedId] = useState(firstForSpecies || onMap[0]?.p.id || null);
  const selected = plants.find((p) => p.id === selectedId);

  // The dots are drawn by MiniMap; these invisible 44px buttons sit on top so they are easy to tap.
  const dotAt = (where) => {
    const pt = mapPoint(where);
    return { left: pt.x * size.w, top: pt.y * size.h };
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.mapTile }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.h ? (
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
          <MiniMap height={size.h} width={size.w} rounded={false} dots={onMap.map((s) => ({ ...mapPoint(s.where), selected: s.p.id === selectedId }))} />
          {onMap.map((s) => {
            const pos = dotAt(s.where);
            return (
              <Pressable key={s.p.id} accessibilityRole="button" accessibilityLabel={`${s.p.name}, ${s.p.qr_id}`} onPress={() => setSelectedId(s.p.id)}
                style={{ position: 'absolute', left: pos.left - 22, top: pos.top - 22, width: 44, height: 44 }} />
            );
          })}
        </View>
      ) : null}

      <SafeAreaView edges={['top']} style={{ gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: nav.canGoBack ? 2 : 14, paddingRight: 14, borderRadius: 999, backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 }}>
          {nav.canGoBack ? <IconButton name="chevL" label="Back" onPress={nav.back} size={22} /> : <Icon name="search" size={20} color={c.ink3} />}
          <TextInput value={q} onChangeText={setQ} placeholder="Search the map" placeholderTextColor={c.ink3} accessibilityLabel="Search the map"
            style={{ flex: 1, fontFamily: font('text', 400), fontSize: 16, color: c.ink }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {[{ key: 'all', label: 'All families' }, ...families.map((f) => ({ key: f, label: f }))].map((it) => {
            const on = it.key === family;
            return (
              <Pressable key={it.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFamily(it.key)}
                style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? c.accent : c.surface, borderWidth: on ? 0 : 1, borderColor: c.line }}>
                <Text style={{ fontFamily: font('text', on ? 700 : 600), fontSize: 14, color: on ? c.onAccent : c.ink }}>{it.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <View style={{ flex: 1 }} />

      <View style={{ margin: 12, gap: 12, padding: 16, paddingVertical: 14, borderRadius: 20, backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, elevation: 6 }}>
        {selected ? (
          <Pressable accessibilityRole="button" onPress={() => nav.go('tag', { qr: selected.qr_id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Thumb uri={selected.photos[0]?.url} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: font('display', 600), fontSize: 17, color: c.ink }}>{selected.name}</Text>
              {selected.scientific ? <Sci size={14}>{selected.scientific}</Sci> : null}
              <Mono size={13} color={c.ink2}>{selected.qr_id}</Mono>
            </View>
            <Icon name="chevR" size={20} color={c.ink3} />
          </Pressable>
        ) : (
          <Txt v="body" color={c.ink2}>No plants match. Try another family or name.</Txt>
        )}
        {hidden > 0 ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Icon name="lock" size={16} color={c.ink2} />
            <Txt v="caption" color={c.ink2} style={{ flex: 1, fontFamily: font('text', 600) }}>
              {hidden} endangered plant{hidden === 1 ? ' is' : 's are'} not shown, to protect {hidden === 1 ? 'it' : 'them'}.
            </Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
}
