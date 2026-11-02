// apps/mobile/pages/Review.js
// Officer review queue and the decision screen (CTIP-29, CTIP-69 on the web side).
import React, { useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, useWindowDimensions } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView, nameOf } from '../../shared/selectors.js';
import { HIDE_LOCATION_LABEL, hideLocationRule } from '../../shared/data.js';
import { useTheme, font } from '../components/Theme.js';
import {
  Screen, Bar, TitleBlock, Pills, SortBar, Row, Thumb, Mono, Txt, Sci, DotLabel, KV, Button, Area, Empty, Field, Notice, Check, TextLink,
} from '../components/Bits.js';
import PhotoNote from '../components/PhotoNote.js';
import SpeciesForm from '../components/SpeciesForm.js';
import { shortDate, dateTime, coords, accuracy } from '../components/format.js';
import { usePolling } from '../hooks/usePolling.js';

const FILTERS = [
  { key: 'synced', label: 'Needs review' },
  { key: 'returned', label: 'Returned' },
  { key: 'all', label: 'All' },
];

const SORT_REVIEW = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Waiting longest' },
  { key: 'name', label: 'Plant (A–Z)' },
  { key: 'botanist', label: 'Botanist (A–Z)' },
  { key: 'tag', label: 'Tag ID' },
];

export function ReviewQueue({ nav }) {
  usePolling(5000);
  const { db } = useStore();
  const { c } = useTheme();
  const [filter, setFilter] = useState('synced');
  const [sort, setSort] = useState('newest');
  const all = db.observations
    .filter((o) => ['synced', 'returned', 'approved', 'rejected'].includes(o.status))
    .map((o) => ({ ...o, plant: plantView(db, db.plants.find((p) => p.id === o.specimen_id)) }))
    .filter((o) => o.plant)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  const rows = all.filter((o) => filter === 'all' || o.status === filter);
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'oldest') return a.observed_at.localeCompare(b.observed_at);
    if (sort === 'name') return (a.plant?.name || '').localeCompare(b.plant?.name || '');
    if (sort === 'botanist') return nameOf(db, a.recorded_by).localeCompare(nameOf(db, b.recorded_by));
    if (sort === 'tag') return (a.plant?.qr_id || '').localeCompare(b.plant?.qr_id || '');
    return b.observed_at.localeCompare(a.observed_at);
  });
  const waiting = all.filter((o) => o.status === 'synced').length;
  const n = (k) => all.filter((o) => o.status === k).length;

  return (
    <Screen gap={16}>
      <TitleBlock title="Review" sub={waiting ? `${waiting} record${waiting === 1 ? '' : 's'} waiting for a decision` : 'Nothing is waiting'} />
      <Pills value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ key: f.key, label: f.key === 'all' ? f.label : `${f.label} ${n(f.key)}` }))} />
      <SortBar items={SORT_REVIEW} value={sort} onChange={setSort} />
      <View>
        {sorted.length === 0 ? <Empty icon="clipboard">No records here.</Empty> : null}
        {sorted.map((o, i) => (
          <Row
            key={o.id}
            left={<Thumb uri={o.plant.photos[0]?.url} size={64} />}
            title={o.plant.name}
            sub={
              <>
                <Mono size={13}>{o.plant.qr_id}</Mono>
                <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>· {nameOf(db, o.recorded_by)} · {shortDate(o.observed_at)}</Txt>
                {filter === 'all' ? <DotLabel status={o.status} /> : !o.plant.species ? <DotLabel tone="info" label="Species not confirmed" /> : null}
              </>
            }
            onPress={() => nav.go('reviewItem', { id: o.id })}
            last={i === sorted.length - 1}
          />
        ))}
      </View>
    </Screen>
  );
}

function Photos({ photos }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  if (!photos.length) return null;
  return (
    <View style={{ marginHorizontal: -20, marginTop: -20 }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {photos.map((p, i) => <Image key={p.id ? `${p.id}-${i}` : i} source={{ uri: p.url }} accessibilityLabel={p.caption || `Photo ${i + 1} of ${photos.length}`} style={{ width, height: 220, backgroundColor: c.accentSoft }} />)}
      </ScrollView>
      {photos.length > 1 ? (
        <View style={{ position: 'absolute', right: 12, top: 188, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: c.surface }}>
          <Text style={{ fontFamily: font('text', 700), fontSize: 12, color: c.ink }}>{index + 1} / {photos.length}</Text>
        </View>
      ) : null}
      <PhotoNote photo={photos[Math.min(index, photos.length - 1)]} style={{ paddingHorizontal: 20, paddingTop: 10 }} />
    </View>
  );
}

export function ReviewRecord({ nav, params = {} }) {
  usePolling(5000);
  const { db, reviewObservation, setPlantSpecies, setPlantLocationHidden, setSpeciesPublished, notify } = useStore();
  const { c } = useTheme();
  const o = db.observations.find((x) => x.id === params.id);
  const plant = o ? plantView(db, db.plants.find((p) => p.id === o.specimen_id)) : null;
  const [spText, setSpText] = useState(plant?.species?.scientific_name || plant?.proposed_species || '');
  const [note, setNote] = useState('');
  const [needNote, setNeedNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hideChoice, setHideChoice] = useState(null); // null until the officer changes it
  const [addingSpecies, setAddingSpecies] = useState(false);
  if (!o || !plant) return <Screen header={<Bar title="Review" onBack={nav.back} />}><Empty>This record no longer exists.</Empty></Screen>;

  const species = db.species.filter((s) => !s.is_deleted);
  const match = species.find((s) => s.scientific_name.toLowerCase() === spText.trim().toLowerCase());
  const suggestions = !match && spText.trim().length > 1 ? species.filter((s) => `${s.common_name} ${s.scientific_name}`.toLowerCase().includes(spText.trim().toLowerCase())).slice(0, 3) : [];
  const open = o.status === 'synced';
  const hideRule = hideLocationRule((match || plant.species)?.conservation_status, plant.endangered_override, hideChoice);

  // Waits for the API: the species must be saved before approving (the API checks it),
  // and the screen only closes when the decision was really saved.
  const decide = async (decision) => {
    if (decision !== 'approve' && !note.trim()) return setNeedNote(true);
    if (busy) return;
    setBusy(true);
    if (decision === 'approve' && match && match.id !== plant.species_id) await setPlantSpecies(plant.id, match.id);
    if (decision === 'approve' && plant.lat != null && !hideRule.locked && hideRule.on !== !!plant.endangered_override) {
      if (!(await setPlantLocationHidden(plant.id, hideRule.on))) return setBusy(false);
    }
    const r = await reviewObservation(o.id, decision, note.trim()); // shows its own message when it fails
    setBusy(false);
    if (!r?.ok) return;
    notify({ approve: `${plant.qr_id} approved and published`, return: `${plant.qr_id} returned to ${nameOf(db, o.recorded_by)}`, reject: `${plant.qr_id} rejected` }[decision]);
    nav.back();
  };

  return (
    <Screen
      header={<Bar title={plant.name} sub={`${plant.qr_id} · version ${o.version}`} onBack={nav.back} />}
      top={20}
      gap={18}
      footer={open ? (
        <>
          <Button label="Reject" kind="dangerText" flex={1} size={15} disabled={busy} onPress={() => decide('reject')} />
          <Button label="Return" kind="secondary" flex={1.2} size={15} disabled={busy} onPress={() => decide('return')} />
          <Button label="Approve" icon="check" flex={1.6} size={15} disabled={!match || busy} onPress={() => decide('approve')} />
        </>
      ) : null}
    >
      <Photos photos={plant.photos.filter((p) => p.observation_id === o.id).length ? plant.photos.filter((p) => p.observation_id === o.id) : plant.photos} />
      {plant.scientific ? <Sci size={16}>{plant.scientific}{plant.species?.family ? ` · ${plant.species.family}` : ''}</Sci> : null}
      {!open ? <DotLabel status={o.status} /> : null}
      {plant.lat == null ? <Notice tone="warning" icon="pin" title="Location not captured" body="The botanist's phone had no GPS fix, so this plant will not appear on the map. Ask where it is, or return the record for a location." /> : null}
      <KV rows={[
        ['Recorded by', `${nameOf(db, o.recorded_by)} · ${dateTime(o.observed_at)}`],
        ['Height', o.height_cm ? `${o.height_cm} cm` : '-'],
        ['Appearance', o.morphology || '-'],
        ['Notes', o.notes || '-'],
        ['Location', <Text key="l" style={{ fontFamily: font('mono', 500), fontSize: 14, color: c.ink }}>{coords(plant.lat, plant.lng)} <Text style={{ fontFamily: font('text', 400), color: c.ink2 }}>{plant.lat != null ? accuracy(o.gps_accuracy_m ?? plant.gps_accuracy_m) : ''}</Text></Text>],
      ]} />
      {open ? (
        <>
          <View style={{ gap: 6 }}>
            <Field label="Confirm species" value={spText} onChangeText={setSpText} italic
              hint={match ? `${match.common_name} · ${match.family}` : 'Pick a species from the list to approve.'} />
            {suggestions.map((s) => (
              <Pressable key={s.id} accessibilityRole="button" onPress={() => setSpText(s.scientific_name)} style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.bg }}>
                <Text style={{ fontFamily: font('text', 700), fontSize: 15, color: c.ink }}>{s.common_name}</Text>
                <Sci size={14}>{s.scientific_name}</Sci>
              </Pressable>
            ))}
            {!match ? <TextLink label="Not in the list? Create a new species" size={14} onPress={() => setAddingSpecies(true)} /> : null}
          </View>
          {match && !match.is_published ? (
            <View style={{ gap: 8 }}>
              <Notice tone="warning" icon="info" title="This species is not published" body="Visitors will not see this plant until it is, even after you approve it." />
              <Button label="Publish species" kind="secondary" height={44} size={15} onPress={() => setSpeciesPublished(match.id, true)} />
            </View>
          ) : null}
          {plant.lat != null ? (
            <Check
              label={HIDE_LOCATION_LABEL}
              hint={`${hideRule.locked ? '' : 'Saved when you approve. '}${hideRule.hint}`}
              value={hideRule.on}
              disabled={hideRule.locked}
              onChange={setHideChoice}
            />
          ) : null}
          <View style={{ gap: 6 }}>
            <Area label="Note to the botanist" value={note} onChangeText={(t) => { setNote(t); setNeedNote(false); }} placeholder="Needed to return or reject" />
            {needNote ? <Txt v="caption" color={c.danger}>Add a note so the botanist knows what to change.</Txt> : null}
          </View>
        </>
      ) : null}
      {addingSpecies ? (
        <SpeciesForm
          guess={spText}
          onClose={() => setAddingSpecies(false)}
          onSaved={(created) => {
            setAddingSpecies(false);
            setSpText(created.scientific_name);
          }}
        />
      ) : null}
    </Screen>
  );
}
