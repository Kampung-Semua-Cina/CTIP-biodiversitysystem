// apps/mobile/components/bits/loading.js
// Loading placeholders, progress spinners, and empty states.
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../Theme.js';
import { Txt } from './text.js';
import { IconTile } from './lists.js';

export function SkeletonRow() {
  const { c } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: c.bg }} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ width: '68%', height: 14, borderRadius: 6, backgroundColor: c.bg }} />
        <View style={{ width: '42%', height: 12, borderRadius: 6, backgroundColor: c.bg }} />
      </View>
    </View>
  );
}

// The small "Loading more" line shown while the next page comes from the server.
export function LoadingMore({ label = 'Loading more' }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 }}>
      <Spinner />
      <Txt v="small" color={c.ink2}>{label}</Txt>
    </View>
  );
}

export function Spinner({ size = 20 }) {
  const { c } = useTheme();
  // A quarter arc on a faint ring; React Native's ActivityIndicator would ignore our palette on Android.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" fill="none" stroke={c.line} strokeWidth="3" />
      <Path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke={c.accent} strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

export function Empty({ icon = 'leaf', children }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
      <IconTile name={icon} size={48} />
      <Txt v="body" color={c.ink2} style={{ textAlign: 'center' }}>{children}</Txt>
    </View>
  );
}
