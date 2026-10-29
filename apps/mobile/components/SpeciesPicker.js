// apps/mobile/components/SpeciesPicker.js
// The species field on a new plant record: type a name, and published species
// that match come from the API (CTIP-26). Picking one fills the record (CTIP-63).
// The botanist can always submit the name they typed, even with no connection.
import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { summarize } from '../../shared/speciesSearch.js';
import { useSpeciesSearch } from '../hooks/useSpeciesSearch.js';
import { useTheme, font } from './Theme.js';
import { Field, Sci, Txt, Thumb, DotLabel, SkeletonRow, Notice, Button } from './Bits.js';

const MAX_RESULTS = 5;

function Result({ s, onPress }) {
  const { c } = useTheme();
  const taxonomy = [s.family, s.genus].filter(Boolean).join(' · ');
  const about = summarize(s.description);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Pick ${s.common_name || s.scientific_name}`} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12,
        borderRadius: 10, backgroundColor: c.bg, opacity: pressed ? 0.7 : 1 })}>
      <Thumb uri={s.primary_image_url || undefined} size={48} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontFamily: font('text', 700), fontSize: 15, color: c.ink }}>{s.common_name || s.scientific_name}</Text>
        <Sci size={14}>{s.scientific_name}</Sci>
        {taxonomy ? <Txt v="caption" color={c.ink2}>{taxonomy}</Txt> : null}
        {about ? <Txt v="caption" color={c.ink2} numberOfLines={2}>{about}</Txt> : null}
      </View>
      {s.conservation_status ? <DotLabel status={s.conservation_status} /> : null}
    </Pressable>
  );
}

export default function SpeciesPicker({ value, onChange, onPick, error }) {
  const { c } = useTheme();
  const search = useSpeciesSearch({ q: value });
  const needle = value.trim().toLowerCase();
  const exact = search.items.find((s) => s.scientific_name.toLowerCase() === needle);
  const results = exact ? [] : search.items.slice(0, MAX_RESULTS);
  const searching = search.active && !exact;

  const hint = exact
    ? [exact.common_name, exact.family].filter(Boolean).join(' · ') + '. From the species list.'
    : 'Type at least 2 letters to search the species list, or enter the name yourself.';

  return (
    <View style={{ gap: 6 }}>
      <Field label="Species (required)" value={value} onChangeText={onChange} placeholder="Start typing a name" italic error={error} hint={hint} />
      {searching && search.loading && results.length === 0 ? <SkeletonRow /> : null}
      {results.map((s) => <Result key={s.id} s={s} onPress={() => onPick(s)} />)}
      {searching && search.error ? (
        <View style={{ gap: 8 }}>
          <Notice tone="warning" icon="info" title="Species search unavailable" body={search.error} />
          <Button label="Try again" kind="secondary" height={44} size={15} onPress={search.retry} />
        </View>
      ) : null}
      {searching && !search.loading && !search.error && results.length === 0 ? (
        <Txt v="caption" color={c.ink2}>No published species match. You can submit with the name you typed.</Txt>
      ) : null}
    </View>
  );
}
