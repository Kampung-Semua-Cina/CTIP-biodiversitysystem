// apps/mobile/pages/Records.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { nameOf, plantView } from '../../shared/selectors.js';
import { fmtDateTime } from '../../shared/utils.js';
import { OBS_STATUS } from '../../shared/data.js';
import { Chip, Empty } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileRecords() {
  const { db, me } = useStore();
  const [filter, setFilter] = useState('all');

  const mine = db.observations
    .filter((o) => (me ? o.recorded_by === me.id : true) && (filter === 'all' || o.status === filter))
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));

  return (
    <View>
      <View style={commonStyles.card}>
        <Text style={commonStyles.heading}>My records</Text>
        <Text style={commonStyles.mute}>
          Track field submissions, sync pending offline records, and resubmit requested changes.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
          {['all', ...OBS_STATUS].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterPill, filter === s && styles.filterPillActive]}
              onPress={() => setFilter(s)}
            >
              <Text style={[styles.filterPillText, filter === s && styles.filterPillTextActive]}>
                {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {mine.length === 0 ? (
        <View style={commonStyles.card}>
          <Empty icon="file">No records found with this status.</Empty>
        </View>
      ) : (
        mine.map((o) => <MobileRecordCard key={o.id} obs={o} />)
      )}
    </View>
  );
}

function MobileRecordCard({ obs }) {
  const { db, syncObservation, resubmit, notify } = useStore();
  const [reply, setReply] = useState('');
  const plant = plantView(db, db.plants.find((p) => p.id === obs.specimen_id));
  const lastReturn = [...db.reviews].reverse().find((r) => r.observation_id === obs.id && r.decision !== 'approve');

  return (
    <View style={commonStyles.card}>
      <View style={[commonStyles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.plantTitle}>{plant?.name || 'Unnamed Specimen'}</Text>
          <Text style={commonStyles.mute}>
            {plant?.qr_id} · seen {fmtDateTime(obs.observed_at)} · v{obs.version}
          </Text>
        </View>
        <Chip value={obs.status} />
      </View>

      {/* Draft or Queued: Sync Action */}
      {(obs.status === 'draft' || obs.status === 'queued') && (
        <View style={styles.actionBox}>
          <Text style={[commonStyles.mute, { flex: 1 }]}>
            {obs.status === 'draft' ? 'Draft not submitted.' : 'Stored offline. Ready to sync.'}
          </Text>
          <TouchableOpacity
            style={commonStyles.btnPrimary}
            onPress={() => {
              syncObservation(obs.id);
              notify('Record synced with park server');
            }}
          >
            <Text style={commonStyles.btnPrimaryText}>Sync now</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Returned: Resubmit Action with Reply */}
      {obs.status === 'returned' && (
        <View style={styles.calloutBox}>
          <Text style={styles.commentAuthor}>
            Reviewer ({nameOf(db, lastReturn?.reviewer_id)}):
          </Text>
          <Text style={styles.commentBody}>
            {lastReturn?.comment || 'Please update the requested details for this specimen.'}
          </Text>

          <Text style={commonStyles.label}>Your reply / corrections</Text>
          <TextInput
            style={commonStyles.input}
            value={reply}
            onChangeText={setReply}
            placeholder="What changes did you make?"
            placeholderTextColor="#688065"
          />

          <TouchableOpacity
            style={[commonStyles.btnPrimary, { marginTop: 8 }]}
            onPress={() => {
              resubmit(obs.id, reply);
              setReply('');
              notify('Record sent back for review');
            }}
          >
            <Text style={commonStyles.btnPrimaryText}>Send again</Text>
          </TouchableOpacity>
        </View>
      )}

      {obs.status === 'rejected' && lastReturn?.comment ? (
        <Text style={[commonStyles.mute, { marginTop: 8 }]}>Reason: {lastReturn.comment}</Text>
      ) : null}

      {obs.status === 'synced' && (
        <Text style={[commonStyles.mute, { marginTop: 8 }]}>Waiting for an officer to review.</Text>
      )}

      {obs.status === 'approved' && (
        <Text style={[styles.approvedText, { marginTop: 8 }]}>✓ Published to the plant library.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0a1a11',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },
  plantTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  actionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a11',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    gap: 8,
  },
  calloutBox: {
    backgroundColor: '#1b261b',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  commentAuthor: {
    color: COLORS.warning,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 2,
  },
  commentBody: {
    color: COLORS.text,
    fontSize: 13,
    marginBottom: 8,
  },
  approvedText: {
    color: '#74c476',
    fontSize: 13,
    fontWeight: '600',
  },
});
