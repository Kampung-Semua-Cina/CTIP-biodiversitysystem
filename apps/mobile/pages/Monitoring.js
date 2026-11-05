// apps/mobile/pages/Monitoring.js
// Sensor nodes near protected plants: open alerts first, then a 24-hour chart and
// each node's latest reading. Alert detail lets an admin acknowledge or resolve;
// officers read alerts only.
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

import { useStore } from '../../shared/store.js';
import { plantView, nameOf } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Bar, TitleBlock, Section, Row, Thumb, Mono, Txt, DotLabel, Chip, Spark, Button, Area, Empty, Pills,
} from '../components/Bits.js';
import { dateTime } from '../components/format.js';
import { usePolling } from '../hooks/usePolling.js';

const latest = (readings = []) => readings[readings.length - 1];

function AlertCard({ a, node, onPress }) {
  const { c } = useTheme();
  const tone = a.status === 'open' ? 'danger' : 'warning';
  const r = a.reading || {};
  const what = r.temperature != null ? `${r.temperature}°C, limit ${node?.thresholds?.temp_max}°C` : r.motion ? 'Movement detected near the plant' : 'Unusual reading';
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={{ flexDirection: 'row', gap: 14, padding: 16, borderRadius: 14, backgroundColor: c[tone + 'Soft'], borderWidth: 1, borderColor: c[tone + 'Line'] }}>
      <Icon name={r.temperature != null ? 'thermo' : 'activity'} size={24} color={c[tone]} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt v="label" style={{ fontSize: 16, flex: 1 }}>{a.type}</Txt>
          <DotLabel status={a.severity} label={a.severity.charAt(0).toUpperCase() + a.severity.slice(1)} />
        </View>
        <Txt v="body" style={{ fontSize: 15 }}>{node?.name} · {what}</Txt>
        <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>{dateTime(a.created_at)} · {a.status === 'open' ? 'open' : 'acknowledged'}</Txt>
      </View>
      <Icon name="chevR" size={20} color={c.ink3} />
    </Pressable>
  );
}

export function Monitor({ nav }) {
  usePolling(5000);
  const { db } = useStore();
  const { c } = useTheme();
  const [nodeId, setNodeId] = useState(db.nodes.find((n) => n.status === 'active')?.id || db.nodes[0]?.id);
  const active = db.alerts.filter((a) => a.status !== 'resolved').sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1));
  const openCount = db.alerts.filter((a) => a.status === 'open').length;
  const offline = db.nodes.filter((n) => n.status !== 'active').length;
  const node = db.nodes.find((n) => n.id === nodeId);
  const readings = db.telemetry[nodeId] || [];
  const now = latest(readings);

  return (
    <Screen gap={20}>
      <TitleBlock title="Monitoring" sub={`${openCount} open alert${openCount === 1 ? '' : 's'} · ${offline} node${offline === 1 ? '' : 's'} offline`} />
      {active.map((a) => <AlertCard key={a.id} a={a} node={db.nodes.find((n) => n.id === a.node_id)} onPress={() => nav.go('alert', { id: a.id })} />)}

      <Section title="Last 24 hours" gap={10}>
        <Pills value={nodeId} onChange={setNodeId} items={db.nodes.map((n) => ({ key: n.id, label: n.name }))} />
        {now ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Text style={{ fontFamily: font('display', 700), fontSize: 34, color: now.temperature > node.thresholds.temp_max ? c.danger : c.ink }}>{now.temperature}°C</Text>
              <Txt v="small" color={c.ink2}>limit {node.thresholds.temp_max}°C</Txt>
            </View>
            <Spark values={readings.map((r) => r.temperature)} limit={node.thresholds.temp_max} />
          </>
        ) : <Empty icon="activity">No readings yet.</Empty>}
      </Section>

      <Section title="Nodes" gap={0}>
        {db.nodes.map((n, i) => {
          const r = latest(db.telemetry[n.id]);
          const plant = plantView(db, db.plants.find((p) => p.id === n.specimen_id));
          return (
            <View key={n.id} style={{ gap: 6, paddingVertical: 14, borderBottomWidth: i === db.nodes.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt v="label" style={{ fontSize: 16 }}>{n.name}</Txt>
                <DotLabel status={n.status} />
              </View>
              {plant ? <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>{plant.name} · <Mono size={13} color={c.ink2}>{plant.qr_id}</Mono></Txt> : null}
              {n.status === 'active' && r ? (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="thermo" size={16} color={c.ink2} /><Txt v="label" style={{ fontSize: 14 }}>{r.temperature}°C</Txt></View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="drop" size={16} color={c.ink2} /><Txt v="label" style={{ fontSize: 14 }}>{r.soil_moisture}%</Txt></View>
                </View>
              ) : (
                <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>No readings since {dateTime(n.last_seen)}</Txt>
              )}
            </View>
          );
        })}
      </Section>
    </Screen>
  );
}

export function AlertDetail({ nav, params = {} }) {
  usePolling(5000);
  const { db, role, ackAlert, resolveAlert, addAlertNote, notify } = useStore();
  const canAct = role === 'admin';
  const { c } = useTheme();
  const [note, setNote] = useState('');
  const a = db.alerts.find((x) => x.id === params.id);
  if (!a) return <Screen header={<Bar title="Alert" onBack={nav.back} />}><Empty>This alert no longer exists.</Empty></Screen>;
  const node = db.nodes.find((n) => n.id === a.node_id);
  const plant = plantView(db, db.plants.find((p) => p.id === node?.specimen_id));
  const readings = db.telemetry[a.node_id] || [];
  const r = a.reading || {};
  const notes = db.alertNotes.filter((n) => n.alert_id === a.id);

  const saveNote = () => note.trim() && addAlertNote(a.id, note.trim());
  const ack = () => { saveNote(); ackAlert(a.id); notify('Alert acknowledged'); nav.back(); };
  const resolve = () => { saveNote(); resolveAlert(a.id, note.trim() || 'Resolved'); notify('Alert resolved'); nav.back(); };

  return (
    <Screen
      header={<Bar title={a.type} sub={`${node?.name} · ${dateTime(a.created_at)}`} onBack={nav.back} />}
      top={16}
      gap={18}
      footer={a.status === 'resolved' || !canAct ? null : (
        <>
          <Button label="Resolve" kind={a.status === 'open' ? 'secondary' : 'primary'} flex={1} onPress={resolve} />
          {a.status === 'open' ? <Button label="Acknowledge" icon="check" flex={1.4} onPress={ack} /> : null}
        </>
      )}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip status={a.severity} label={a.severity.charAt(0).toUpperCase() + a.severity.slice(1)} />
        <Chip status={a.status} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {r.temperature != null ? <Reading label="Temperature" value={`${r.temperature}°C`} sub={`limit ${node?.thresholds?.temp_max}°C`} bad={r.temperature > node?.thresholds?.temp_max} /> : null}
        {r.soil_moisture != null ? <Reading label="Soil moisture" value={`${r.soil_moisture}%`} sub={`minimum ${node?.thresholds?.moisture_min}%`} bad={r.soil_moisture < node?.thresholds?.moisture_min} /> : null}
        {r.motion ? <Reading label="Movement" value="Yes" sub="near the plant" bad /> : null}
      </View>
      {readings.length ? <Section title="Last 24 hours" gap={10}><Spark values={readings.map((x) => x.temperature)} limit={node?.thresholds?.temp_max} height={80} /></Section> : null}
      {plant ? (
        <Section title="Protected plant" gap={0}>
          <Row left={<Thumb uri={plant.photos[0]?.url} size={48} />} title={plant.name}
            sub={<><Mono size={13}>{plant.qr_id}</Mono>{plant.endangered ? <DotLabel status="endangered" /> : null}</>}
            onPress={() => nav.go('tag', { qr: plant.qr_id })} last />
        </Section>
      ) : null}
      {a.assigned_to ? <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>Assigned to {nameOf(db, a.assigned_to)}</Txt> : null}
      {notes.length ? (
        <Section title="Notes" gap={10}>
          {notes.map((n) => (
            <View key={n.id} style={{ padding: 12, borderRadius: 12, backgroundColor: c.bg, gap: 2 }}>
              <Txt v="caption" color={c.ink2}>{nameOf(db, n.author_id)} · {dateTime(n.created_at)}</Txt>
              <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{n.note}</Txt>
            </View>
          ))}
        </Section>
      ) : null}
      {a.status === 'resolved' ? <Txt v="body">Outcome: {a.outcome || '-'}</Txt> : !canAct ? <Txt v="small" color={c.ink2}>Only an admin can act on alerts.</Txt> : <Area label="What did you find?" value={note} onChangeText={setNote} placeholder="Add a note for the team" />}
    </Screen>
  );
}

function Reading({ label, value, sub, bad }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
      <Txt v="caption" color={c.ink2}>{label}</Txt>
      <Text style={{ fontFamily: font('display', 700), fontSize: 28, color: bad ? c.danger : c.ink }}>{value}</Text>
      <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>{sub}</Txt>
    </View>
  );
}
