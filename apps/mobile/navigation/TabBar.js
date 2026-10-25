// apps/mobile/navigation/TabBar.js
// Five-slot role-based bottom bar with a raised centre button for the primary action.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { getRoleTabs } from './tabs.js';

export default function TabBar({ role, current, onTab, badges = {} }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const tabs = getRoleTabs(role);

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 76 + insets.bottom,
        paddingBottom: 12 + insets.bottom,
        paddingHorizontal: 4,
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      {tabs.map((tab) => {
        const on = tab.key === current;
        const count = tab.badge ? badges[tab.badge] || 0 : 0;

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={count ? `${tab.label}, ${count} new` : tab.label}
            onPress={() => onTab(tab.key)}
            style={{ flex: 1, alignItems: 'center', gap: 4 }}
          >
            {tab.main ? (
              <View
                style={{
                  width: 56,
                  height: 56,
                  marginTop: -30,
                  borderRadius: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.accent,
                  borderWidth: 4,
                  borderColor: c.surface,
                }}
              >
                <Icon name={tab.icon} size={26} color={c.onAccent} strokeWidth={2} />
              </View>
            ) : (
              <View>
                <Icon name={tab.icon} size={24} color={on ? c.accent : c.ink2} />
                {count > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -10,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 5,
                      borderRadius: 9,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: c.danger,
                    }}
                  >
                    <Text style={{ fontFamily: font('text', 800), fontSize: 11, color: c.onDanger }}>
                      {count}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font('text', on || tab.main ? 800 : 700),
                fontSize: 12,
                color: tab.main ? c.ink : on ? c.accent : c.ink2,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
