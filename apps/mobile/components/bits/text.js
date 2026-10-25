// apps/mobile/components/bits/text.js
// Typography components: general text with type-scale presets, scientific names, and monospace values.
import React from 'react';
import { Text } from 'react-native';
import { useTheme, font } from '../Theme.js';

// <Txt v="title1">…</Txt>  v is a style from the type scale in tokens.js
export function Txt({ v = 'body', color, style, children, ...rest }) {
  const { t } = useTheme();
  return (
    <Text style={[t[v], color ? { color } : null, style]} {...rest}>
      {children}
    </Text>
  );
}

// Scientific plant names (display serif font, italic)
export function Sci({ children, size = 15, style }) {
  const { c } = useTheme();
  return (
    <Text style={[{ fontFamily: font('display', 500, true), fontSize: size, color: c.ink2 }, style]}>
      {children}
    </Text>
  );
}

// Monospace text (tag IDs, sensor readings)
export function Mono({ children, size = 14, color, style }) {
  const { c } = useTheme();
  return (
    <Text style={[{ fontFamily: font('mono', 500), fontSize: size, color: color || c.ink }, style]}>
      {children}
    </Text>
  );
}
