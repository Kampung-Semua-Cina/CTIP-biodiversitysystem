// apps/mobile/components/bits/status.js
// Status feedback components: dot labels, status chips, notice banners, key-value rows, and statistics.
import React from 'react';
import { View, Text } from 'react-native';
import Icon from '../Icon.js';
import { useTheme, font, toneOf, statusText } from '../Theme.js';
import { Txt } from './text.js';

// Coloured dot + words. Pass a status ("synced", "endangered") or a tone + label.
export function DotLabel({ status, tone, label, size = 13 }) {
  const { c } = useTheme();
  const tn = tone || toneOf(status);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c[tn] }} />
      <Text style={{ fontFamily: font('text', 700), fontSize: size, color: c[tn] }}>{label || statusText(status)}</Text>
    </View>
  );
}

export function Chip({ status, tone, label }) {
  const { c } = useTheme();
  const tn = tone || toneOf(status);
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, backgroundColor: c[tn + 'Soft'], borderWidth: 1, borderColor: c[tn + 'Line'] }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c[tn] }} />
      <Text style={{ fontFamily: font('text', 700), fontSize: 12, color: c[tn] }}>{label || statusText(status)}</Text>
    </View>
  );
}

export function Notice({ tone = 'info', icon = 'info', title, body, meta }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c[tone + 'Soft'], borderWidth: 1, borderColor: c[tone + 'Line'] }}>
      <Icon name={icon} size={22} color={c[tone]} />
      <View style={{ flex: 1, gap: 4 }}>
        {title ? <Txt v="label">{title}</Txt> : null}
        {body ? <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{body}</Txt> : null}
        {meta ? <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>{meta}</Txt> : null}
      </View>
    </View>
  );
}

// Label / value list. rows: [[label, valueNode], ...]
export function KV({ rows }) {
  const { c } = useTheme();
  return (
    <View>
      {rows.map(([k, v], i) => (
        <View key={k} style={{ flexDirection: 'row', gap: 16, paddingVertical: 12, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
          <Text style={{ width: 108, fontFamily: font('text', 700), fontSize: 15, lineHeight: 22, color: c.ink2 }}>{k}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>{typeof v === 'string' ? <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{v}</Txt> : v}</View>
        </View>
      ))}
    </View>
  );
}

export function Stat({ value, label, tone }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
      <Text style={{ fontFamily: font('display', 700), fontSize: 28, color: tone ? c[tone] : c.ink }}>{value}</Text>
      <Txt v="caption" color={c.ink2}>{label}</Txt>
    </View>
  );
}
