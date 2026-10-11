// apps/mobile/pages/Notifications.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useStore } from '../../shared/store.js';
import { fmtDateTime } from '../../shared/utils.js';
import { Empty } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileNotifications({ onNavigate }) {
  const { db, me, role, markRead, markAllRead, notify } = useStore();

  const mine = db.notifications
    .filter((n) => (me ? n.user_id === me.id : true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const unread = mine.filter((n) => !n.is_read).length;

  const openNote = (n) => {
    markRead(n.id);
    if (n.related_table === 'alerts') onNavigate?.('monitoring');
    else if (n.type === 'comment_reply') onNavigate?.('discussion', n.related_id);
    else if (role === 'botanist') onNavigate?.('records');
    else if (role === 'officer') onNavigate?.('review');
    else onNavigate?.('dashboard');
  };

  return (
    <View style={commonStyles.card}>
      <View style={[commonStyles.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <Text style={commonStyles.heading}>Notifications</Text>
        {unread > 0 && (
          <TouchableOpacity
            style={commonStyles.btnGhost}
            onPress={() => {
              markAllRead();
              notify('All notifications marked as read');
            }}
          >
            <Text style={commonStyles.btnGhostText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {role === "visitor" ? (
        <View style={{ marginVertical: 14 }}>
          <Text style={commonStyles.body}>
            You are browsing as a Visitor. Staff members receive notifications for observation reviews, assigned sensor alerts, and discussion comments.
          </Text>
          <TouchableOpacity
            style={[commonStyles.btnPrimary, { marginTop: 8, alignSelf: 'flex-start' }]}
            onPress={() => onNavigate?.('login')}
          >
            <Text style={commonStyles.btnPrimaryText}>Staff login</Text>
          </TouchableOpacity>
        </View>
      ) : mine.length === 0 ? (
        <Empty icon="bell">You have no notifications.</Empty>
      ) : (
        <View style={styles.list}>
          {mine.map((n) => (
            <TouchableOpacity
              key={n.id}
              style={[styles.noteCard, !n.is_read && styles.noteCardUnread]}
              onPress={() => openNote(n)}
            >
              <View style={[commonStyles.row, { justifyContent: 'space-between' }]}>
                <Text style={[styles.noteTitle, !n.is_read && styles.noteTitleUnread]}>
                  {n.title}
                </Text>
                {!n.is_read && <View style={styles.unreadDot} />}
              </View>

              <Text style={styles.noteBody}>{n.body}</Text>
              <Text style={styles.noteTime}>{fmtDateTime(n.created_at)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
    marginTop: 12,
  },
  noteCard: {
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteCardUnread: {
    borderColor: COLORS.primary,
    backgroundColor: '#112918',
  },
  noteTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  noteTitleUnread: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 6,
  },
  noteBody: {
    color: COLORS.text,
    fontSize: 13,
    marginVertical: 4,
    lineHeight: 18,
  },
  noteTime: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
});
