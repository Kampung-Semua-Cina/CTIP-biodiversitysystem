// apps/mobile/components/Toast.js
// Transient toast notification overlay.
import React from 'react';
import { View, Text } from 'react-native';
import { useTheme, font } from './Theme.js';

export default function Toast({ message, bottom = 24 }) {
  const { c } = useTheme();

  if (!message) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom,
        padding: 14,
        borderRadius: 14,
        backgroundColor: c.ink,
      }}
    >
      <Text style={{ fontFamily: font('text', 700), fontSize: 15, color: c.surface }}>
        {message}
      </Text>
    </View>
  );
}
