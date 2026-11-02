// apps/mobile/pages/Reports.js
// A quick summary for officers in the field: counts, and bars by family, species and
// status. Tapping a bar lists its plants. CSV and PDF exports are on the website (CTIP-32).
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';

import { useStore } from '../../shared/store.js';
import { countPlants, visiblePlants } from '../../shared/selectors.js';
import { label } from '../../shared/utils.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, Stat, Section, Txt, Mono, Sci, Row, Thumb, Notice, Button } from '../components/Bits.js';

function Bar({ label, n, max, tone = 'accent', onPress, on }) {
  const { c } = useTheme();
  const body = (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Txt v={on ? 'label' : 'body'} style={{ fontSize: 15, flex: 1 }}>{label}</Txt>
        <Txt v="label">{n}</Txt>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.bg, overflow: 'hidden' }}>
        <View style={{ width: `${max ? (n / max) * 100 : 0}%`, height: 10, borderRadius: 5, backgroundColor: c[tone] }} />
      </View>
    </>
  );
  if (!onPress) return <View style={{ gap: 6, paddingVertical: 4 }}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} accessibilityLabel={`${label}: ${n} ${n === 1 ? 'plant' : 'plants'}. Show them.`}
      onPress={onPress} style={{ gap: 6, paddingVertical: 4, minHeight: 44 }}>
      {body}
    </Pressable>
  );
}

function Bars({ title, rows, picked, onPick }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <Section title={title} gap={10}>
      {rows.map((r) => {
        const id = `${title}:${r.label}`;
        return <Bar key={r.label} label={r.label} n={r.n} max={max} on={picked?.id === id}
          onPress={() => onPick(picked?.id === id ? null : { id, label: r.label, plants: r.plants })} />;
      })}
    </Section>
  );
}

export default function Reports({ nav }) {
  const { db, role } = useStore();
  const { c } = useTheme();
  const [picked, setPicked] = useState(null);
  const plants = visiblePlants(db, role);
  const count = (s) => plants.filter((p) => p.status === s).length;
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
      <Section title="Plants by record status" gap={10}>
        <Bar label="Published" n={count('approved')} max={plants.length} tone="success" />
        <Bar label="Needs review" n={count('synced')} max={plants.length} tone="info" />
        <Bar label="Returned" n={count('returned')} max={plants.length} tone="warning" />
      </Section>
      <Txt v="caption" color={c.ink2}>Tap a bar below to list those plants.</Txt>
      <Bars title="By conservation status" rows={countPlants(plants, (p) => (p.conservation === 'unknown' ? null : label(p.conservation)))} picked={picked} onPick={setPicked} />
      <Bars title="By family" rows={countPlants(plants, (p) => p.species?.family)} picked={picked} onPick={setPicked} />
      <Bars title="By species" rows={countPlants(plants, (p) => p.scientific || null)} picked={picked} onPick={setPicked} />
      {picked ? (
        <Section title={`${picked.label} (${picked.plants.length})`} gap={0}
          right={<Button label="Close" kind="text" height={36} size={14} onPress={() => setPicked(null)} />}>
          {picked.plants.map((p, i) => (
            <Row key={p.id} serif={false} left={<Thumb uri={p.photos[0]?.url} size={48} />} title={p.name}
              sub={<>{p.scientific ? <Sci size={14}>{p.scientific}</Sci> : null}<Mono size={13}>{p.qr_id}</Mono></>}
              onPress={() => nav.go('tag', { qr: p.qr_id })} last={i === picked.plants.length - 1} />
          ))}
        </Section>
      ) : null}
      <Notice tone="info" title="Need a file?" body="Download CSV or PDF reports from the Reports page on the website." />
    </Screen>
  );
}
