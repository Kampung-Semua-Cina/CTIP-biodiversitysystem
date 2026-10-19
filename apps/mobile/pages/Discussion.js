// apps/mobile/pages/Discussion.js
// Comment threads on records. With params.id it opens one thread; without, it lists them.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView, nameOf } from '../../shared/selectors.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { Screen, Bar, Row, Thumb, Mono, Txt, DotLabel, Avatar, Empty } from '../components/Bits.js';
import { dateTime, shortDate } from '../components/format.js';

export default function Discussion({ nav, params = {} }) {
  return params.id ? <Thread nav={nav} id={params.id} /> : <Threads nav={nav} />;
}

function Threads({ nav }) {
  const { db } = useStore();
  const { c } = useTheme();
  const ids = [...new Set(db.comments.map((m) => m.observation_id))];
  const threads = ids
    .map((id) => {
      const o = db.observations.find((x) => x.id === id);
      const plant = o ? plantView(db, db.plants.find((p) => p.id === o.specimen_id)) : null;
      const msgs = db.comments.filter((m) => m.observation_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return plant ? { id, o, plant, last: msgs[msgs.length - 1], count: msgs.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  return (
    <Screen header={<Bar title="Discussion" onBack={nav.back} />} top={8} gap={0}>
      {threads.length === 0 ? <Empty icon="chat">No discussions yet.</Empty> : null}
      {threads.map((t, i) => (
        <Row key={t.id} left={<Thumb uri={t.plant.photos[0]?.url} />} title={t.plant.name}
          sub={<><Mono size={13}>{t.plant.qr_id}</Mono><Txt v="small" color={c.ink2} style={{ fontSize: 13 }} numberOfLines={1}>· {t.count} messages · {shortDate(t.last.created_at)}</Txt></>}
          onPress={() => nav.go('discussion', { id: t.id })} last={i === threads.length - 1} />
      ))}
    </Screen>
  );
}

function Thread({ nav, id }) {
  const { db, me, addComment } = useStore();
  const { c } = useTheme();
  const [text, setText] = useState('');
  const o = db.observations.find((x) => x.id === id);
  const plant = o ? plantView(db, db.plants.find((p) => p.id === o.specimen_id)) : null;
  if (!plant) return <Screen header={<Bar title="Discussion" onBack={nav.back} />}><Empty>This record no longer exists.</Empty></Screen>;
  const msgs = db.comments.filter((m) => m.observation_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const roleOf = (uid) => ROLE_LABEL[db.profiles.find((p) => p.id === uid)?.role] || '';
  const send = () => {
    if (!text.trim()) return;
    addComment(id, text.trim());
    setText('');
  };

  return (
    // App.js keeps this whole screen above the keyboard; the reply box is its last row.
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <Screen header={<Bar title="Discussion" sub={`${plant.qr_id} · ${plant.name}`} onBack={nav.back} />} gap={20}>
        <Pressable accessibilityRole="button" onPress={() => nav.go('tag', { qr: plant.qr_id })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: c.bg }}>
          <Thumb uri={plant.photos[0]?.url} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: font('display', 600), fontSize: 16, color: c.ink }}>{plant.name}</Text>
            <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }} numberOfLines={2}>{o.morphology}</Txt>
          </View>
          <DotLabel status={o.status} />
        </Pressable>
        {msgs.map((m) => {
          const mine = m.author_id === me?.id;
          return (
            <View key={m.id} style={{ flexDirection: 'row', gap: 10 }}>
              <Avatar name={nameOf(db, m.author_id)} size={32} muted={!mine} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: font('text', 700), fontSize: 13, color: c.ink }}>
                  {mine ? 'You' : nameOf(db, m.author_id)} <Text style={{ fontFamily: font('text', 600), color: c.ink2 }}>· {roleOf(m.author_id)} · {dateTime(m.created_at)}</Text>
                </Text>
                <View style={{ padding: 10, paddingHorizontal: 14, borderRadius: 14, borderTopLeftRadius: 4, backgroundColor: mine ? c.accentSoft : c.bg }}>
                  <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{m.body}</Txt>
                </View>
              </View>
            </View>
          );
        })}
        {msgs.length === 0 ? <Empty icon="chat">No messages yet. Ask a question about this record.</Empty> : null}
      </Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20, paddingRight: 12, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
        <TextInput accessibilityLabel="Reply" value={text} onChangeText={setText} placeholder="Write a reply" placeholderTextColor={c.ink3} onSubmitEditing={send}
          style={{ flex: 1, height: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: c.bg, fontFamily: font('text', 400), fontSize: 16, color: c.ink }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={send} disabled={!text.trim()}
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? c.accent : c.raised }}>
          <Icon name="send" size={20} color={text.trim() ? c.onAccent : c.ink3} />
        </Pressable>
      </View>
    </View>
  );
}
