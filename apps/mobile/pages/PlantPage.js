// apps/mobile/pages/PlantPage.js
// Species profile (one kind of plant) and the tagged-plant page (one plant in the
// forest, what you see after scanning its tag).
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../../shared/store.js';
import { plantView, visiblePlants, shownCoords, nameOf, speciesObservationPhotos } from '../../shared/selectors.js';
import { can } from '../../shared/permissions.js';
import { MAP_BOUNDS } from '../../shared/site.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Txt, Sci, Mono, Chip, Section, TextLink, Row, Thumb, MiniMap, KV, Button, Empty, Header, IconButton, Screen,
} from '../components/Bits.js';
import { longDate, coords } from '../components/format.js';

// Where a plant sits on the little map (0..1 inside the park bounds).
export const mapPoint = ({ lat, lng }) => ({
  x: (lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng),
  y: 1 - (lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat),
});

// Big photo at the top with a round back button and a photo counter. Swipe for more.
function Hero({ photos, height = 260, onBack }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  return (
    <View style={{ height }}>
      {photos.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {photos.map((p, i) => (
            <Image key={p.id} source={{ uri: p.url }} accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} style={{ width, height, backgroundColor: c.accentSoft }} />
          ))}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
          <Icon name="leaf" size={64} color={c.accent} />
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}
        style={{ position: 'absolute', left: 12, top: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}>
        <Icon name="chevL" size={22} color={c.ink} />
      </Pressable>
      {photos.length > 1 ? (
        <View style={{ position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: c.surface }}>
          <Text style={{ fontFamily: font('text', 700), fontSize: 12, color: c.ink }}>{index + 1} / {photos.length}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Page({ hero, children }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {hero}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 22 }}>{children}</View>
      </ScrollView>
    </View>
  );
}

const HIDDEN_NOTE = 'Location hidden to protect this plant.';

export function SpeciesProfile({ nav, params }) {
  const { db, role } = useStore();
  const { c, t } = useTheme();
  const sp = db.species.find((s) => s.id === params?.id && !s.is_deleted);
  const staff = can(role, 'pending');
  if (!sp || (!sp.is_published && !staff)) {
    return (
      <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />}>
        <Empty>This species is not published yet.</Empty>
      </Screen>
    );
  }
  const plants = visiblePlants(db, role).filter((p) => p.species_id === sp.id);
  const media = db.species_media ? db.species_media.filter((m) => m.species_id === sp.id).sort((a, b) => a.sort_order - b.sort_order) : [];
  const obsPhotos = speciesObservationPhotos(db, sp.id);
  const effectiveMedia = media.length > 0 ? media.map((m) => ({ id: m.id, url: m.url })) : obsPhotos;
  const photos = [...effectiveMedia, ...plants.flatMap((p) => p.photos)].slice(0, 6);
  const dots = plants.map((p) => shownCoords(p, role)).filter(Boolean).map((pt, i) => ({ ...mapPoint(pt), selected: i === 0 }));

  return (
    <Page hero={<Hero photos={photos} onBack={nav.back} />}>
      <View style={{ gap: 6 }}>
        <Text style={[t.overline, { color: c.accent }]}>{sp.family}</Text>
        <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 30, lineHeight: 36, color: c.ink }}>{sp.common_name || sp.scientific_name}</Text>
        <Sci size={17}>{sp.scientific_name}</Sci>
        <View style={{ paddingTop: 6 }}><Chip status={sp.conservation_status} /></View>
      </View>
      {sp.description ? <Txt v="body" style={{ lineHeight: 25 }}>{sp.description}</Txt> : null}
      {sp.cultural_significance ? (
        <Section title="Cultural significance"><Txt v="body" style={{ lineHeight: 25 }}>{sp.cultural_significance}</Txt></Section>
      ) : null}
      <Section title="Where it grows" right={dots.length ? <TextLink label="Open map" size={14} onPress={() => nav.go('map', { species: sp.id })} /> : null}>
        {dots.length ? (
          <MiniMap dots={dots} label={`${plants.length} tagged plant${plants.length === 1 ? '' : 's'}`} onPress={() => nav.go('map', { species: sp.id })} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="lock" size={18} color={c.ink2} />
            <Txt v="body" color={c.ink2} style={{ fontSize: 15 }}>{plants.length ? HIDDEN_NOTE : 'No tagged plants yet.'}</Txt>
          </View>
        )}
      </Section>
      {plants.length ? (
        <Section title="Tagged plants" gap={0}>
          {plants.map((p, i) => (
            <Row key={p.id} serif={false} left={<Thumb uri={p.photos[0]?.url} size={48} />}
              title={<Mono size={16}>{p.qr_id}</Mono>}
              sub={<Txt v="small" color={c.ink2}>Tagged {longDate(db.observations.find((o) => o.specimen_id === p.id)?.observed_at)}</Txt>}
              onPress={() => nav.go('tag', { qr: p.qr_id })} last={i === plants.length - 1} />
          ))}
        </Section>
      ) : null}
    </Page>
  );
}

export function TaggedPlant({ nav, params }) {
  const { db, role } = useStore();
  const { c } = useTheme();
  const raw = db.plants.find((p) => p.qr_id === params?.qr && !p.is_deleted);
  const p = plantView(db, raw);
  const staff = can(role, 'pending');
  const hasPublishedSpecies = p?.species && p.species.is_published;
  if (!p || (!p.isPublic && !hasPublishedSpecies && !staff)) {
    return (
      <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />}>
        <Empty icon="qr">{params?.qr} is not published yet. Check back once park staff have verified it.</Empty>
      </Screen>
    );
  }
  const obs = db.observations.filter((o) => o.specimen_id === p.id).sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  const firstObs = obs[0];
  const lastObs = obs[obs.length - 1];
  const where = (!p.isPublic && !staff) ? null : shownCoords(p, role);

  return (
    <Page hero={<Hero photos={p.photos} height={220} onBack={nav.back} />}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.bg }}>
            <Icon name="qr" size={16} color={c.ink} />
            <Mono size={13}>{p.qr_id}</Mono>
          </View>
          {staff ? <TextLink label="Show QR code" size={14} onPress={() => nav.go('tagQr', { qr: p.qr_id })} /> : null}
        </View>
        <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 28, lineHeight: 34, color: c.ink }}>{p.name}</Text>
        {p.scientific ? <Sci size={16}>{p.scientific}{p.species?.family ? ` · ${p.species.family}` : ''}</Sci> : null}
        {staff ? <View style={{ flexDirection: 'row', gap: 8, paddingTop: 6 }}><Chip status={p.status} />{p.endangered ? <Chip status="endangered" /> : null}</View> : null}
      </View>
      {!staff ? (
        <Txt v="body" style={{ lineHeight: 25 }}>
          {p.isPublic
            ? `You found tagged plant ${p.qr_id}. It was recorded by park botanists on ${longDate(firstObs?.observed_at)}.`
            : `Tag ${p.qr_id} is on a ${p.name} (${p.scientific}). This field observation is currently being verified by park staff.`}
        </Txt>
      ) : null}
      <Section title="This plant">
        <KV rows={[
          ['Height', p.height_cm ? `${p.height_cm} cm` : '-'],
          ['Recorded', longDate(firstObs?.observed_at)],
          ...(staff ? [['Recorded by', nameOf(db, p.registered_by)], ['Last visit', longDate(lastObs?.observed_at)]] : []),
          ['Location', where ? <Mono size={14}>{coords(where.lat, where.lng)}</Mono> : p.lat == null ? 'Not captured when recorded.' : HIDDEN_NOTE],
        ]} />
      </Section>
      {where ? <Section title="Where it is"><MiniMap height={140} dots={[{ ...mapPoint(where), selected: true }]} /></Section> : null}
      <View style={{ gap: 8 }}>
        {role === 'botanist' ? <Button label="Record a revisit" icon="plus" onPress={() => nav.go('revisit', { qr: p.qr_id })} /> : null}
        {role === 'officer' && (obs.find((o) => o.status === 'synced') || lastObs) ? (
          <Button
            label={obs.find((o) => o.status === 'synced') ? "Review record (Action needed)" : "Review decisions"}
            icon="clipboard"
            onPress={() => nav.go('reviewItem', { id: (obs.find((o) => o.status === 'synced') || lastObs).id })}
          />
        ) : null}
        {p.species ? <Button label="About this species" kind="secondary" icon="leaf" onPress={() => nav.go('species', { id: p.species.id })} /> : null}
      </View>
    </Page>
  );
}
