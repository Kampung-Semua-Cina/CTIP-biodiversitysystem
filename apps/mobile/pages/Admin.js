// apps/mobile/pages/Admin.js
// Staff "More" tab (profile, tools, appearance, sign out), and the admin's Users and Audit log.
import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { useStore } from '../../shared/store.js';
import { nameOf } from '../../shared/selectors.js';
import { can, ROLE_LABEL } from '../../shared/permissions.js';
import { useTheme, font } from '../components/Theme.js';
import { AppearanceSection, PrototypeRoleSection, VersionLine } from '../components/Chrome.js';
import {
  Screen, Header, IconButton, TitleBlock, Section, MenuRow, Button, Avatar, Txt, Mono, SearchField, Pills, SortBar, Row, DotLabel,
  Field, Segmented, Empty,
} from '../components/Bits.js';
import { shortDate } from '../components/format.js';

export function StaffMore({ nav }) {
  const { me, role, logout } = useStore();
  const { c } = useTheme();
  const tools = [
    can(role, 'monitor') && { icon: 'activity', label: 'Monitoring', go: 'monitor' },
    can(role, 'species') && { icon: 'leaf', label: 'Species', go: 'speciesAdmin' },
    can(role, 'tags') && { icon: 'qr', label: 'QR tags', go: 'tags' },
    can(role, 'reports') && { icon: 'chart', label: 'Reports', go: 'reports' },
    can(role, 'audit') && { icon: 'shield', label: 'Audit log', go: 'audit' },
    can(role, 'discuss') && { icon: 'chat', label: 'Discussion', go: 'discussion' },
    { icon: 'map', label: 'Plant map', go: 'map' },
    { icon: 'leaf', label: 'Species catalogue', go: 'plants' },
  ].filter(Boolean);

  return (
    <Screen gap={18}>
      <TitleBlock title="More" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
        <Avatar name={me?.full_name} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="label" style={{ fontSize: 17 }}>{me?.full_name}</Txt>
          <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>{ROLE_LABEL[role]} · {me?.email}</Txt>
        </View>
      </View>
      <Section title="Tools" gap={0}>
        {tools.map((t, i) => <MenuRow key={t.label} icon={t.icon} label={t.label} onPress={() => nav.go(t.go)} last={i === tools.length - 1} />)}
      </Section>
      <AppearanceSection />
      <PrototypeRoleSection />
      <VersionLine />
      <Button label="Sign out" kind="dangerText" icon="logout" height={48} size={15} onPress={logout} />
    </Screen>
  );
}

const ROLE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'botanist', label: 'Botanists' },
  { key: 'officer', label: 'Officers' },
  { key: 'admin', label: 'Admins' },
  { key: 'off', label: 'Deactivated' },
];

const SORT_USERS = [
  { key: 'active', label: 'Active first' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'nameDesc', label: 'Name (Z–A)' },
  { key: 'role', label: 'Role' },
  { key: 'email', label: 'Email' },
];

export function Users({ nav }) {
  const { db, addUser, notify } = useStore();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('active');
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'botanist' });
  const [error, setError] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = db.profiles
    .filter((p) => (filter === 'all' ? true : filter === 'off' ? !p.is_active : p.role === filter && p.is_active))
    .filter((p) => !needle || `${p.full_name} ${p.email}`.toLowerCase().includes(needle))
    ;
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return a.full_name.localeCompare(b.full_name);
    if (sort === 'nameDesc') return b.full_name.localeCompare(a.full_name);
    if (sort === 'role') return (a.role || '').localeCompare(b.role || '') || a.full_name.localeCompare(b.full_name);
    if (sort === 'email') return (a.email || '').localeCompare(b.email || '');
    return (b.is_active - a.is_active) || a.full_name.localeCompare(b.full_name);
  });
  const off = db.profiles.filter((p) => !p.is_active).length;

  const invite = async () => {
    if (!form.full_name.trim() || !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Enter a name and a valid email.');
    const res = await addUser({ ...form, full_name: form.full_name.trim() });
    if (!res?.ok) return setError(res?.message || 'Someone already uses this email.');
    notify(res.invited ? `Invitation sent to ${form.email.trim()}` : `${form.full_name.trim()} can now sign in`);
    setInviting(false);
    setForm({ full_name: '', email: '', role: 'botanist' });
    setError('');
  };

  return (
    <Screen gap={14}>
      <TitleBlock title="Users" sub={`${db.profiles.length} accounts · ${off} deactivated`}
        right={!inviting ? <Button label="Invite" icon="plus" height={44} size={15} onPress={() => setInviting(true)} /> : null} />
      {inviting ? (
        <View style={{ gap: 14, padding: 16, borderRadius: 14, backgroundColor: c.bg }}>
          <Txt v="title3">Invite someone</Txt>
          <Field label="Full name" value={form.full_name} onChangeText={(v) => setForm({ ...form, full_name: v })} />
          <Field label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" error={error || undefined} />
          <Segmented value={form.role} onChange={(v) => setForm({ ...form, role: v })} items={[{ key: 'botanist', label: 'Botanist' }, { key: 'officer', label: 'Officer' }, { key: 'admin', label: 'Admin' }]} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Cancel" kind="secondary" flex={1} onPress={() => { setInviting(false); setError(''); }} />
            <Button label="Send invite" flex={1.4} onPress={invite} />
          </View>
        </View>
      ) : null}
      <SearchField value={q} onChangeText={setQ} placeholder="Search name or email" />
      <Pills value={filter} onChange={setFilter} items={ROLE_FILTERS} />
      <SortBar items={SORT_USERS} value={sort} onChange={setSort} />
      <View>
        {sorted.length === 0 ? <Empty icon="users">No one matches.</Empty> : null}
        {sorted.map((p, i) => (
          <Row key={p.id} serif={false} left={<Avatar name={p.full_name} size={44} muted={!p.is_active} />} title={p.full_name}
            sub={<Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>{p.email}</Txt>}
            right={p.is_active ? <Text style={{ fontFamily: font('text', 700), fontSize: 13, color: c.ink2 }}>{ROLE_LABEL[p.role].split(' ').pop().replace(/^\w/, (m) => m.toUpperCase())}</Text> : <DotLabel tone="neutral" label="Deactivated" />}
            last={i === sorted.length - 1} />
        ))}
      </View>
      <Button label="Audit log" kind="text" icon="shield" height={48} size={15} onPress={() => nav.go('audit')} />
    </Screen>
  );
}

// Plain sentence for one audit row.
function describe(db, a) {
  const plantOfObs = (id) => db.plants.find((p) => p.id === db.observations.find((o) => o.id === id)?.specimen_id)?.qr_id;
  const nv = a.new_value || {};
  if (a.table_name === 'observations' && nv.status) {
    const verb = { approved: 'Approved', returned: 'Returned', rejected: 'Rejected', synced: 'Sent' }[nv.status] || 'Updated';
    return `${verb} the record for ${plantOfObs(a.record_id) || 'a plant'}`;
  }
  if (a.table_name === 'profiles') {
    if (nv.is_active === false) return `Deactivated ${nameOf(db, a.record_id)}`;
    if (nv.is_active === true) return `Turned on ${nameOf(db, a.record_id)}`;
    if (a.action === 'insert') return `Added ${nv.email}`;
    if (nv.password) return 'Changed their password';
  }
  return `${a.action === 'insert' ? 'Added' : a.action === 'delete' ? 'Removed' : 'Changed'} ${a.table_name.replace('_', ' ')}`;
}

const diff = (a) => {
  const keys = Object.keys(a.new_value || {});
  if (!keys.length) return null;
  const k = keys[0];
  const before = a.old_value?.[k];
  return before === undefined ? `${k}: ${a.new_value[k]}` : `${k}: ${before} → ${a.new_value[k]}`;
};

export function Audit({ nav }) {
  const { db } = useStore();
  const { c } = useTheme();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('active');
  const rows = db.audit
    .filter((a) => filter === 'all' || (filter === 'accounts' ? a.table_name === 'profiles' : a.table_name !== 'profiles'))
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={16}>
      <TitleBlock title="Audit log" sub="Every change to records and accounts" />
      <Pills value={filter} onChange={setFilter} items={[{ key: 'all', label: 'All' }, { key: 'records', label: 'Records' }, { key: 'accounts', label: 'Accounts' }]} />
      <View>
        {rows.length === 0 ? <Empty icon="shield">No changes recorded.</Empty> : null}
        {rows.map((a, i) => (
          <View key={a.id} style={{ gap: 6, paddingVertical: 14, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Txt v="label">{nameOf(db, a.changed_by)}</Txt>
              <Txt v="caption" color={c.ink3} style={{ fontFamily: font('text', 600) }}>{shortDate(a.changed_at)}</Txt>
            </View>
            <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{describe(db, a)}</Txt>
            {diff(a) ? (
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: c.bg }}>
                <Mono size={13}>{diff(a)}</Mono>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}
