// apps/mobile/pages/AddPlant.js
// New plant record after scanning an unused tag, the "Sent for review" screen,
// and a revisit to a plant that is already tagged.
import React, { useState } from 'react';
import { View, Text, Pressable, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useStore } from '../../shared/store.js';
import { plantView } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Header, IconButton, TextLink, Txt, Mono, Sci, Section, Field, Area, Button, DotLabel, Thumb, Empty,
} from '../components/Bits.js';
import { shortDate, coords } from '../components/format.js';

const MAX_PHOTOS = 6;

// Take a photo with the camera (or pick one if the camera is not allowed).
// CTIP-55 adds upload to Supabase Storage; for now the photo stays on the phone.
async function takePhoto() {
  try {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const result = cam.granted
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.length) return { url: result.assets[0].uri };
  } catch {
    // Camera not available (for example on a simulator); nothing to add.
  }
  return null;
}

// Simulated GPS fix near the trail head. CTIP-56 replaces this with expo-location.
function readGps() {
  const jitter = () => (Math.random() - 0.5) * 0.0006;
  return { lat: +(3.8031 + jitter()).toFixed(5), lng: +(113.7762 + jitter()).toFixed(5), acc: Math.round(4 + Math.random() * 5) };
}

function PhotoStrip({ photos, onAdd, onRemove, highlightAdd }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {photos.map((p, i) => (
        <Pressable key={p.url + i} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}${i === 0 ? ', cover' : ''}. Hold to remove.`} onLongPress={() => onRemove(i)}
          style={i === 0 ? { borderRadius: 12, borderWidth: 2, borderColor: c.accent, padding: 2 } : { padding: 4 }}>
          <Image source={{ uri: p.url }} style={{ width: 72, height: 72, borderRadius: 9, backgroundColor: c.accentSoft }} />
        </Pressable>
      ))}
      {photos.length < MAX_PHOTOS ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={onAdd}
          style={{ width: 76, height: 76, marginTop: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: highlightAdd ? 'transparent' : c.bg, borderWidth: highlightAdd ? 2 : 0, borderStyle: 'dashed', borderColor: c.warning }}>
          <Icon name={photos.length ? 'plus' : 'camera'} size={24} color={highlightAdd ? c.warning : c.accent} />
          {!photos.length ? <Text style={{ fontFamily: font('text', 800), fontSize: 12, color: c.accent }}>Add</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

function GpsRow({ gps, onRefresh, title }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16 }}>
      <Icon name="pin" size={22} color={gps.acc <= 10 ? c.success : c.warning} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Txt v="label">{title}</Txt> : <Mono size={15}>{coords(gps.lat, gps.lng)}</Mono>}
        <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>GPS ±{gps.acc} m · {gps.acc <= 10 ? 'good fix' : 'weak fix, try again in the open'}</Txt>
      </View>
      <IconButton name="refresh" label="Refresh location" color={c.accent} size={20} onPress={onRefresh} />
    </View>
  );
}

// Species picker: type a name, pick from the species list (CTIP-26) and pre-fill (CTIP-63).
function SpeciesField({ value, onChange, onPick, species }) {
  const { c } = useTheme();
  const needle = value.trim().toLowerCase();
  const exact = species.find((s) => s.scientific_name.toLowerCase() === needle);
  const matches = needle.length > 1 && !exact
    ? species.filter((s) => `${s.common_name} ${s.scientific_name}`.toLowerCase().includes(needle)).slice(0, 4)
    : [];
  return (
    <View style={{ gap: 6 }}>
      <Field label="Species" value={value} onChangeText={onChange} placeholder="Start typing a name" italic
        hint={exact ? `${exact.common_name} · ${exact.family}. Details pre-filled from the species list.` : 'Leave as your best guess. An officer confirms it.'} />
      {matches.map((s) => (
        <Pressable key={s.id} accessibilityRole="button" onPress={() => onPick(s)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.bg }}>
          <Icon name="leaf" size={18} color={c.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font('text', 700), fontSize: 15, color: c.ink }}>{s.common_name}</Text>
            <Sci size={14}>{s.scientific_name}</Sci>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function AddPlant({ nav, params = {} }) {
  const { db, addPlant } = useStore();
  const { c } = useTheme();
  const qr = params.qr;
  const species = db.species.filter((s) => !s.is_deleted);
  const [photos, setPhotos] = useState([]);
  const [sp, setSp] = useState('');
  const [height, setHeight] = useState('');
  const [looks, setLooks] = useState('');
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState(readGps);
  const [tried, setTried] = useState(false);

  if (!qr) {
    return (
      <Screen header={<Header left={<IconButton name="x" label="Close" onPress={nav.back} />} />}>
        <Empty icon="qr">Scan an unused tag first. The record starts from the tag on the plant.</Empty>
        <Button label="Scan a tag" icon="scan" onPress={() => nav.replace('scan')} />
      </Screen>
    );
  }

  const pick = (s) => {
    setSp(s.scientific_name);
    if (!looks) setLooks(s.description || '');
  };
  const problems = { photos: photos.length === 0, looks: !looks.trim() };
  const ok = !problems.photos && !problems.looks;

  const submit = () => {
    setTried(true);
    if (!ok) return;
    addPlant({ qr_id: qr, proposed_species: sp.trim(), morphology: looks.trim(), height_cm: height, notes: notes.trim(), photos, lat: gps.lat, lng: gps.lng, gps_accuracy_m: gps.acc });
    nav.replace('submitted', { qr, name: sp.trim(), photos: photos.length, acc: gps.acc, cover: photos[0]?.url });
  };

  const leave = () => {
    if (!photos.length && !looks && !sp) return nav.back();
    Alert.alert('Discard this record?', 'What you entered will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: nav.back },
    ]);
  };

  return (
    <Screen
      header={<Header left={<IconButton name="x" label="Close" onPress={leave} />} />}
      top={0}
      gap={20}
      footer={<View style={{ flex: 1 }}><Button label="Submit for review" onPress={submit} /></View>}
    >
      <View style={{ gap: 6 }}>
        <Txt v="title1">New plant</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="qr" size={18} color={c.ink2} />
          <Txt v="body" color={c.ink2} style={{ fontSize: 15 }}>Tag</Txt>
          <Mono size={15}>{qr}</Mono>
          <TextLink label="Rescan" onPress={() => nav.replace('scan')} />
        </View>
      </View>

      <Section title="Photos" right={<Txt v="caption" color={tried && problems.photos ? c.warning : c.ink3}>{tried && problems.photos ? 'Add at least one' : `${photos.length} of ${MAX_PHOTOS}`}</Txt>} gap={12}>
        <PhotoStrip
          photos={photos}
          highlightAdd={tried && problems.photos}
          onAdd={async () => { const p = await takePhoto(); if (p) setPhotos((list) => [...list, p]); }}
          onRemove={(i) => setPhotos((list) => list.filter((_, j) => j !== i))}
        />
      </Section>

      <Section title="Details" gap={16}>
        <SpeciesField value={sp} onChange={setSp} onPick={pick} species={species} />
        <Field label="Height (cm)" value={height} onChangeText={(t) => setHeight(t.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" width={140} />
        <View style={{ gap: 6 }}>
          <Area label="Appearance" value={looks} onChangeText={setLooks} placeholder="Leaves, stem, pitchers, flowers, roots" />
          {tried && problems.looks ? <Txt v="caption" color={c.danger}>Describe what the plant looks like.</Txt> : null}
        </View>
        <Area label="Field notes" optional value={notes} onChangeText={setNotes} placeholder="Habitat, nearby trail, anything unusual" rows={2} />
      </Section>

      <GpsRow gps={gps} onRefresh={() => setGps(readGps())} />
    </Screen>
  );
}

export function Submitted({ nav, params = {} }) {
  const { c } = useTheme();
  return (
    <Screen header={<Header left={<IconButton name="x" label="Close" onPress={nav.home} />} />} top={0} gap={24}>
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 40 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: c.successSoft }}>
          <Icon name="check" size={40} color={c.success} strokeWidth={2.25} />
        </View>
        <Txt v="title1" accessibilityRole="header">Sent for review</Txt>
        <Txt v="body" color={c.ink2} style={{ textAlign: 'center', maxWidth: 300 }}>
          An officer will check {params.qr}. You'll get an alert when it is approved or returned.
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
        <Thumb uri={params.cover} size={56} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontFamily: params.name ? font('display', 500, true) : font('display', 600), fontSize: 17, color: c.ink }}>{params.name || 'Species not set'}</Text>
          <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>{params.qr} · {params.photos} photo{params.photos === 1 ? '' : 's'} · ±{params.acc} m</Txt>
        </View>
        <DotLabel status="synced" />
      </View>
      <View style={{ gap: 4, paddingTop: 24 }}>
        <Button label="Tag another plant" icon="scan" onPress={() => nav.replace('scan')} />
        <Button label="View my records" kind="text" height={48} size={15} onPress={() => nav.tab('records')} />
      </View>
    </Screen>
  );
}

export function Revisit({ nav, params = {} }) {
  const { db, addRevisit, notify } = useStore();
  const { c } = useTheme();
  const raw = db.plants.find((p) => p.qr_id === params.qr && !p.is_deleted);
  const plant = plantView(db, raw);
  const [photos, setPhotos] = useState([]);
  const [height, setHeight] = useState('');
  const [changes, setChanges] = useState('');
  const [gps, setGps] = useState(readGps);
  if (!plant) {
    return (
      <Screen header={<Header left={<IconButton name="x" label="Close" onPress={nav.back} />} />}>
        <Empty icon="qr">This tag is not on a plant yet.</Empty>
      </Screen>
    );
  }
  const last = db.observations.filter((o) => o.specimen_id === plant.id).sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
  const ok = photos.length > 0 || changes.trim() || height;

  const submit = () => {
    addRevisit({ specimen_id: plant.id, height_cm: height || last?.height_cm, morphology: changes.trim() || last?.morphology, notes: '', photos, gps_accuracy_m: gps.acc });
    notify(`Revisit of ${plant.qr_id} sent for review`);
    nav.tab('records');
  };

  return (
    <Screen
      header={<Header left={<IconButton name="x" label="Close" onPress={nav.back} />} />}
      top={0}
      gap={20}
      footer={<View style={{ flex: 1 }}><Button label="Submit revisit" disabled={!ok} onPress={submit} /></View>}
    >
      <View style={{ gap: 6 }}>
        <Txt v="title1">Revisit</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Mono size={15} color={c.ink2}>{plant.qr_id}</Mono>
          <Txt v="body" color={c.ink2} style={{ fontSize: 15 }}>· {plant.name}</Txt>
        </View>
      </View>
      {last ? (
        <View style={{ gap: 4, padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.bg }}>
          <Txt v="overline">Last visit · {shortDate(last.observed_at)}</Txt>
          <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{[last.height_cm ? `${last.height_cm} cm` : null, last.morphology].filter(Boolean).join(' · ')}</Txt>
        </View>
      ) : null}
      <Section title="New photos" right={<Txt v="caption" color={c.ink3}>{photos.length} of {MAX_PHOTOS}</Txt>} gap={12}>
        <PhotoStrip photos={photos} onAdd={async () => { const p = await takePhoto(); if (p) setPhotos((l) => [...l, p]); }} onRemove={(i) => setPhotos((l) => l.filter((_, j) => j !== i))} />
      </Section>
      <Section title="What has changed" gap={16}>
        <Field label="Height (cm)" value={height} onChangeText={(t) => setHeight(t.replace(/[^\d.]/g, ''))} placeholder={last?.height_cm ? String(last.height_cm) : ''} keyboardType="decimal-pad" width={140} hint="Leave empty if it has not changed" />
        <Area label="Changes" value={changes} onChangeText={setChanges} placeholder="New pitchers, flowering, damage…" />
      </Section>
      <GpsRow gps={gps} title="Same place as before" onRefresh={() => setGps(readGps())} />
    </Screen>
  );
}
