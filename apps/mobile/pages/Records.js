// apps/mobile/pages/Records.js
// A botanist's own records, grouped by what needs doing, and one record in detail
// (with the officer's note and "Resubmit" when it was returned).
import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView, nameOf } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Bar, TitleBlock, Pills, Section, Row, Thumb, Mono, Txt, Sci, DotLabel, Notice, KV, Button, Area, Avatar, Empty,
} from '../components/Bits.js';
import { shortDate, dateTime, coords } from '../components/format.js';

const GROUPS = [
  { key: 'fix', title: 'Needs you', statuses: ['returned', 'draft'] },
  { key: 'review', title: 'In review', statuses: ['synced', 'queued'] },
  { key: 'published', title: 'Published', statuses: ['approved'] },
  { key: 'rejected', title: 'Rejected', statuses: ['rejected'] },
];

export function MyRecords({ nav }) {
  const { db, me } = useStore();
  const { c } = useTheme();
  const [filter, setFilter] = useState('all');
  const mine = db.observations
    .filter((o) => o.recorded_by === me?.id)
    .map((o) => ({ ...o, plant: plantView(db, db.plants.find((p) => p.id === o.specimen_id)) }))
    .filter((o) => o.plant)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  const count = (g) => mine.filter((o) => g.statuses.includes(o.status)).length;
  const groups = GROUPS.filter((g) => (filter === 'all' || filter === g.key) && count(g) > 0);
  // A plant's later visits are labelled as revisits.
  const isRevisit = (o) => db.observations.some((x) => x.specimen_id === o.specimen_id && x.observed_at < o.observed_at);

  return (
    <Screen gap={18}>
      <TitleBlock title="My records" sub={me?.full_name} />
      <Pills
        value={filter}
        onChange={setFilter}
        items={[{ key: 'all', label: `All ${mine.length}` }, ...GROUPS.filter((g) => count(g)).map((g) => ({ key: g.key, label: `${g.title === 'Needs you' ? 'To fix' : g.title} ${count(g)}` }))]}
      />
      {mine.length === 0 ? <Empty icon="file">No records yet. Scan an unused tag to add your first plant.</Empty> : null}
      {groups.map((g, gi) => {
        const rows = mine.filter((o) => g.statuses.includes(o.status));
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
  const { db, me, resubmit, notify } = useStore();
  const { c } = useTheme();
  const [message, setMessage] = useState('');
  const o = db.observations.find((x) => x.id === params.id);
  const plant = o ? plantView(db, db.plants.find((p) => p.id === o.specimen_id)) : null;
  if (!o || !plant) {
    return <Screen header={<Bar title="Record" onBack={nav.back} />}><Empty>This record no longer exists.</Empty></Screen>;
  }
  const review = lastReview(db, o.id);
  const comments = db.comments.filter((x) => x.observation_id === o.id && x.body !== review?.comment).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const photos = plant.photos.filter((p) => p.observation_id === o.id);
  const returned = o.status === 'returned';

  const send = () => {
    resubmit(o.id, message.trim());
    notify(`${plant.qr_id} sent for review again`);
    nav.back();
  };

  return (
    <Screen
      header={<Bar title={plant.qr_id} sub={`${o.status === 'returned' ? 'Returned' : o.status === 'approved' ? 'Published' : 'Recorded'} ${shortDate(returned ? review?.created_at : o.observed_at)}`} onBack={nav.back} />}
      gap={20}
      top={20}
      footer={returned ? <View style={{ flex: 1 }}><Button label="Resubmit for review" onPress={send} /></View> : null}
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
      {o.status === 'synced' ? <Notice tone="info" icon="clipboard" title="Waiting for an officer" body="You'll get an alert when it is approved or returned." /> : null}

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
          {photos.map((p) => <Thumb key={p.id} uri={p.url} size={76} />)}
          {returned ? (
            <View accessibilityLabel="Add the missing photo when you edit this record" style={{ width: 76, height: 76, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: c.warning, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" size={22} color={c.warning} />
            </View>
          ) : null}
        </View>
      </Section>

      <Section title="Record" gap={0}>
        <KV rows={[
          ['Seen', dateTime(o.observed_at)],
          ['Height', o.height_cm ? `${o.height_cm} cm` : '-'],
          ['Appearance', o.morphology || '-'],
          ['Notes', o.notes || '-'],
          ['Location', <Text key="l" style={{ fontFamily: font('mono', 500), fontSize: 14, color: c.ink }}>{coords(plant.lat, plant.lng)} <Text style={{ fontFamily: font('text', 400), color: c.ink2 }}>±{Math.round(o.gps_accuracy_m || plant.gps_accuracy_m)} m</Text></Text>],
          ['Version', `${o.version}`],
        ]} />
      </Section>

      {returned ? <Area label="Reply to the officer" optional value={message} onChangeText={setMessage} placeholder="What did you change?" rows={2} /> : null}
      {o.status === 'approved' ? <Button label="Open plant page" kind="secondary" onPress={() => nav.go('tag', { qr: plant.qr_id })} /> : null}
      {returned ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="info" size={18} color={c.ink3} /><Txt v="caption" color={c.ink2} style={{ flex: 1, fontFamily: font('text', 600) }}>Add the missing photo on your next visit with "Record a revisit".</Txt></View> : null}
    </Screen>
  );
}
