// apps/mobile/components/bits/inputs.js
// Form input components: search fields, text inputs, text areas, filter pills, and segmented controls.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import Icon from '../Icon.js';
import { useTheme, font } from '../Theme.js';
import { Txt } from './text.js';
import { IconButton } from './buttons.js';

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

// Compact horizontal sort bar: items: [{ key, label }]
export function SortBar({ items = [], value, onChange, label = 'Sort' }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name="sort" size={13} color={c.ink2} />
        <Text style={{ fontFamily: font('text', 700), fontSize: 12, color: c.ink2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 12 }}>
        {items.map((opt) => {
          const on = opt.key === value;
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Sort by ${opt.label}`}
              onPress={() => onChange(opt.key)}
              style={{
                height: 28,
                paddingHorizontal: 10,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? c.accentSoft : c.bg,
                borderWidth: 1,
                borderColor: on ? c.accent : 'transparent',
              }}
            >
              <Text style={{ fontFamily: font('text', on ? 700 : 500), fontSize: 12, color: on ? c.accent : c.ink2 }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
