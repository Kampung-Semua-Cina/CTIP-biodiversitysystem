// apps/mobile/pages/Tags.js
// QR tag stock: how many are unused, assigned and retired, and a lookup by ID.
// Tags are printed in batches from the website; nothing is printed in the field.
import React, { useState } from 'react';
import { View } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView } from '../../shared/selectors.js';
import { useTheme } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { Screen, Header, IconButton, TitleBlock, Stat, Notice, SearchField, Row, Mono, Txt, DotLabel, Empty } from '../components/Bits.js';

export default function Tags({ nav }) {
  const { db } = useStore();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const n = (s) => db.tags.filter((t) => t.status === s).length;
  const order = { unused: 0, assigned: 1, retired: 2 };
  const needle = q.trim().toUpperCase();
  const rows = db.tags
    .filter((t) => !needle || t.qr_id.includes(needle))
    .sort((a, b) => order[a.status] - order[b.status] || a.qr_id.localeCompare(b.qr_id));
  const plantFor = (qr) => plantView(db, db.plants.find((p) => p.qr_id === qr));

  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={16}>
      <TitleBlock title="QR tags" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat value={n('unused')} label="Unused" />
        <Stat value={n('assigned')} label="Assigned" />
        <Stat value={n('retired')} label="Retired" />
      </View>
      <Notice tone="info" title="Printing is done on the website" body="Generate and print new tag batches from the QR tags page on the web." />
      <SearchField value={q} onChangeText={setQ} placeholder="Find a tag ID" />
      <View>
        {rows.length === 0 ? <Empty icon="qr">No tag with that ID.</Empty> : null}
        {rows.map((t, i) => {
          const p = t.status === 'assigned' ? plantFor(t.qr_id) : null;
          return (
            <Row
              key={t.qr_id}
              serif={false}
              left={<Icon name="qr" size={22} color={c.ink2} />}
              title={<Mono size={16}>{t.qr_id}</Mono>}
              sub={<Txt v="small" color={c.ink2} style={{ fontSize: 14 }}>{p ? p.name : `Batch ${t.batch_label}`}</Txt>}
              right={<DotLabel status={t.status} />}
              onPress={p ? () => nav.go('tag', { qr: t.qr_id }) : undefined}
              last={i === rows.length - 1}
            />
          );
        })}
      </View>
    </Screen>
  );
}
