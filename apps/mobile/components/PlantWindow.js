// apps/mobile/components/PlantWindow.js
// The window a map pin opens: every plant at that spot, with photos and details.
import React, { useState } from 'react';
import { View, Text, Image, Modal, ScrollView, Linking, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { useStore } from '../../shared/store.js';
import { can } from '../../shared/permissions.js';
import { familyOf, lastUpdated, nameOf, plantVisits } from '../../shared/selectors.js';
import { useTheme, font } from './Theme.js';
import Icon from './Icon.js';
import { Txt, Sci, Mono, Chip, KV, Button, IconButton, TextLink } from './Bits.js';
import PhotoNote from './PhotoNote.js';
import { longDate, accuracy } from './format.js';

const SIDE = 20;

function Photos({ photos }) {
  const { c } = useTheme();
  const width = useWindowDimensions().width - SIDE * 2;
  const [index, setIndex] = useState(0);
  if (!photos.length) {
    return (
      <View style={{ height: 120, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: c.accentSoft }}>
        <Icon name="leaf" size={32} color={c.accent} />
        <Txt v="caption" color={c.ink2}>No photos yet</Txt>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {photos.map((p, i) => (
            <Image key={p.id ? `${p.id}-${i}` : i} source={{ uri: p.url }} accessibilityLabel={p.caption || `Photo ${i + 1} of ${photos.length}`}
              style={{ width, height: 220, backgroundColor: c.accentSoft }} />
          ))}
        </ScrollView>
        {photos.length > 1 ? (
          <View style={{ position: 'absolute', right: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: c.surface }}>
            <Text style={{ fontFamily: font('text', 700), fontSize: 12, color: c.ink }}>{index + 1} / {photos.length}</Text>
          </View>
        ) : null}
      </View>
      <PhotoNote photo={photos[Math.min(index, photos.length - 1)]} />
    </View>
  );
}

function PlantDetails({ plant, coords, onOpen, last }) {
  const { db, role, notify } = useStore();
  const { c } = useTheme();
  const staff = can(role, 'pending');
  const visit = plantVisits(db, plant.id, role)[0];
  const updated = lastUpdated(db, plant, role);
  const text = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    notify('Coordinates copied');
  };

  return (
    <View style={{ gap: 14, paddingBottom: last ? 0 : 24, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Photos photos={plant.photos} />
      <View style={{ gap: 4 }}>
        <Txt v="title3">{plant.name}</Txt>
        {plant.scientific ? <Sci size={15}>{plant.scientific}</Sci> : null}
        {staff ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
            {plant.status ? <Chip status={plant.status} /> : null}
            {plant.species ? <Chip status={plant.species.conservation_status} /> : null}
          </View>
        ) : null}
      </View>
      <KV rows={[
        ['Tag', <Mono key="t" size={14}>{plant.qr_id}</Mono>],
        ['Family', familyOf(plant)],
        ...(visit?.height_cm != null ? [['Height', `${visit.height_cm} cm`]] : []),
        ...(visit?.morphology ? [['Appearance', visit.morphology]] : []),
        ...(staff && visit?.notes ? [['Notes', visit.notes]] : []),
        ...(staff ? [['Recorded by', nameOf(db, plant.registered_by)]] : []),
        ...(visit ? [['Last visit', longDate(visit.observed_at)]] : []),
        ...(updated ? [['Last updated', longDate(updated)]] : []),
      ]} />
      <View style={{ gap: 6 }}>
        <Txt v="label">Location</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <Mono size={14}>{text}</Mono>
          <TextLink label="Copy" size={14} onPress={copy} />
          {/* Never hand a protected plant's spot to an outside site. */}
          {!plant.endangered && !plant.location_reduced ? (
            <TextLink label="Google Maps" size={14} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`)} />
          ) : null}
        </View>
        <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 400) }}>
          {plant.location_reduced
            ? 'Approximate area, about 1.1 km across. The exact spot is protected.'
            : plant.gps_accuracy_m != null ? `GPS accuracy ${accuracy(plant.gps_accuracy_m)}` : 'GPS accuracy not recorded'}
        </Txt>
      </View>
      <Button label="View full page" kind="secondary" icon="arrowRight" height={44} size={15} onPress={() => onOpen(plant)} />
    </View>
  );
}

// `entries` is a list of { p, where } from the map page, where being the coordinates this role may see.
export default function PlantWindow({ entries, onClose, onOpen }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: SIDE, paddingRight: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 20, color: c.ink }}>
            {entries.length === 1 ? 'Plant at this spot' : `${entries.length} plants at this spot`}
          </Text>
          <IconButton name="x" label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: SIDE, paddingBottom: SIDE + insets.bottom, gap: 24 }}>
          {entries.map(({ p, where }, i) => (
            <PlantDetails key={p.id} plant={p} coords={where} onOpen={onOpen} last={i === entries.length - 1} />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
