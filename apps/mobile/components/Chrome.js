// apps/mobile/components/Chrome.js
// Pieces shared by several screens: the logo mark, the theme switch and the
// app version line.
import React from 'react';
import Constants from 'expo-constants';

import Logo from './Logo.js';
import { useTheme } from './Theme.js';
import { Section, Segmented, Txt } from './Bits.js';

export function LogoMark({ size = 30 }) {
  return <Logo size={size} />;
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


// App version, e.g. "v1.0.103 · a1b2c3d": 1.0.<commit count> and the commit
// it was built from (scripts/version.mjs, put in by app.config.js).
export function VersionLine() {
  const { c } = useTheme();
  const v = Constants.expoConfig?.extra?.appVersion;
  if (!v) return null;
  return (
    <Txt v="caption" color={c.ink3} style={{ textAlign: 'center' }} accessibilityLabel={`App version ${v.version}`}>
      v{v.version} · {v.commit}{v.dirty ? '+changes' : ''}
    </Txt>
  );
}
