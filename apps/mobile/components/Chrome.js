// apps/mobile/components/Chrome.js
// Pieces shared by several screens: the logo mark, the theme switch and the
// prototype role switch (until real sign-in arrives with CTIP-42).
import React from 'react';
import { View } from 'react-native';

import Icon from './Icon.js';
import { useTheme } from './Theme.js';
import { Section, Segmented, Txt } from './Bits.js';
import { useStore } from '../../shared/store.js';
import { ROLES } from '../../shared/permissions.js';

export function LogoMark({ size = 30 }) {
  const { c } = useTheme();
  return (
    <View accessibilityLabel="Daun Sense" style={{ width: size, height: size, borderRadius: size * 0.27, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent }}>
      <Icon name="leaf" size={size * 0.6} color={c.onAccent} strokeWidth={2} />
    </View>
  );
}

export function AppearanceSection() {
  const { mode, setMode } = useTheme();
  return (
    <Section title="Appearance" gap={12}>
      <Segmented
        value={mode}
        onChange={setMode}
        items={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }, { key: 'device', label: 'Device' }]}
      />
    </Section>
  );
}

// Prototype only: lets the team look at every role on sample data.
// Remove when sign-in talks to Supabase Auth (CTIP-42).
export function PrototypeRoleSection() {
  const { c } = useTheme();
  const { role, setRole } = useStore();
  return (
    <Section title="Prototype · view the app as" gap={12}>
      <Segmented value={role} onChange={setRole} items={ROLES.map((r) => ({ key: r.key, label: r.label }))} />
      <Txt v="caption" color={c.ink3} style={{ fontWeight: undefined }}>Sample data only. This switch goes away when real sign-in is added.</Txt>
    </Section>
  );
}
