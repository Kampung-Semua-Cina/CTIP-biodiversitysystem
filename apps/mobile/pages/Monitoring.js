// apps/mobile/pages/Monitoring.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { nameOf, plantView } from '../../shared/selectors.js';
import { fmtDateTime, label } from '../../shared/utils.js';
import { Chip, Empty, Sparkline } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileMonitoring() {
  const { db, setThresholds, notify } = useStore();
  const [nodeId, setNodeId] = useState(db.nodes[0]?.id);
  const [tab, setTab] = useState('open');
  const [tempMax, setTempMax] = useState(String(db.nodes[0]?.thresholds?.temp_max || 33));
  const [moistMin, setMoistMin] = useState(String(db.nodes[0]?.thresholds?.moisture_min || 40));

  const node = db.nodes.find((n) => n.id === nodeId) || db.nodes[0];
  const data = db.telemetry[node?.id] || [];
  const plantOf = (n) => plantView(db, db.plants.find((p) => p.id === n.specimen_id));

  const alerts = db.alerts
    .filter((a) => tab === 'all' || a.status === tab)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const openCount = db.alerts.filter((a) => a.status === 'open').length;
  const offlineCount = db.nodes.filter((n) => n.status !== 'active').length;

  const selectNode = (n) => {
    setNodeId(n.id);
    setTempMax(String(n.thresholds?.temp_max || ''));
    setMoistMin(String(n.thresholds?.moisture_min || ''));
  };

  const saveLimits = () => {
    if (!tempMax || !moistMin) return notify('Please enter both threshold limits');
    setThresholds(node.id, {
      temp_max: Number(tempMax),
      moisture_min: Number(moistMin),
    });
    notify(`Threshold limits updated for ${node.name}`);
  };

  return (
    <View>
      <View style={commonStyles.card}>
        <Text style={commonStyles.heading}>Sensor monitoring</Text>
        <Text style={commonStyles.mute}>
          {openCount} open alert{openCount === 1 ? '' : 's'} · {offlineCount} node{offlineCount === 1 ? '' : 's'} offline or faulty
        </Text>

        {/* Node selector cards */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nodesScroll}>
          {db.nodes.map((n) => {
            const isSelected = n.id === node?.id;
            const targetPlant = plantOf(n);
            return (
              <TouchableOpacity
                key={n.id}
                style={[styles.nodeCard, isSelected && styles.nodeCardActive]}
                onPress={() => selectNode(n)}
              >
                <View style={[commonStyles.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
                  <Text style={[styles.nodeName, isSelected && styles.nodeNameActive]}>{n.name}</Text>
                  <Chip value={n.status} />
                </View>
                <Text style={styles.nodePlantName} numberOfLines={1}>{targetPlant?.name}</Text>
                <Text style={commonStyles.mute}>{targetPlant?.qr_id}</Text>
                <Text style={styles.lastSeen}>Seen {fmtDateTime(n.last_seen)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Telemetry charts */}
      {node && (
        <View style={commonStyles.card}>
          <Text style={commonStyles.subHeading}>{node.name} Readings (Past 24h)</Text>

          <Sparkline
            title="Temperature"
            unit="°C"
            values={data.map((d) => d.temperature)}
            limit={node.thresholds?.temp_max}
          />

          <Sparkline
            title="Soil moisture"
            unit="%"
            values={data.map((d) => d.soil_moisture)}
            limit={node.thresholds?.moisture_min}
          />

          <Text style={[commonStyles.mute, { marginTop: 6, marginBottom: 12 }]}>
            Red indicator shows alert thresholds for {node.name}.
          </Text>

          {/* Threshold limits form */}
          <Text style={commonStyles.subHeading}>Threshold Limits</Text>
          <View style={styles.thresholdForm}>
            <View style={{ flex: 1 }}>
              <Text style={commonStyles.label}>Max Temp (°C)</Text>
              <TextInput
                style={commonStyles.input}
                value={tempMax}
                onChangeText={setTempMax}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={commonStyles.label}>Min Moisture (%)</Text>
              <TextInput
                style={commonStyles.input}
                value={moistMin}
                onChangeText={setMoistMin}
                keyboardType="numeric"
              />
            </View>
          </View>
          <TouchableOpacity
            style={[commonStyles.btnGhost, { alignSelf: 'flex-start', marginTop: 4 }]}
            onPress={saveLimits}
          >
            <Text style={commonStyles.btnGhostText}>Save limits</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Alerts section */}
      <View style={commonStyles.card}>
        <Text style={commonStyles.subHeading}>Alerts Queue</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {['open', 'acknowledged', 'resolved', 'all'].map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.filterPill, tab === t && styles.filterPillActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.filterPillText, tab === t && styles.filterPillTextActive]}>
                {label(t)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {alerts.length === 0 ? (
        <View style={commonStyles.card}>
          <Empty icon="shield">No {tab === 'all' ? '' : tab} alerts recorded.</Empty>
        </View>
      ) : (
        alerts.map((a) => <MobileAlertCard key={a.id} alert={a} />)
      )}
    </View>
  );
}

function MobileAlertCard({ alert }) {
  const { db, ackAlert, resolveAlert, assignAlert, addAlertNote, notify } = useStore();
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');

  const node = db.nodes.find((n) => n.id === alert.node_id);
  const notes = db.alertNotes.filter((n) => n.alert_id === alert.id);
  const officers = db.profiles.filter((p) => p.role === 'officer' && p.is_active);

  return (
    <View style={commonStyles.card}>
      <View style={[commonStyles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.alertType}>{alert.type}</Text>
          <Text style={commonStyles.mute}>
            {node?.name} · {fmtDateTime(alert.created_at)}
          </Text>
        </View>
        <View style={[commonStyles.row, { gap: 4 }]}>
          <Chip value={alert.severity} />
          <Chip value={alert.status} />
        </View>
      </View>

      {/* Reading values */}
      <View style={styles.readingBox}>
        <Text style={styles.readingText}>
          {Object.entries(alert.reading).map(([k, v]) => `${label(k)}: ${v}`).join(' · ')}
        </Text>
      </View>

      {/* Assignment & Acknowledge */}
      <Text style={commonStyles.label}>Assigned Officer:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.officerScroll}>
        {officers.map((o) => {
          const isAssigned = alert.assigned_to === o.id;
          return (
            <TouchableOpacity
              key={o.id}
              style={[styles.officerPill, isAssigned && styles.officerPillActive]}
              onPress={() => {
                assignAlert(alert.id, o.id);
                notify(`Alert assigned to ${o.full_name}`);
              }}
            >
              <Text style={[styles.officerPillText, isAssigned && styles.officerPillTextActive]}>
                {o.full_name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {alert.status === 'open' && (
        <TouchableOpacity
          style={[commonStyles.btnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]}
          onPress={() => {
            ackAlert(alert.id);
            notify('Alert acknowledged');
          }}
        >
          <Text style={commonStyles.btnPrimaryText}>✓ Acknowledge</Text>
        </TouchableOpacity>
      )}

      {alert.acknowledged_by ? (
        <Text style={[commonStyles.mute, { marginTop: 6 }]}>
          Acknowledged by {nameOf(db, alert.acknowledged_by)} · {fmtDateTime(alert.acknowledged_at)}
        </Text>
      ) : null}

      {/* Notes thread */}
      {notes.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={commonStyles.subHeading}>Investigation Notes</Text>
          {notes.map((n) => (
            <View key={n.id} style={styles.noteItem}>
              <Text style={styles.noteAuthor}>{nameOf(db, n.author_id)}</Text>
              <Text style={styles.noteBody}>{n.note}</Text>
              <Text style={styles.noteTime}>{fmtDateTime(n.created_at)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Action / Outcome */}
      {alert.status === 'resolved' ? (
        <View style={styles.outcomeBox}>
          <Text style={styles.outcomeTitle}>Resolution Outcome:</Text>
          <Text style={commonStyles.body}>{alert.outcome}</Text>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <View style={[commonStyles.row, { marginBottom: 8 }]}>
            <TextInput
              style={[commonStyles.input, { flex: 1, marginVertical: 0 }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add investigation note..."
              placeholderTextColor="#688065"
            />
            <TouchableOpacity
              style={commonStyles.btnGhost}
              onPress={() => {
                if (note.trim()) {
                  addAlertNote(alert.id, note.trim());
                  setNote('');
                  notify('Note added');
                }
              }}
            >
              <Text style={commonStyles.btnGhostText}>Add note</Text>
            </TouchableOpacity>
          </View>

          <View style={[commonStyles.row, { gap: 8 }]}>
            <TextInput
              style={[commonStyles.input, { flex: 1, marginVertical: 0 }]}
              value={outcome}
              onChangeText={setOutcome}
              placeholder="What was found to resolve..."
              placeholderTextColor="#688065"
            />
            <TouchableOpacity
              style={commonStyles.btnPrimary}
              onPress={() => {
                if (!outcome.trim()) return notify('Enter what was found to resolve');
                resolveAlert(alert.id, outcome.trim());
                notify('Alert marked as resolved');
              }}
            >
              <Text style={commonStyles.btnPrimaryText}>Resolve</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  nodesScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  nodeCard: {
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 170,
  },
  nodeCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(155, 207, 106, 0.12)',
  },
  nodeName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  nodeNameActive: {
    color: COLORS.primary,
  },
  nodePlantName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  lastSeen: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 6,
  },
  thresholdForm: {
    flexDirection: 'row',
    gap: 10,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
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
  alertType: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  readingBox: {
    backgroundColor: '#0a1a11',
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  readingText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  officerScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  officerPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#0a1a11',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  officerPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  officerPillText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  officerPillTextActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },
  noteItem: {
    backgroundColor: '#0a1a11',
    borderRadius: 8,
    padding: 8,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  noteAuthor: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  noteBody: {
    color: COLORS.text,
    fontSize: 13,
    marginVertical: 2,
  },
  noteTime: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  outcomeBox: {
    backgroundColor: 'rgba(47, 158, 68, 0.15)',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(47, 158, 68, 0.3)',
  },
  outcomeTitle: {
    color: '#74c476',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
});
