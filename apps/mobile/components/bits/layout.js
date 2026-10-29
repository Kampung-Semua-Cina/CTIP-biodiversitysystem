// apps/mobile/components/bits/layout.js
// Structural layout components: full-screen container, navigation headers, bars, sections, and sheets.
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, font } from '../Theme.js';
import { Txt } from './text.js';
import { IconButton } from './buttons.js';

// A full screen: optional header, scrolling content, optional footer pinned above the tab bar.
// The default bottom space clears the raised Add plant / Scan button in the tab bar.
// Uses synchronous insets from useSafeAreaInsets() to prevent layout shifting on transitions.
export function Screen({ header, children, footer, scroll = true, bg, pad = 20, gap = 24, top = 16, bottom = 40, safeTop = true }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const content = { paddingHorizontal: pad, paddingTop: top, paddingBottom: bottom, gap };

  return (
    <View style={{ flex: 1, backgroundColor: bg || c.surface, paddingTop: safeTop ? insets.top : 0 }}>
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
    </View>
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
