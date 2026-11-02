// apps/mobile/components/PhotoNote.js
// What a field photo shows: its caption and trait tags. Nothing if it has neither.
import React from 'react';
import { View } from 'react-native';
import { useTheme } from './Theme.js';
import { Txt } from './Bits.js';

export default function PhotoNote({ photo, style }) {
  const { c } = useTheme();
  const traits = photo?.traits || [];
  if (!photo?.caption && !traits.length) return null;
  return (
    <View style={[{ gap: 2 }, style]}>
      {photo.caption ? <Txt v="small" color={c.ink}>{photo.caption}</Txt> : null}
      {traits.length ? <Txt v="caption" color={c.ink2}>Shows: {traits.join(', ')}</Txt> : null}
    </View>
  );
}
