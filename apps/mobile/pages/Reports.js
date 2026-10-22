// apps/mobile/pages/Reports.js
// A quick summary for officers in the field. CSV and PDF exports are on the website (CTIP-32).
import React from 'react';
import { View } from 'react-native';

import { useStore } from '../../shared/store.js';
import { visiblePlants } from '../../shared/selectors.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, Stat, Section, Txt, Notice } from '../components/Bits.js';

function Bar({ label, n, total, tone }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt v="body" style={{ fontSize: 15 }}>{label}</Txt>
        <Txt v="label">{n}</Txt>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.bg, overflow: 'hidden' }}>
        <View style={{ width: `${total ? (n / total) * 100 : 0}%`, height: 10, borderRadius: 5, backgroundColor: c[tone] }} />
      </View>
    </View>
  );
}

export default function Reports({ nav }) {
  const { db, role } = useStore();
  const plants = visiblePlants(db, role);
  const latestStatus = (p) => p.status;
  const count = (s) => plants.filter((p) => latestStatus(p) === s).length;
  const species = db.species.filter((s) => !s.is_deleted).length;
  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={18}>
      <TitleBlock title="Reports" sub="Niah National Park · all time" />
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat value={plants.length} label="Tagged plants" />
          <Stat value={species} label="Species" />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat value={plants.filter((p) => p.endangered).length} label="Endangered plants tagged" tone="danger" />
          <Stat value={db.alerts.filter((a) => a.status === 'open').length} label="Open alerts" tone="danger" />
        </View>
      </View>
      <Section title="Plants by record status" gap={14}>
        <Bar label="Published" n={count('approved')} total={plants.length} tone="success" />
        <Bar label="Needs review" n={count('synced')} total={plants.length} tone="info" />
        <Bar label="Returned" n={count('returned')} total={plants.length} tone="warning" />
      </Section>
      <Notice tone="info" title="Need a file?" body="Download CSV or PDF reports from the Reports page on the website." />
    </Screen>
  );
}
