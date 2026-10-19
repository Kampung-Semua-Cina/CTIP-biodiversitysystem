// apps/mobile/pages/Species.js
// Officer's species list with publish state. Creating and editing species is done on
// the website (CTIP-28); here officers look things up in the field.
import React, { useState } from 'react';
import { View } from 'react-native';

import { useStore } from '../../shared/store.js';
import { visiblePlants } from '../../shared/selectors.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, SearchField, Row, Thumb, Sci, DotLabel, Notice, Empty } from '../components/Bits.js';

export default function SpeciesAdmin({ nav }) {
  const { db, role } = useStore();
  useTheme();
  const [q, setQ] = useState('');
  const plants = visiblePlants(db, role);
  const all = db.species.filter((s) => !s.is_deleted).sort((a, b) => (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name));
  const needle = q.trim().toLowerCase();
  const rows = all.filter((s) => !needle || [s.common_name, s.scientific_name, s.family].join(' ').toLowerCase().includes(needle));
  const unpublished = all.filter((s) => !s.is_published).length;

  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={16}>
      <TitleBlock title="Species" sub={`${all.length} species · ${unpublished} not published`} />
      <SearchField value={q} onChangeText={setQ} placeholder="Search species" />
      <View>
        {rows.length === 0 ? <Empty icon="search">No species match.</Empty> : null}
        {rows.map((s, i) => (
          <Row
            key={s.id}
            left={<Thumb uri={plants.find((p) => p.species_id === s.id && p.photos.length)?.photos[0]?.url} />}
            title={s.common_name || s.scientific_name}
            sub={<><Sci size={14}>{s.scientific_name}</Sci>{!s.is_published ? <DotLabel tone="neutral" label="Not published" /> : null}</>}
            right={<DotLabel status={s.conservation_status} />}
            onPress={() => nav.go('species', { id: s.id })}
            last={i === rows.length - 1}
          />
        ))}
      </View>
      <Notice tone="info" title="Adding or editing a species?" body="Use the Species page on the website." />
    </Screen>
  );
}
