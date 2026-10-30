// apps/mobile/pages/Notifications.js
// "Alerts" tab: the signed-in person's notifications, newest first.
import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { useStore } from '../../shared/store.js';
import { useTheme, font } from '../components/Theme.js';
import { Screen, TitleBlock, Section, IconTile, TextLink, Empty, Txt } from '../components/Bits.js';
import { shortDate } from '../components/format.js';
import { usePolling } from '../hooks/usePolling.js';

// Icon and tone for each notification type.
const LOOK = {
  review_returned: ['undo', 'warning'],
  review_approved: ['check', 'success'],
  review_rejected: ['x', 'danger'],
  observation_submitted: ['clipboard', 'info'],
  comment_reply: ['chat', 'info'],
  alert_assigned: ['thermo', 'danger'],
  alert_open: ['thermo', 'danger'],
};

export default function Alerts({ nav }) {
  usePolling(5000);
  const { db, me, role, markRead, markAllRead } = useStore();
  const { c } = useTheme();
  const mine = db.notifications.filter((n) => n.user_id === me?.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const fresh = mine.filter((n) => !n.is_read);
  const earlier = mine.filter((n) => n.is_read);

  const open = (n) => {
    markRead(n.id);
    if (n.related_table === 'alerts') return nav.go('alert', { id: n.related_id });
    if (n.related_table === 'observations') {
      if (role === 'officer' && n.type === 'observation_submitted') return nav.go('reviewItem', { id: n.related_id });
      if (role === 'botanist') return nav.go('record', { id: n.related_id });
      return nav.go('discussion', { id: n.related_id });
    }
  };

  const Item = ({ n, last }) => {
    const [icon, tone] = LOOK[n.type] || ['bell', 'neutral'];
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${n.is_read ? '' : 'Unread. '}${n.title}. ${n.body}`} onPress={() => open(n)}
        style={({ pressed }) => ({ flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
        <IconTile name={icon} tone={tone} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ flex: 1, fontFamily: font('text', 700), fontSize: 16, color: c.ink }}>{n.title}</Text>
            <Text style={{ fontFamily: font('text', 600), fontSize: 13, color: c.ink3 }}>{shortDate(n.created_at)}</Text>
          </View>
          <Txt v="body" color={c.ink2} style={{ fontSize: 15, lineHeight: 22 }}>{n.body}</Txt>
        </View>
        <View style={{ width: 10, paddingTop: 6 }}>{!n.is_read ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}</View>
      </Pressable>
    );
  };

  return (
    <Screen gap={18}>
      <TitleBlock title="Alerts" right={fresh.length ? <TextLink label="Mark all read" size={14} onPress={markAllRead} /> : null} />
      {mine.length === 0 ? <Empty icon="bell">Nothing yet. You'll see reviews, replies and sensor alerts here.</Empty> : null}
      {fresh.length ? <Section title="New" top={false} gap={0}>{fresh.map((n, i) => <Item key={n.id} n={n} last={i === fresh.length - 1} />)}</Section> : null}
      {earlier.length ? <Section title="Earlier" top={fresh.length > 0} gap={0}>{earlier.map((n, i) => <Item key={n.id} n={n} last={i === earlier.length - 1} />)}</Section> : null}
    </Screen>
  );
}
