// apps/mobile/pages/Records.js
// A botanist's own records, grouped by what needs doing, and one record in detail
// (with the officer's note and "Resubmit" when it was returned).
import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView, nameOf, unfinishedPlants, recordMatches, draftMatches } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import PlantSpotMap from '../components/PlantSpotMap.js';
import {
  Screen, Bar, TitleBlock, Pills, SortBar, SearchField, Section, Row, Thumb, Mono, Txt, Sci, DotLabel, Notice, KV, Button, Area, Avatar, Empty, Field,
} from '../components/Bits.js';
import { shortDate, dateTime, coords, accuracy } from '../components/format.js';
import { usePolling } from '../hooks/usePolling.js';
import { listDrafts } from '../draftStore.js';

const GROUPS = [
  { key: 'fix', title: 'Needs you', statuses: ['returned', 'draft'] },
  { key: 'review', title: 'In review', statuses: ['synced', 'queued'] },
  { key: 'published', title: 'Published', statuses: ['approved'] },
  { key: 'rejected', title: 'Rejected', statuses: ['rejected'] },
];

const SORT_RECORDS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'name', label: 'Plant (A–Z)' },
  { key: 'tag', label: 'Tag ID' },
];

export function MyRecords({ nav }) {
  usePolling(5000);
  const { db, me } = useStore();
  const { c } = useTheme();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [q, setQ] = useState('');
  const [localDrafts, setLocalDrafts] = useState([]);

  useEffect(() => {
    let active = true;
    listDrafts().then((items) => {
      if (active) setLocalDrafts(items || []);
    }).catch(() => {});
    return () => { active = false; };
  }, [db]);

  const unfinished = unfinishedPlants(db, me?.id);

  // Exclude tags that already have synced/approved/rejected observations by this user
  const settledTags = new Set(
    db.observations
      .filter((o) => o.recorded_by === me?.id && (o.status === 'synced' || o.status === 'approved' || o.status === 'rejected'))
      .map((o) => db.plants.find((p) => p.id === o.specimen_id)?.qr_id)
      .filter(Boolean)
  );

  // Combine server unfinished plants with local device crash-safe drafts (CTIP-57)
  const combinedUnfinished = [...unfinished];
  for (const d of localDrafts) {
    if (!d.qr_id || settledTags.has(d.qr_id)) continue;
    const existingIdx = combinedUnfinished.findIndex((p) => p.qr_id === d.qr_id);
    if (existingIdx >= 0) {
      combinedUnfinished[existingIdx] = {
        ...combinedUnfinished[existingIdx],
        proposed_species: d.proposed_species || combinedUnfinished[existingIdx].proposed_species,
        photos: d.photos?.length ? d.photos : combinedUnfinished[existingIdx].photos,
      };
    } else {
      combinedUnfinished.unshift({
        id: `draft-${d.qr_id}`,
        qr_id: d.qr_id,
        proposed_species: d.proposed_species || 'Unnamed plant',
        photos: d.photos || [],
        is_local_draft: true,
      });
    }
  }
  const mine = db.observations
    .filter((o) => o.recorded_by === me?.id)
    .map((o) => ({ ...o, plant: plantView(db, db.plants.find((p) => p.id === o.specimen_id)) }))
    .filter((o) => o.plant)
    .sort((a, b) => {
      if (sort === 'oldest') return a.observed_at.localeCompare(b.observed_at);
      if (sort === 'name') return (a.plant?.name || '').localeCompare(b.plant?.name || '');
      if (sort === 'tag') return (a.plant?.qr_id || '').localeCompare(b.plant?.qr_id || '');
      return b.observed_at.localeCompare(a.observed_at);
    });

  const filteredMine = mine.filter((o) => recordMatches(o, o.plant, q));
  const filteredUnfinished = combinedUnfinished.filter((p) => draftMatches(p, q));

  const count = (g) => {
    const obsCount = filteredMine.filter((o) => g.statuses.includes(o.status)).length;
    if (g.key === 'fix') return obsCount + filteredUnfinished.length;
    return obsCount;
  };
  const groups = GROUPS.filter((g) => (filter === 'all' || filter === g.key) && count(g) > 0);
  // A plant's later visits are labelled as revisits.
  const isRevisit = (o) => db.observations.some((x) => x.specimen_id === o.specimen_id && x.observed_at < o.observed_at);

  return (
    <Screen gap={18}>
      <TitleBlock title="My records" sub={me?.full_name} />
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder="Search records by plant, species or tag"
      />
      <Pills
        value={filter}
        onChange={setFilter}
        items={[{ key: 'all', label: `All ${filteredMine.length + filteredUnfinished.length}` }, ...GROUPS.filter((g) => count(g)).map((g) => ({ key: g.key, label: `${g.title === 'Needs you' ? 'To fix' : g.title} ${count(g)}` }))]}
      />
      <SortBar items={SORT_RECORDS} value={sort} onChange={setSort} />
      {filteredUnfinished.length > 0 && (filter === 'all' || filter === 'fix') ? (
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Notice
            tone="warning"
            icon="file"
            title="Not sent yet"
            body={`${filteredUnfinished.length === 1 ? 'This plant was' : 'These plants were'} saved as a draft, but the record did not reach the server. Finish and send to put it in the review queue.`}
          />
          <View style={{ gap: 14 }}>
            {filteredUnfinished.map((p) => (
              <View
                key={p.id}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: c.warningLine || c.line,
                  backgroundColor: c.surface,
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {p.photos && p.photos[0]?.url ? <Thumb uri={p.photos[0]?.url} /> : null}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Txt v="label" style={{ fontSize: 16 }}>{p.proposed_species || 'Unnamed plant'}</Txt>
                    <Mono size={13}>{p.qr_id}</Mono>
                  </View>
                  <DotLabel status="draft" label="Draft" />
                </View>
                <Button
                  label="Finish and send"
                  icon="send"
                  size={14}
                  height={42}
                  onPress={() => nav.go('add', { qr: p.qr_id })}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {filteredMine.length === 0 && filteredUnfinished.length === 0 ? (
        <Empty icon="file">{q.trim() ? `No records match "${q.trim()}".` : 'No records yet. Scan an unused tag to add your first plant.'}</Empty>
      ) : null}
      {groups.map((g, gi) => {
        const rows = filteredMine.filter((o) => g.statuses.includes(o.status));
        return (
          <Section key={g.key} title={g.title} top={gi > 0} gap={0}>
            {rows.map((o, i) => (
              <Row
                key={o.id}
                left={<Thumb uri={o.plant.photos[0]?.url} />}
                title={o.plant.name}
                sub={
                  <>
                    <Mono size={13}>{o.plant.qr_id}</Mono>
                    <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>
                      · {o.status === 'returned' ? 'returned' : isRevisit(o) ? 'revisit,' : ''} {shortDate(o.status === 'returned' ? lastReview(db, o.id)?.created_at || o.observed_at : o.observed_at)}
                    </Txt>
                  </>
                }
                right={<DotLabel status={o.status} />}
                onPress={() => nav.go('record', { id: o.id })}
                last={i === rows.length - 1}
              />
            ))}
          </Section>
        );
      })}
    </Screen>
  );
}

const lastReview = (db, obsId) => db.reviews.filter((r) => r.observation_id === obsId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

export function RecordDetail({ nav, params = {} }) {
  usePolling(5000);
  const { db, me, resubmit, syncObservation } = useStore();
  const { c } = useTheme();
  const [message, setMessage] = useState('');
  const o = db.observations.find((x) => x.id === params.id);
  // Editable copy while the record is returned; saved only when it is sent again.
  const [fix, setFix] = useState(() => ({ morphology: o?.morphology || '', height_cm: o?.height_cm != null ? String(o.height_cm) : '', notes: o?.notes || '' }));
  const [sending, setSending] = useState(false);
  const plant = o ? plantView(db, db.plants.find((p) => p.id === o.specimen_id)) : null;
  if (!o || !plant) {
    return <Screen header={<Bar title="Record" onBack={nav.back} />}><Empty>This record no longer exists.</Empty></Screen>;
  }
  const review = lastReview(db, o.id);
  const comments = db.comments.filter((x) => x.observation_id === o.id && x.body !== review?.comment).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const photos = plant.photos.filter((p) => p.observation_id === o.id);
  const returned = o.status === 'returned';

  const send = async () => {
    if (sending) return;
    setSending(true);
    const r = await resubmit(o.id, message.trim(), fix); // shows its own success or error message
    setSending(false);
    if (r.ok) nav.back(); // on failure the edits stay on screen
  };
  const unsent = o.status === 'draft' || o.status === 'queued';
  const sendDraft = async () => {
    if (sending) return;
    setSending(true);
    const r = await syncObservation(o.id);
    setSending(false);
    if (r.ok) nav.back();
  };

  return (
    <Screen
      header={<Bar title={plant.qr_id} sub={`${o.status === 'returned' ? 'Returned' : o.status === 'approved' ? 'Published' : 'Recorded'} ${shortDate(returned ? review?.created_at : o.observed_at)}`} onBack={nav.back} />}
      gap={20}
      top={20}
      footer={returned
        ? <View style={{ flex: 1 }}><Button label={sending ? 'Sending…' : 'Resubmit for review'} onPress={send} disabled={sending} /></View>
        : unsent ? <View style={{ flex: 1 }}><Button label={sending ? 'Sending…' : 'Send for review'} onPress={sendDraft} disabled={sending} /></View> : null}
    >
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Thumb uri={plant.photos[0]?.url} size={64} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt v="title2" style={{ fontSize: 24, lineHeight: 30 }}>{plant.name}</Txt>
          {plant.scientific ? <Sci size={15}>{plant.scientific}</Sci> : null}
        </View>
        <DotLabel status={o.status} />
      </View>

      {returned && review ? (
        <Notice tone="warning" icon="undo" title={`Returned by ${nameOf(db, review.reviewer_id)}`} body={review.comment || 'No note was added.'} meta={dateTime(review.created_at)} />
      ) : null}
      {o.status === 'synced' ? <Notice tone="info" icon="lock" title="Waiting for an officer" body="Observation review is in progress. Edits are locked until an officer decides on this record." /> : null}

      {comments.length ? (
        <View style={{ gap: 12 }}>
          {comments.map((m) => {
            const mine = m.author_id === me?.id;
            return (
              <View key={m.id} style={{ flexDirection: 'row', gap: 10 }}>
                <Avatar name={nameOf(db, m.author_id)} size={32} muted={!mine} />
                <View style={{ flex: 1, padding: 10, paddingHorizontal: 14, borderRadius: 14, borderTopLeftRadius: 4, backgroundColor: mine ? c.accentSoft : c.bg }}>
                  <Text style={{ fontFamily: font('text', 700), fontSize: 13, color: c.ink }}>{mine ? 'You' : nameOf(db, m.author_id)} <Text style={{ fontFamily: font('text', 600), color: c.ink2 }}>· {dateTime(m.created_at)}</Text></Text>
                  <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{m.body}</Txt>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <Section title="Photos" right={<Txt v="caption" color={c.ink3}>{photos.length} of 6</Txt>} gap={12}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {photos.map((p, i) => <Thumb key={p.id ? `${p.id}-${i}` : i} uri={p.url} size={76} />)}
          {returned ? (
            <View accessibilityLabel="Add the missing photo when you edit this record" style={{ width: 76, height: 76, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: c.warning, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" size={22} color={c.warning} />
            </View>
          ) : null}
        </View>
      </Section>

      {returned ? (
        <Section title="Fix the record" gap={12}>
          <Area label="Appearance" value={fix.morphology} onChangeText={(t) => setFix({ ...fix, morphology: t })} />
          <Field label="Height (cm)" value={fix.height_cm} onChangeText={(t) => setFix({ ...fix, height_cm: t.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" width={140} />
          <Area label="Field notes" optional value={fix.notes} onChangeText={(t) => setFix({ ...fix, notes: t })} rows={2} />
        </Section>
      ) : null}

      <Section title="Record" gap={0}>
        <KV rows={[
          ['Seen', dateTime(o.observed_at)],
          ['Height', o.height_cm ? `${o.height_cm} cm` : '-'],
          ['Appearance', o.morphology || '-'],
          ['Notes', o.notes || '-'],
          ['Location', <Text key="l" style={{ fontFamily: font('mono', 500), fontSize: 14, color: c.ink }}>{coords(o.lat ?? plant?.lat, o.lng ?? plant?.lng)} <Text style={{ fontFamily: font('text', 400), color: c.ink2 }}>{(o.lat ?? plant?.lat) != null ? accuracy(o.gps_accuracy_m ?? plant?.gps_accuracy_m) : ''}</Text></Text>],
          ['Version', `${o.version}`],
        ]} />
      </Section>

      <PlantSpotMap title="Observed location" lat={o.lat ?? plant?.lat} lng={o.lng ?? plant?.lng} plant={plant} />

      {returned ? <Area label="Reply to the officer" optional value={message} onChangeText={setMessage} placeholder="What did you change?" rows={2} /> : null}
      {o.status === 'approved' ? <Button label="Open plant page" kind="secondary" onPress={() => nav.go('tag', { qr: plant.qr_id })} /> : null}
      {returned ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="info" size={18} color={c.ink3} /><Txt v="caption" color={c.ink2} style={{ flex: 1, fontFamily: font('text', 600) }}>Add the missing photo on your next visit with "Record a revisit".</Txt></View> : null}
    </Screen>
  );
}
