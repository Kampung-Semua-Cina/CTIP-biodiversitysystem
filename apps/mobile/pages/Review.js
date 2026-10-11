// apps/mobile/pages/Review.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { nameOf, plantView } from '../../shared/selectors.js';
import { fmtDateTime } from '../../shared/utils.js';
import { Chip, Empty } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileReview() {
  const { db } = useStore();
  const [picked, setPicked] = useState(null);

  const queue = db.observations
    .filter((o) => o.status === 'synced')
    .sort((a, b) => (a.last_synced_at || '').localeCompare(b.last_synced_at || ''));
  const obs = queue.find((o) => o.id === picked) || queue[0];

  return (
    <View>
      <View style={commonStyles.card}>
        <Text style={commonStyles.heading}>Review queue</Text>
        <Text style={commonStyles.mute}>
          Review incoming observations from botanists in the field. Confirm the species and approve or return for changes.
        </Text>

        {queue.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queueScroll}>
            {queue.map((o) => {
              const p = plantView(db, db.plants.find((x) => x.id === o.specimen_id));
              const isSelected = o.id === obs?.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.queueItem, isSelected && styles.queueItemActive]}
                  onPress={() => setPicked(o.id)}
                >
                  <Image source={{ uri: p?.photos[0]?.url }} style={styles.queueThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.queueName, isSelected && styles.queueNameActive]} numberOfLines={1}>
                      {p?.name}
                    </Text>
                    <Text style={commonStyles.mute}>{p?.qr_id} · v{o.version}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {!obs ? (
        <View style={commonStyles.card}>
          <Empty icon="clipboard">No records are waiting for review.</Empty>
        </View>
      ) : (
        <ReviewDetailCard key={obs.id} obs={obs} />
      )}
    </View>
  );
}

function ReviewDetailCard({ obs }) {
  const { db, reviewObservation, addComment, setPlantSpecies, notify } = useStore();
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');

  const rawPlant = db.plants.find((p) => p.id === obs.specimen_id);
  const plant = plantView(db, rawPlant);
  const photos = rawPlant ? rawPlant.photos.filter((p) => p.observation_id === obs.id) : [];
  const thread = db.comments.filter((c) => c.observation_id === obs.id);
  const history = db.reviews.filter((r) => r.observation_id === obs.id);
  const speciesList = db.species.filter((s) => !s.is_deleted);

  const decide = (decision) => {
    if (decision !== 'approve' && !comment.trim()) {
      return notify('Add a comment so the botanist knows why');
    }
    if (decision === 'approve' && !plant?.species) {
      return notify('Confirm the species before approving');
    }
    reviewObservation(obs.id, decision, comment.trim());
    notify(decision === 'approve' ? 'Record approved' : decision === 'return' ? 'Record returned' : 'Record rejected');
  };

  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.heading}>{plant?.name}</Text>
      <Text style={styles.sciText}>{plant?.scientific}</Text>

      {/* Observation photos preview */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
        {photos.map((p) => (
          <Image key={p.id} source={{ uri: p.url }} style={styles.photoPreview} />
        ))}
      </ScrollView>

      {/* Confirm Species */}
      <Text style={commonStyles.label}>Confirm Species Assignment</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speciesSelectRow}>
        {speciesList.map((s) => {
          const isSelected = rawPlant?.species_id === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.speciesChip, isSelected && styles.speciesChipSelected]}
              onPress={() => setPlantSpecies(rawPlant.id, s.id)}
            >
              <Text style={[styles.speciesChipText, isSelected && styles.speciesChipTextSelected]}>
                {s.scientific_name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {rawPlant?.proposed_species ? (
        <Text style={[commonStyles.mute, { marginTop: 4 }]}>
          Botanist's guess: <Text style={{ color: COLORS.text }}>{rawPlant.proposed_species}</Text>
        </Text>
      ) : null}

      <View style={commonStyles.divider} />

      {/* Observation Specs */}
      <View style={styles.dl}>
        <DetailItem label="Tag ID" value={plant?.qr_id} />
        <DetailItem label="Recorded by" value={nameOf(db, obs.recorded_by)} />
        <DetailItem label="Seen" value={fmtDateTime(obs.observed_at)} />
        <DetailItem label="Height" value={obs.height_cm != null ? `${obs.height_cm} cm` : '-'} />
        <DetailItem label="Appearance" value={obs.morphology || '-'} />
        <DetailItem label="Notes" value={obs.notes || '-'} />
        <DetailItem
          label="GPS"
          value={rawPlant ? `${rawPlant.lat.toFixed(5)}, ${rawPlant.lng.toFixed(5)} (±${obs.gps_accuracy_m} m)` : '-'}
        />
        <DetailItem label="Version" value={`v${obs.version} · ${obs.device_id}`} />
      </View>

      {/* Previous decisions */}
      {history.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={commonStyles.subHeading}>Earlier decisions</Text>
          {history.map((r) => (
            <View key={r.id} style={styles.historyRow}>
              <Chip value={r.decision} />
              <Text style={commonStyles.mute}>
                v{r.observation_ver} by {nameOf(db, r.reviewer_id)} · {fmtDateTime(r.created_at)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Comments Thread */}
      <View style={{ marginTop: 12 }}>
        <Text style={commonStyles.subHeading}>Comments ({thread.length})</Text>
        {thread.map((c) => (
          <View key={c.id} style={styles.commentItem}>
            <Text style={styles.commentAuthor}>{nameOf(db, c.author_id)}</Text>
            <Text style={styles.commentBody}>{c.body}</Text>
            <Text style={styles.commentDate}>{fmtDateTime(c.created_at)}</Text>
          </View>
        ))}

        <View style={[commonStyles.row, { marginTop: 8 }]}>
          <TextInput
            style={[commonStyles.input, { flex: 1, marginVertical: 0 }]}
            value={note}
            onChangeText={setNote}
            placeholder="Write a comment..."
            placeholderTextColor="#688065"
          />
          <TouchableOpacity
            style={commonStyles.btnGhost}
            onPress={() => {
              if (note.trim()) {
                addComment(obs.id, note.trim());
                setNote('');
              }
            }}
          >
            <Text style={commonStyles.btnGhostText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={commonStyles.divider} />

      {/* Decision Section */}
      <Text style={commonStyles.subHeading}>Officer Decision</Text>
      <TextInput
        style={[commonStyles.input, { height: 60, textAlignVertical: 'top' }]}
        value={comment}
        onChangeText={setComment}
        placeholder="Comment for botanist (required to return or reject)"
        placeholderTextColor="#688065"
        multiline
      />

      <View style={[commonStyles.rowWrap, { marginTop: 12 }]}>
        <TouchableOpacity style={commonStyles.btnPrimary} onPress={() => decide('approve')}>
          <Text style={commonStyles.btnPrimaryText}>✓ Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity style={commonStyles.btnGhost} onPress={() => decide('return')}>
          <Text style={commonStyles.btnGhostText}>↺ Return for changes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={commonStyles.btnDanger} onPress={() => decide('reject')}>
          <Text style={commonStyles.btnDangerText}>✕ Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DetailItem({ label: dt, value: dd }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.dt}>{dt}</Text>
      <Text style={[styles.dd, commonStyles.body, { marginBottom: 0 }]}>{dd}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  queueScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 170,
    gap: 8,
  },
  queueItemActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(155, 207, 106, 0.15)',
  },
  queueThumb: {
    width: 38,
    height: 38,
    borderRadius: 6,
  },
  queueName: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  queueNameActive: {
    color: COLORS.primary,
  },
  sciText: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
    fontSize: 14,
    marginBottom: 10,
  },
  photosRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  photoPreview: {
    width: 120,
    height: 90,
    borderRadius: 8,
  },
  speciesSelectRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  speciesChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0a1a11',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  speciesChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(155, 207, 106, 0.2)',
  },
  speciesChipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  speciesChipTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  dl: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: 5,
  },
  dt: {
    width: 100,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  dd: {
    flex: 1,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  commentItem: {
    backgroundColor: '#0a1a11',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  commentAuthor: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  commentBody: {
    color: COLORS.text,
    fontSize: 13,
    marginVertical: 2,
  },
  commentDate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
});
