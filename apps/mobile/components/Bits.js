// apps/mobile/components/Bits.js
// The shared kit every screen is built from (Daun design language, direction A:
// flat, typographic, few containers). Each piece reads colours from useTheme(),
// so it works in light and dark mode without extra code on the screens.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';

import Icon from './Icon.js';
import { useTheme, font, toneOf, statusText } from './Theme.js';
import { initials as toInitials } from '../../shared/utils.js';

/* ---------- text ---------- */

// <Txt v="title1">…</Txt>  v is a style from the type scale in tokens.js
export function Txt({ v = 'body', color, style, children, ...rest }) {
  const { t } = useTheme();
  return (
    <Text style={[t[v], color ? { color } : null, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Sci({ children, size = 15, style }) {
  const { c } = useTheme();
  return <Text style={[{ fontFamily: font('display', 500, true), fontSize: size, color: c.ink2 }, style]}>{children}</Text>;
}

export function Mono({ children, size = 14, color, style }) {
  const { c } = useTheme();
  return <Text style={[{ fontFamily: font('mono', 500), fontSize: size, color: color || c.ink }, style]}>{children}</Text>;
}

/* ---------- layout ---------- */

// A full screen: optional header, scrolling content, optional footer pinned above the tab bar.
export function Screen({ header, children, footer, scroll = true, bg, pad = 20, gap = 24, top = 16, bottom = 24, safeTop = true }) {
  const { c } = useTheme();
  const content = { paddingHorizontal: pad, paddingTop: top, paddingBottom: bottom, gap };
  return (
    <SafeAreaView edges={safeTop ? ['top'] : []} style={{ flex: 1, backgroundColor: bg || c.surface }}>
      {header}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}
      {footer ? (
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// Row of up to two buttons in the top area (left: back/close, right: action).
export function Header({ left, right }) {
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4, paddingRight: 8 }}>
      {left || <View style={{ width: 48 }} />}
      {right || <View style={{ width: 48 }} />}
    </View>
  );
}

// Compact bar for detail screens: back, title, optional sub-line and action.
export function Bar({ title, sub, onBack, close, right }) {
  const { c, t } = useTheme();
  return (
    <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <IconButton name={close ? 'x' : 'chevL'} label={close ? 'Close' : 'Back'} onPress={onBack} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[t.title3, { fontFamily: font('display', 700), fontSize: 19 }]}>{title}</Text>
        {sub ? <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }} numberOfLines={1}>{sub}</Txt> : null}
      </View>
      {right || <View style={{ width: 48 }} />}
    </View>
  );
}

export function TitleBlock({ title, sub, right, size = 30 }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: size, lineHeight: size + 6, color: c.ink }}>{title}</Text>
        {sub ? <Txt v="body" color={c.ink2} style={{ fontSize: 15 }}>{sub}</Txt> : null}
      </View>
      {right || null}
    </View>
  );
}

// Overline heading with an optional thin line above it.
export function Section({ title, right, children, top = true, gap = 8 }) {
  const { c, t } = useTheme();
  return (
    <View style={[{ gap }, top ? { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 20 } : null]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
          <Text accessibilityRole="header" style={t.overline}>{title}</Text>
          {right || null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* ---------- buttons ---------- */

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
          height, paddingHorizontal: 18, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          backgroundColor: disabled ? c.raised : pressed && kind === 'primary' ? c.accentPress : look.bg,
          borderWidth: look.border || disabled ? 1 : 0, borderColor: disabled ? c.line : look.border,
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
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Icon name={name} size={size} color={color || c.ink} />
    </Pressable>
  );
}

export function TextLink({ label, onPress, size = 15 }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontFamily: font('text', 700), fontSize: size, color: c.accent }}>{label}</Text>
    </Pressable>
  );
}

/* ---------- inputs ---------- */

export function SearchField({ value, onChangeText, placeholder, pill }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: pill ? 999 : 10, backgroundColor: c.bg }}>
      <Icon name="search" size={20} color={c.ink3} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        returnKeyType="search"
        style={{ flex: 1, fontFamily: font('text', 400), fontSize: 16, color: c.ink }}
      />
      {value ? <IconButton name="x" label="Clear search" size={18} color={c.ink2} onPress={() => onChangeText('')} /> : null}
    </View>
  );
}

// Label + filled input. `mono` for tag IDs, `italic` for scientific names.
export function Field({ label, value, onChangeText, placeholder, mono, italic, suffix, hint, optional, width, secure, rightIcon, onRightPress, keyboardType, error, editable = true }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  const family = mono ? font('mono', 500) : italic ? font('display', 500, true) : font('text', 400);
  const border = error ? c.danger : focus ? c.accent : 'transparent';
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: c.ink }}>
        {label}
        {optional ? <Text style={{ fontFamily: font('text', 600), color: c.ink2 }}> (optional)</Text> : null}
      </Text>
      <View style={{ width: width || '100%', height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.bg, borderWidth: 2, borderColor: border }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.ink3}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          editable={editable}
          autoCapitalize={mono || keyboardType === 'email-address' ? 'none' : 'sentences'}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{ flex: 1, minWidth: 0, fontFamily: family, fontSize: italic ? 17 : 16, color: c.ink }}
        />
        {suffix ? <Text style={{ fontFamily: font('text', 600), fontSize: 14, color: c.ink2 }}>{suffix}</Text> : null}
        {rightIcon ? <IconButton name={rightIcon} label={label} onPress={onRightPress} size={20} color={c.ink2} /> : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Icon name="info" size={16} color={c.danger} strokeWidth={2} />
          <Txt v="caption" color={c.danger}>{error}</Txt>
        </View>
      ) : hint ? <Txt v="caption" color={c.ink3} style={{ fontFamily: font('text', 600) }}>{hint}</Txt> : null}
    </View>
  );
}

export function Area({ label, value, onChangeText, placeholder, rows = 3, optional }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: c.ink }}>
        {label}
        {optional ? <Text style={{ fontFamily: font('text', 600), color: c.ink2 }}> (optional)</Text> : null}
      </Text>
      <TextInput
        accessibilityLabel={label}
        multiline
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        textAlignVertical="top"
        style={{ minHeight: rows * 24 + 24, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: c.bg, borderWidth: 2, borderColor: focus ? c.accent : 'transparent', fontFamily: font('text', 400), fontSize: 16, lineHeight: 24, color: c.ink }}
      />
    </View>
  );
}

// Filter pills in a sideways-scrolling row. items: [{ key, label }]
export function Pills({ items, value, onChange }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(it.key)}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? c.accent : 'transparent', borderWidth: on ? 0 : 1, borderColor: c.line }}>
            <Text style={{ fontFamily: font('text', on ? 700 : 600), fontSize: 14, color: on ? c.onAccent : c.ink }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Two or three options side by side (Light / Dark / Device).
export function Segmented({ items, value, onChange }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: c.bg }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(it.key)}
            style={{ flex: 1, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent', borderWidth: on ? 1 : 0, borderColor: c.line }}>
            <Text style={{ fontFamily: font('text', on ? 800 : 700), fontSize: 14, color: on ? c.ink : c.ink2 }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- lists ---------- */

// Flat list row with hairline divider (no card). `serif` titles for plant names.
export function Row({ left, title, sub, right, onPress, last, serif = true }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      {left || null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={2} style={serif ? { fontFamily: font('display', 600), fontSize: 17, lineHeight: 22, color: c.ink } : { fontFamily: font('text', 700), fontSize: 16, lineHeight: 22, color: c.ink }}>{title}</Text>
        {sub ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 }}>{sub}</View> : null}
      </View>
      {right !== undefined ? right : onPress ? <Icon name="chevR" size={20} color={c.ink3} /> : null}
    </Pressable>
  );
}

export function MenuRow({ icon, label, onPress, right, last, tone = 'accent' }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      <IconTile name={icon} tone={tone} />
      <Text style={{ flex: 1, fontFamily: font('text', 700), fontSize: 16, color: c.ink }}>{label}</Text>
      {right !== undefined ? right : <Icon name="chevR" size={20} color={c.ink3} />}
    </Pressable>
  );
}

export function IconTile({ name, tone = 'accent', size = 40 }) {
  const { c } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c[tone + 'Soft'] }}>
      <Icon name={name} size={20} color={c[tone]} />
    </View>
  );
}

// Plant photo. Falls back to a leaf on a soft green tile when there is no photo
// or it cannot load (no signal, deleted file).
export function Thumb({ uri, size = 52, radius = 10, style }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: radius };
  if (!uri || failed) {
    return (
      <View style={[box, { backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Icon name="leaf" size={size * 0.42} color={c.accent} />
      </View>
    );
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} style={[box, { backgroundColor: c.bg }, style]} accessibilityIgnoresInvertColors />;
}

export function Avatar({ name, size = 40, muted }) {
  const { c } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: muted ? c.bg : c.accent }}>
      <Text style={{ fontFamily: font('text', 800), fontSize: size * 0.36, color: muted ? c.ink : c.onAccent }}>{toInitials(name)}</Text>
    </View>
  );
}

/* ---------- status ---------- */

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

/* ---------- loading ---------- */

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

/* ---------- map and charts ---------- */

// Simple park map: ground colour, a river and a trail, and plant dots (x, y from 0 to 1).
export function MiniMap({ height = 150, width = 350, dots = [], label, onPress, rounded = true }) {
  const { c } = useTheme();
  const w = width; // pass the real width for a full-screen map so dots line up with tap targets
  const h = height;
  const body = (
    <View style={{ height, borderRadius: rounded ? 14 : 0, overflow: 'hidden', backgroundColor: c.mapTile }}>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <Path d={`M-10 ${h * 0.72} C 60 ${h * 0.55}, 120 ${h * 0.85}, 200 ${h * 0.62} S 330 ${h * 0.25}, 370 ${h * 0.4}`} fill="none" stroke={c.mapLine} strokeWidth={10} strokeLinecap="round" />
        <Path d={`M40 -10 C 70 ${h * 0.3}, 60 ${h * 0.65}, 110 ${h + 10}`} fill="none" stroke={c.mapLine} strokeWidth={4} strokeDasharray="2 8" strokeLinecap="round" />
        {dots.map((d, i) =>
          d.selected ? (
            <React.Fragment key={i}>
              <Circle cx={d.x * w} cy={d.y * h} r={22} fill={c.accent} fillOpacity={0.18} />
              <Circle cx={d.x * w} cy={d.y * h} r={9} fill={c.accent} stroke={c.surface} strokeWidth={3} />
            </React.Fragment>
          ) : (
            <Circle key={i} cx={d.x * w} cy={d.y * h} r={7} fill={d.color || c.accent} stroke={c.surface} strokeWidth={2.5} />
          ),
        )}
      </Svg>
      {label ? (
        <View style={{ position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.surface }}>
          <Txt v="caption" color={c.ink2}>{label}</Txt>
        </View>
      ) : null}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel="Open map" onPress={onPress}>{body}</Pressable> : body;
}

// Line chart for sensor readings with a dashed limit line.
export function Spark({ values = [], limit, height = 64 }) {
  const { c } = useTheme();
  if (values.length < 2) return <Txt v="small" color={c.ink2}>No readings yet.</Txt>;
  const w = 320;
  const all = limit == null ? values : [...values, limit];
  const lo = Math.min(...all) - 1;
  const hi = Math.max(...all) + 1;
  const x = (i) => (i / (values.length - 1)) * w;
  const y = (v) => height - ((v - lo) / (hi - lo)) * height;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" accessibilityLabel={`Latest ${values[values.length - 1]}`}>
      {limit != null ? <Line x1="0" x2={w} y1={y(limit)} y2={y(limit)} stroke={c.danger} strokeWidth={1.5} strokeDasharray="4 4" /> : null}
      <Polyline points={pts} fill="none" stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ---------- sheet ---------- */

// Bottom sheet that sits over the paused camera after a scan.
export function Sheet({ children }) {
  const { c } = useTheme();
  return (
    <View accessibilityViewIsModal style={{ gap: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: c.surface }}>
      <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.line }} />
      {children}
    </View>
  );
}

export const hairline = StyleSheet.hairlineWidth;
