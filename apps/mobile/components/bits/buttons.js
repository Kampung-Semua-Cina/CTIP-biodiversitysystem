// apps/mobile/components/bits/buttons.js
// Button components: primary/secondary/quiet/text/danger buttons, icon buttons, and text links.
import React from 'react';
import { Text, Pressable } from 'react-native';
import Icon from '../Icon.js';
import { useTheme, font } from '../Theme.js';

export function Button({ label, onPress, kind = 'primary', icon, disabled, height = 52, flex, size = 16 }) {
  const { c } = useTheme();
  const look = {
    primary: { bg: c.accent, fg: c.onAccent },
    secondary: { bg: c.surface, fg: c.ink, border: c.line },
    quiet: { bg: c.bg, fg: c.ink },
    text: { bg: 'transparent', fg: c.accent },
    danger: { bg: c.danger, fg: c.onDanger },
    dangerText: { bg: 'transparent', fg: c.danger },
  }[kind];
  const fg = disabled ? c.ink3 : look.fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          paddingHorizontal: 18,
          borderRadius: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: disabled ? c.raised : pressed && kind === 'primary' ? c.accentPress : look.bg,
          borderWidth: look.border || disabled ? 1 : 0,
          borderColor: disabled ? c.line : look.border,
          opacity: pressed && kind !== 'primary' ? 0.7 : 1,
        },
        flex ? { flex } : null,
      ]}
    >
      {icon ? <Icon name={icon} size={20} color={fg} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: font('text', 700), fontSize: size, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, color, size = 24 }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={name} size={size} color={color || c.ink} />
    </Pressable>
  );
}

export function TextLink({ label, onPress, size = 15 }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 4,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontFamily: font('text', 700), fontSize: size, color: c.accent }}>{label}</Text>
    </Pressable>
  );
}
