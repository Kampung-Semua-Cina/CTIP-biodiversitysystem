// apps/mobile/pages/Discussion.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { nameOf, plantView } from '../../shared/selectors.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { fmtDate, fmtDateTime } from '../../shared/utils.js';
import { Chip, Empty } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileDiscussion({ arg, onNavigate }) {
  const { db, me, role, addComment, notify } = useStore();
  const [q, setQ] = useState('');
  const [selectedObsId, setSelectedObsId] = useState(arg || null);
  const [newObsId, setNewObsId] = useState('');
  const [newBody, setNewBody] = useState('');

  const visible = db.observations.filter(
    (o) => !o.is_deleted && (role !== 'botanist' || (me && o.recorded_by === me.id))
  );

  const describe = (o) => {
    const plant = plantView(db, db.plants.find((p) => p.id === o.specimen_id));
    return {
      obs: o,
      plant,
      title: `${plant?.name || 'Observation'} · ${plant?.qr_id || ''}`,
      posts: db.comments.filter((c) => c.observation_id === o.id),
    };
  };

  const topics = visible
    .map(describe)
    .filter((t) => t.posts.length > 0)
    .sort((a, b) => b.posts.at(-1)?.created_at.localeCompare(a.posts.at(-1)?.created_at || ''));

  const shown = topics.filter((t) =>
    `${t.title} ${t.posts.map((p) => p.body).join(' ')}`.toLowerCase().includes(q.toLowerCase())
  );

  const activeObsId = selectedObsId || arg;
  const openObs = activeObsId ? visible.find((o) => o.id === activeObsId) : null;

  const createTopic = () => {
    if (!newObsId) return notify('Choose an observation first');
    if (!newBody.trim()) return notify('Write a message first');
    addComment(newObsId, newBody.trim());
    setSelectedObsId(newObsId);
    setNewObsId('');
    setNewBody('');
    notify('Discussion post published');
  };

  if (openObs) {
    return (
      <TopicThread
        topic={describe(openObs)}
        onBack={() => {
          setSelectedObsId(null);
          if (arg) onNavigate?.('discussion');
        }}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <View>
      <View style={commonStyles.card}>
        <Text style={commonStyles.heading}>Discussion</Text>
        <Text style={commonStyles.mute}>
          Team discussions and morphological questions linked to field observations.
          {role === 'botanist' && ' You see topics for your field records.'}
        </Text>

        {/* Start new topic form */}
        <View style={styles.newTopicBox}>
          <Text style={commonStyles.subHeading}>＋ Start new topic</Text>

          <Text style={commonStyles.label}>Select observation:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.obsPickerScroll}>
            {visible.map(describe).map((t) => {
              const isSelected = newObsId === t.obs.id;
              return (
                <TouchableOpacity
                  key={t.obs.id}
                  style={[styles.obsPickerItem, isSelected && styles.obsPickerItemActive]}
                  onPress={() => setNewObsId(t.obs.id)}
                >
                  <Text style={[styles.obsPickerText, isSelected && styles.obsPickerTextActive]}>
                    {t.title}
                  </Text>
                  <Text style={commonStyles.mute}>seen {fmtDate(t.obs.observed_at)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={commonStyles.label}>Message / Inquiry</Text>
          <TextInput
            style={[commonStyles.input, { height: 60, textAlignVertical: 'top' }]}
            value={newBody}
            onChangeText={setNewBody}
            placeholder="Ask a question or share an observation..."
            placeholderTextColor="#688065"
            multiline
          />

          <TouchableOpacity style={[commonStyles.btnPrimary, { marginTop: 8 }]} onPress={createTopic}>
            <Text style={commonStyles.btnPrimaryText}>Post inquiry</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TextInput
          style={[commonStyles.input, { marginTop: 14 }]}
          placeholder="Search topics by plant or text..."
          placeholderTextColor="#688065"
          value={q}
          onChangeText={setQ}
        />
      </View>

      {/* Topics list */}
      {shown.length === 0 ? (
        <View style={commonStyles.card}>
          <Empty icon="chat">
            {topics.length ? 'No topics match your search.' : 'No discussions yet. Start one above.'}
          </Empty>
        </View>
      ) : (
        shown.map((t) => {
          const last = t.posts.at(-1);
          return (
            <TouchableOpacity
              key={t.obs.id}
              style={commonStyles.card}
              onPress={() => setSelectedObsId(t.obs.id)}
            >
              <Text style={styles.topicCardTitle}>{t.title}</Text>
              <Text style={styles.topicExcerpt} numberOfLines={2}>
                {t.posts[0]?.body}
              </Text>
              <View style={[commonStyles.row, { justifyContent: 'space-between', marginTop: 8 }]}>
                <Text style={commonStyles.mute}>
                  Started by {nameOf(db, t.posts[0]?.author_id)}
                </Text>
                <Text style={styles.repliesCount}>
                  {t.posts.length - 1} {t.posts.length === 2 ? 'reply' : 'replies'}
                </Text>
              </View>
              {last ? (
                <Text style={[commonStyles.mute, { fontSize: 11, marginTop: 4 }]}>
                  Last reply {fmtDateTime(last.created_at)} by {nameOf(db, last.author_id)}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

function TopicThread({ topic, onBack, onNavigate }) {
  const { db, me, addComment, notify } = useStore();
  const [reply, setReply] = useState('');
  const { obs, plant, title, posts } = topic;

  const send = () => {
    if (!reply.trim()) return;
    addComment(obs.id, reply.trim());
    setReply('');
    notify('Reply posted');
  };

  return (
    <View style={commonStyles.card}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>‹ All topics</Text>
      </TouchableOpacity>

      <Text style={commonStyles.heading}>{title}</Text>
      <View style={[commonStyles.row, { flexWrap: 'wrap', marginBottom: 12 }]}>
        <Text style={commonStyles.mute}>
          Recorded by {nameOf(db, obs.recorded_by)} · {fmtDate(obs.observed_at)}
        </Text>
        <Chip value={obs.status} />
        {plant?.qr_id && (
          <TouchableOpacity onPress={() => onNavigate?.('dashboard', plant.qr_id)}>
            <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>
              View plant ›
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={commonStyles.divider} />

      {/* Posts */}
      <View style={styles.postsList}>
        {posts.map((c, i) => {
          const author = db.profiles.find((p) => p.id === c.author_id);
          const isMine = me && c.author_id === me.id;

          return (
            <View key={c.id} style={[styles.postItem, isMine && styles.postItemMine]}>
              <View style={[commonStyles.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
                <View style={commonStyles.row}>
                  <Text style={[styles.authorName, isMine && { color: COLORS.primary }]}>
                    {author?.full_name || 'Unknown'}
                  </Text>
                  {author && <Chip value={author.role}>{ROLE_LABEL[author.role] || author.role}</Chip>}
                </View>
                <Text style={styles.postTime}>
                  {i === 0 ? 'opened' : 'replied'} {fmtDateTime(c.created_at)}
                </Text>
              </View>
              <Text style={styles.postBody}>{c.body}</Text>
            </View>
          );
        })}
      </View>

      {/* Reply Input */}
      <Text style={commonStyles.label}>Your reply</Text>
      <TextInput
        style={[commonStyles.input, { height: 65, textAlignVertical: 'top' }]}
        value={reply}
        onChangeText={setReply}
        placeholder="Write a reply..."
        placeholderTextColor="#688065"
        multiline
      />

      <TouchableOpacity style={[commonStyles.btnPrimary, { marginTop: 8 }]} onPress={send}>
        <Text style={commonStyles.btnPrimaryText}>Post reply</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  newTopicBox: {
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  obsPickerScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  obsPickerItem: {
    backgroundColor: '#16301e',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 140,
  },
  obsPickerItemActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(155, 207, 106, 0.2)',
  },
  obsPickerText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  obsPickerTextActive: {
    color: COLORS.primary,
  },
  topicCardTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  topicExcerpt: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  repliesCount: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  backBtn: {
    paddingVertical: 6,
    marginBottom: 6,
  },
  backBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  postsList: {
    gap: 10,
    marginVertical: 10,
  },
  postItem: {
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  postItemMine: {
    borderColor: COLORS.primary,
    backgroundColor: '#112918',
  },
  authorName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  postTime: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  postBody: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
});
