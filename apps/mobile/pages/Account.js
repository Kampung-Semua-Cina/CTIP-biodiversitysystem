// apps/mobile/pages/Account.js
// Staff profile and account settings for mobile (counterpart to web Account.jsx).
import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { useStore } from '../../shared/store.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { useTheme, font } from '../components/Theme.js';
import {
  Screen, Header, IconButton, TitleBlock, Section, Avatar, Txt, Field, Button, KV, Notice,
} from '../components/Bits.js';
import { shortDate } from '../components/format.js';

export default function Account({ nav }) {
  const { me, role } = useStore();

  if (!me) {
    return (
      <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />}>
        <TitleBlock title="Account" sub="Please sign in to view account settings." />
      </Screen>
    );
  }

  return (
    <Screen
      header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />}
      top={0}
      gap={20}
    >
      <TitleBlock title="Account settings" sub="Your profile and sign-in details." />
      <ProfileSection me={me} />
      <PasswordSection />
      <DetailsSection me={me} role={role} />
    </Screen>
  );
}

function ProfileSection({ me }) {
  const { updateProfile, notify } = useStore();
  const { c } = useTheme();
  const [form, setForm] = useState({
    full_name: me.full_name || '',
    username: me.username || '',
    phone: me.phone || '',
  });
  const [saving, setSaving] = useState(false);

  const dirty =
    form.full_name !== (me.full_name || '') ||
    form.username !== (me.username || '') ||
    form.phone !== (me.phone || '');

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const res = await updateProfile(form);
    setSaving(false);
    if (!res.ok) {
      return notify(res.message);
    }
    notify('Profile saved');
  };

  const cancel = () => {
    setForm({
      full_name: me.full_name || '',
      username: me.username || '',
      phone: me.phone || '',
    });
  };

  return (
    <Section title="Profile" gap={12}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
        <Avatar name={form.full_name || me.full_name} size={54} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="label" style={{ fontSize: 17 }}>{form.full_name || me.full_name}</Txt>
          <Txt v="small" color={c.ink2} style={{ fontFamily: font('text', 400) }}>
            @{form.username || 'username'} · {ROLE_LABEL[me.role]}
          </Txt>
        </View>
      </View>

      <Field
        label="Full name"
        value={form.full_name}
        onChangeText={(t) => setForm({ ...form, full_name: t })}
        placeholder="Your full name"
      />

      <Field
        label="Username"
        value={form.username}
        onChangeText={(t) => setForm({ ...form, username: t.toLowerCase() })}
        placeholder="username"
        hint="3-20 letters, numbers, dots or underscores"
      />

      <Field
        label="Phone"
        optional
        value={form.phone}
        onChangeText={(t) => setForm({ ...form, phone: t })}
        placeholder="+60 12-345 6789"
        keyboardType="phone-pad"
      />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            onPress={save}
            disabled={!dirty || saving}
          />
        </View>
        {dirty ? (
          <View style={{ flex: 1 }}>
            <Button
              label="Cancel"
              kind="secondary"
              onPress={cancel}
              disabled={saving}
            />
          </View>
        ) : null}
      </View>
    </Section>
  );
}

function PasswordSection() {
  const { changeMyPassword, notify } = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (!current) return notify('Enter your current password');
    if (next.length < 8) return notify('Use at least 8 characters for the new password');
    if (next !== again) return notify('The new passwords do not match');

    setBusy(true);
    const res = await changeMyPassword(current, next);
    setBusy(false);
    if (!res.ok) return notify(res.message);

    setCurrent('');
    setNext('');
    setAgain('');
    notify('Password changed');
  };

  return (
    <Section title="Security" gap={12}>
      <Field
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        placeholder="••••••••"
        secure
      />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
        placeholder="At least 8 characters"
        secure
      />
      <Field
        label="Confirm new password"
        value={again}
        onChangeText={setAgain}
        placeholder="Re-enter new password"
        secure
      />
      <Button
        label={busy ? 'Updating…' : 'Change password'}
        kind="secondary"
        onPress={save}
        disabled={busy || !current || !next || !again}
      />
    </Section>
  );
}

function DetailsSection({ me, role }) {
  return (
    <Section title="Account details" gap={10}>
      <KV
        rows={[
          ['Email', me.email || '-'],
          ['Role', ROLE_LABEL[role] || role],
          ['Status', me.is_active ? 'Active' : 'Turned off'],
          ['Member since', shortDate(me.created_at)],
        ]}
      />
      <Notice
        tone="neutral"
        icon="lock"
        title="Managed account"
        body="Your email and assigned role are managed by an administrator. Contact your system admin if either needs to change."
      />
    </Section>
  );
}
