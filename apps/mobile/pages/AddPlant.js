// apps/mobile/pages/AddPlant.js
// New plant record after scanning an unused tag, the "Sent for review" screen,
// and a revisit to a plant that is already tagged.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { scanFromURLAsync } from 'expo-camera';

import { useStore } from '../../shared/store.js';
import { plantView } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import {
  Screen, Header, IconButton, TextLink, Txt, Mono, Sci, Section, Field, Area, Button, DotLabel, Thumb, Empty,
} from '../components/Bits.js';
import { shortDate, coords } from '../components/format.js';
import { saveDraft, getDraft, clearDraft } from '../draftStore.js';
import SpeciesPicker from '../components/SpeciesPicker.js';
import { TagQrView } from './TagQr.js';
import { prefillFromSpecies } from '../../shared/speciesSearch.js';
import { uid } from '../../shared/utils.js';
import { extractTag } from '../../shared/selectors.js';

const MAX_PHOTOS = 6;

// Take a photo with the camera.
async function takePhoto() {
  try {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const result = cam.granted
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
    if (!result.canceled && result.assets?.length) {
      const a = result.assets[0];
      return [{
        id: uid(),
        url: a.uri,
        base64: a.base64 || null,
        name: a.fileName || `photo_${Date.now()}.jpg`,
        type: a.mimeType || 'image/jpeg',
      }];
    }
  } catch {
    // Camera not available (e.g. simulator)
  }
  return [];
}

// Pick photo(s) from device image gallery.
async function pickFromGallery() {
  try {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      const ask = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!ask.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to choose images.');
        return [];
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
      base64: true,
      selectionLimit: MAX_PHOTOS,
    });
    if (!result.canceled && result.assets?.length) {
      return result.assets.map((a, i) => ({
        id: uid(),
        url: a.uri,
        base64: a.base64 || null,
        name: a.fileName || `photo_${Date.now()}_${i}.jpg`,
        type: a.mimeType || 'image/jpeg',
      }));
    }
  } catch {
    // Gallery not available
  }
  return [];
}

// No fix: the record is sent with "location not captured" and the officer is told.
// Never a made-up position, which would look like a real reading.
const NO_GPS = { lat: null, lng: null, acc: null };
const hasFix = (gps) => gps.lat != null && gps.lng != null;

// Real hardware GPS acquisition via expo-location (CTIP-56)
async function requestHardwareLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return {
        gps: NO_GPS,
        error: 'Location permission denied. Allow location access in your device settings, or the record is sent without a location.',
        denied: true,
      };
    }

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    if (loc && loc.coords) {
      return {
        gps: {
          lat: +loc.coords.latitude.toFixed(5),
          lng: +loc.coords.longitude.toFixed(5),
          acc: Math.round(loc.coords.accuracy || 6),
        },
        error: null,
        denied: false,
      };
    }
  } catch (err) {
    console.warn('GPS hardware read error:', err?.message || err);
  }

  return {
    gps: NO_GPS,
    error: 'Could not get a GPS fix. Tap refresh to try again, or the record is sent without a location.',
    denied: false,
  };
}

function PhotoStrip({ photos, onAddCamera, onAddGallery, onRemove, highlightAdd }) {
  const { c } = useTheme();

  const promptChoice = () => {
    Alert.alert('Add Photo', 'Take a new photo with camera or choose from gallery', [
      { text: 'Take photo', onPress: onAddCamera },
      { text: 'Choose from gallery', onPress: onAddGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {photos.map((p, i) => (
          <Pressable key={p.url + i} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}${i === 0 ? ', cover' : ''}. Hold to remove.`} onLongPress={() => onRemove(i)}
            style={i === 0 ? { borderRadius: 12, borderWidth: 2, borderColor: c.accent, padding: 2 } : { padding: 4 }}>
            <Image source={{ uri: p.url }} style={{ width: 72, height: 72, borderRadius: 9, backgroundColor: c.accentSoft }} />
          </Pressable>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={promptChoice}
            style={{ width: 76, height: 76, marginTop: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: highlightAdd ? 'transparent' : c.bg, borderWidth: highlightAdd ? 2 : 0, borderStyle: 'dashed', borderColor: c.warning }}>
            <Icon name={photos.length ? 'plus' : 'camera'} size={24} color={highlightAdd ? c.warning : c.accent} />
            {!photos.length ? <Text style={{ fontFamily: font('text', 800), fontSize: 12, color: c.accent }}>Add</Text> : null}
          </Pressable>
        ) : null}
      </View>

      {photos.length < MAX_PHOTOS && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label="Take photo"
            icon="camera"
            kind="secondary"
            height={40}
            size={14}
            flex={1}
            onPress={onAddCamera}
          />
          <Button
            label="From gallery"
            icon="plus"
            kind="secondary"
            height={40}
            size={14}
            flex={1}
            onPress={onAddGallery}
          />
        </View>
      )}
    </View>
  );
}

function GpsRow({ gps, loading, error, onRefresh, title }) {
  const { c } = useTheme();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="pin" size={22} color={error || !hasFix(gps) || gps.acc > 10 ? c.warning : c.success} />
        <View style={{ flex: 1, gap: 2 }}>
          {title ? <Txt v="label">{title}</Txt> : <Mono size={15}>{coords(gps.lat, gps.lng)}</Mono>}
          <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>
            {loading ? 'Acquiring GPS fix…'
              : !hasFix(gps) ? 'Location not captured. The officer will be told.'
              : `GPS ±${gps.acc} m · ${gps.acc <= 10 ? 'good fix' : 'weak fix, try again in the open'}`}
          </Txt>
        </View>
        <IconButton name="refresh" label="Refresh location" color={c.accent} size={20} onPress={onRefresh} />
      </View>
      {error ? (
        <View style={{ padding: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.warningSoft }}>
          <Txt v="caption" color={c.warning} style={{ fontFamily: font('text', 600) }}>{error}</Txt>
        </View>
      ) : null}
    </View>
  );
}

export function AddPlant({ nav, params = {} }) {
  const { db, addPlant, generateTags } = useStore();
  const { c } = useTheme();
  const [qr, setQr] = useState(params.qr || '');
  const unusedTags = (db.tags || []).filter((t) => t.status === 'unused');
  const [photos, setPhotos] = useState([]);
  const [sp, setSp] = useState('');
  const [picked, setPicked] = useState(null); // species chosen from search (CTIP-63)
  const [height, setHeight] = useState('');
  const [looks, setLooks] = useState('');
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState(NO_GPS);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showQr, setShowQr] = useState(false); // the tag's QR, shown over the form (CTIP-27)
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (params.qr && params.qr !== qr) {
      setQr(params.qr);
    }
  }, [params.qr]);

  const generateNewTag = async () => {
    setGenerating(true);
    try {
      const ids = await generateTags(1, 'field');
      if (ids && ids.length > 0) {
        setQr(ids[0]);
        // Next step: print the code and fix it to the plant (CTIP-27).
        Alert.alert('New tag ready', `${ids[0]} is now this plant's tag. Show its QR code to print or share it.`, [
          { text: 'Later', style: 'cancel' },
          { text: 'Show QR', onPress: () => setShowQr(true) },
        ]);
      }
    } catch (err) {
      Alert.alert('Tag Generation Failed', err?.message || 'Could not generate QR tag.');
    } finally {
      setGenerating(false);
    }
  };

  const pickQrFromGallery = async () => {
    try {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        const ask = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!ask.granted) {
          Alert.alert('Permission needed', 'Allow photo library access to choose images.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      let foundData = null;

      try {
        if (typeof scanFromURLAsync === 'function') {
          const barcodes = await scanFromURLAsync(uri, ['qr']);
          if (barcodes && barcodes.length > 0) {
            foundData = barcodes[0].data;
          }
        }
      } catch (scanErr) {
        console.warn('scanFromURLAsync error:', scanErr?.message || scanErr);
      }

      const tagCandidate = extractTag(foundData || asset.fileName || uri);
      if (tagCandidate && /NIAH-\d{4}/.test(tagCandidate)) {
        // Check if plant already exists with this tag
        const existingPlant = (db.plants || []).find(
          (p) => p && p.qr_id && String(p.qr_id).toUpperCase() === tagCandidate && !p.is_deleted
        );
        if (existingPlant) {
          Alert.alert(
            'Tag Already In Use',
            `Tag ${tagCandidate} is already on plant "${existingPlant.species?.common_name || existingPlant.proposed_species || 'Recorded plant'}". Would you like to record a revisit instead?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Record Revisit', onPress: () => nav.replace('revisit', { qr: tagCandidate }) },
            ]
          );
          return;
        }
        setQr(tagCandidate);
        Alert.alert('QR Tag Bound', `Loaded tag: ${tagCandidate}`);
      } else {
        Alert.alert(
          'No QR Code Detected',
          'Could not detect a plant QR tag in the selected image. You can scan with camera, generate a new QR tag, or pick an unused tag.'
        );
      }
    } catch (err) {
      Alert.alert('Gallery Error', err?.message || 'Could not load photo from gallery.');
    }
  };

  const fetchGps = async () => {
    setGpsLoading(true);
    setGpsError('');
    const res = await requestHardwareLocation();
    setGps(res.gps);
    setGpsError(res.error || '');
    setGpsLoading(false);
  };

  useEffect(() => {
    fetchGps();
    // Restore crash-safe draft if present (CTIP-57)
    if (qr) {
      getDraft(qr).then((d) => {
        if (d) {
          if (d.proposed_species) setSp(d.proposed_species);
          if (d.picked_species) setPicked(d.picked_species);
          if (d.height_cm) setHeight(String(d.height_cm));
          if (d.morphology) setLooks(d.morphology);
          if (d.notes) setNotes(d.notes);
          if (d.photos && d.photos.length) setPhotos(d.photos);
          if (d.gps && !d.gps.simulated) setGps(d.gps); // older drafts may hold the old made-up position
          setRestoredDraft(true);
        }
      });
    }
  }, [qr]);

  // Autosave in-progress draft to crash-safe storage (CTIP-57)
  useEffect(() => {
    if (!qr) return;
    if (sp || looks || height || notes || photos.length > 0) {
      saveDraft(qr, { proposed_species: sp, picked_species: picked, height_cm: height, morphology: looks, notes, photos, gps });
    }
  }, [qr, sp, picked, looks, height, notes, photos, gps]);

  if (showQr && qr) {
    return <TagQrView qr={qr} onBack={() => setShowQr(false)} />;
  }

  if (!qr) {
    return (
      <Screen header={<Header left={<IconButton name="x" label="Close" onPress={nav.back} />} />} gap={20}>
        <View style={{ gap: 6 }}>
          <Txt v="title1">{params.make ? 'New tag' : 'Add plant'}</Txt>
          <Txt v="body" color={c.ink2}>
            {params.make
              ? 'Make a tag for this plant. You can then print its QR code and fix it to the plant.'
              : 'Every plant record starts from a QR tag. Choose how you want to tag this plant:'}
          </Txt>
        </View>

        {/* Coming from "No tag? Make a new one" on Scan, making a tag is the main action (CTIP-27). */}
        <View style={{ gap: 12 }}>
          {params.make ? null : <Button label="Scan tag with camera" icon="camera" onPress={() => nav.replace('scan')} />}
          <Button
            label={generating ? "Generating QR tag..." : "Generate new QR tag"}
            icon="qr"
            kind={params.make ? 'primary' : 'secondary'}
            disabled={generating}
            onPress={generateNewTag}
          />
          {params.make ? <Button label="Scan tag with camera" icon="camera" kind="secondary" onPress={() => nav.replace('scan')} /> : null}
          <Button label="Choose QR from gallery" icon="plus" kind="secondary" onPress={pickQrFromGallery} />
        </View>

        {unusedTags.length > 0 && (
          <Section title={`Or pick an unused tag (${unusedTags.length} available)`} gap={10}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {unusedTags.slice(0, 10).map((t) => (
                <Pressable
                  key={t.qr_id}
                  accessibilityRole="button"
                  accessibilityLabel={`Pick unused tag ${t.qr_id}`}
                  onPress={() => setQr(t.qr_id)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    backgroundColor: c.bg,
                    borderWidth: 1,
                    borderColor: c.line,
                  }}
                >
                  <Mono size={15} color={c.ink}>{t.qr_id}</Mono>
                </Pressable>
              ))}
            </View>
          </Section>
        )}
      </Screen>
    );
  }

  // Picking a search result fills the name, and the appearance only if it is empty (CTIP-63).
  const pick = (s) => {
    const filled = prefillFromSpecies(s, { proposed_species: sp, morphology: looks });
    setSp(filled.proposed_species);
    setLooks(filled.morphology);
    setPicked(filled.picked);
  };

  const addPhotoItems = (items) => {
    if (!items || !items.length) return;
    setPhotos((prev) => {
      const combined = [...prev, ...items];
      return combined.slice(0, MAX_PHOTOS);
    });
  };

  const problems = {
    photos: photos.length === 0,
    looks: !looks.trim(),
    species: !sp.trim(),
  };
  const ok = !problems.photos && !problems.looks && !problems.species;

  const submit = async () => {
    setTried(true);
    if (!ok) {
      if (problems.species) {
        Alert.alert('Species required', 'Please select or enter a species before submitting for review.');
      } else if (problems.photos) {
        Alert.alert('Photo required', 'Please add at least one photo of the plant.');
      } else if (problems.looks) {
        Alert.alert('Appearance required', 'Please describe what the plant looks like.');
      }
      return;
    }
    setSubmitting(true);
    try {
      const res = await addPlant({
        qr_id: qr,
        proposed_species: sp.trim(),
        morphology: looks.trim(),
        height_cm: height,
        notes: notes.trim(),
        photos,
        lat: gps.lat,
        lng: gps.lng,
        gps_accuracy_m: hasFix(gps) ? gps.acc : null,
      });
      // addPlant reports failure instead of throwing. Keep the draft so nothing is lost.
      if (!res?.ok) throw new Error(res?.message || 'Failed to submit observation.');
      await clearDraft(qr); // Clean up crash draft after successful submit (CTIP-57)
      nav.replace('submitted', { qr, name: sp.trim(), photos: photos.length, acc: gps.acc, cover: photos[0]?.url });
    } catch (err) {
      Alert.alert('Submission Error', err?.message || 'Failed to submit observation. Draft has been saved safely.');
    } finally {
      setSubmitting(false);
    }
  };

  const leave = () => {
    if (!photos.length && !looks && !sp) return nav.back();
    Alert.alert('Discard this record?', 'What you entered will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await clearDraft(qr);
          nav.back();
        },
      },
    ]);
  };

  return (
    <Screen
      header={<Header left={<IconButton name="x" label="Close" onPress={leave} />} />}
      top={0}
      gap={20}
      footer={<View style={{ flex: 1 }}><Button label={submitting ? "Submitting..." : "Submit for review"} disabled={submitting} onPress={submit} /></View>}
    >
      <View style={{ gap: 6 }}>
        <Txt v="title1">New plant</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="qr" size={18} color={c.ink2} />
          <Txt v="body" color={c.ink2} style={{ fontSize: 15 }}>Tag</Txt>
          <Mono size={15}>{qr}</Mono>
          <View style={{ marginLeft: 'auto' }}>
            <TextLink label="Show QR" onPress={() => setShowQr(true)} />
          </View>
        </View>
        {/* Changing the tag is rare once a record is started, so these stay small. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Txt v="caption" color={c.ink2}>Wrong tag?</Txt>
          <TextLink label="Scan" size={14} onPress={() => nav.replace('scan')} />
          <TextLink label={generating ? 'Making…' : 'New tag'} size={14} onPress={generating ? undefined : generateNewTag} />
          <TextLink label="Gallery" size={14} onPress={pickQrFromGallery} />
        </View>
        {restoredDraft && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, padding: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.accentSoft }}>
            <Icon name="check" size={16} color={c.accent} />
            <Txt v="caption" color={c.accent} style={{ fontFamily: font('text', 700), flex: 1 }}>
              Restored in-progress draft from previous session
            </Txt>
            <IconButton name="x" label="Dismiss" size={14} color={c.accent} onPress={() => setRestoredDraft(false)} />
          </View>
        )}
      </View>

      <Section title="Photos" right={<Txt v="caption" color={tried && problems.photos ? c.warning : c.ink3}>{tried && problems.photos ? 'Add at least one' : `${photos.length} of ${MAX_PHOTOS}`}</Txt>} gap={12}>
        <PhotoStrip
          photos={photos}
          highlightAdd={tried && problems.photos}
          onAddCamera={async () => { const p = await takePhoto(); addPhotoItems(p); }}
          onAddGallery={async () => { const p = await pickFromGallery(); addPhotoItems(p); }}
          onRemove={(i) => setPhotos((list) => list.filter((_, j) => j !== i))}
        />
      </Section>

      <Section title="Details" gap={16}>
        <SpeciesPicker
          value={sp}
          onChange={setSp}
          onPick={pick}
          picked={picked}
          error={tried && problems.species ? 'Species is required before submitting for review' : undefined}
        />
        <Field label="Height (cm)" value={height} onChangeText={(t) => setHeight(t.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" width={140} />
        <View style={{ gap: 6 }}>
          <Area label="Appearance" value={looks} onChangeText={setLooks} placeholder="Leaves, stem, pitchers, flowers, roots" />
          {tried && problems.looks ? <Txt v="caption" color={c.danger}>Describe what the plant looks like.</Txt> : null}
        </View>
        <Area label="Field notes" optional value={notes} onChangeText={setNotes} placeholder="Habitat, nearby trail, anything unusual" rows={2} />
      </Section>

      <GpsRow gps={gps} loading={gpsLoading} error={gpsError} onRefresh={fetchGps} />
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
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="label">{params.name || 'Plant record'}</Txt>
          <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 400) }}>{params.photos || 1} photo · {params.acc != null ? `GPS ±${params.acc} m` : 'location not captured'}</Txt>
        </View>
      </View>
      <View style={{ gap: 10, marginTop: 'auto' }}>
        <Button label="View my records" onPress={() => nav.tab('records')} />
        <Button label="Back to home" kind="secondary" onPress={nav.home} />
      </View>
    </Screen>
  );
}

export function Revisit({ nav, params = {} }) {
  const { db, addRevisit, notify } = useStore();
  const { c } = useTheme();
  const plant = db.plants.find((p) => p.qr_id === params.qr);
  const [photos, setPhotos] = useState([]);
  const [height, setHeight] = useState('');
  const [changes, setChanges] = useState('');
  const [gps, setGps] = useState(NO_GPS);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  const fetchGps = async () => {
    setGpsLoading(true);
    setGpsError('');
    const res = await requestHardwareLocation();
    setGps(res.gps);
    setGpsError(res.error || '');
    setGpsLoading(false);
  };

  useEffect(() => {
    fetchGps();
  }, []);

  if (!plant) {
    return (
      <Screen header={<Header left={<IconButton name="x" label="Close" onPress={nav.back} />} />}>
        <Empty icon="qr">This tag is not on a plant yet.</Empty>
      </Screen>
    );
  }
  const last = db.observations.filter((o) => o.specimen_id === plant.id).sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
  const ok = photos.length > 0 || changes.trim() || height;

  const addPhotoItems = (items) => {
    if (!items || !items.length) return;
    setPhotos((prev) => {
      const combined = [...prev, ...items];
      return combined.slice(0, MAX_PHOTOS);
    });
  };

  const submit = async () => {
    const obsId = await addRevisit({ specimen_id: plant.id, height_cm: height || last?.height_cm, morphology: changes.trim() || last?.morphology, notes: '', photos, gps_accuracy_m: hasFix(gps) ? gps.acc : null });
    if (!obsId) return; // addRevisit already showed why; keep what was entered
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
        <PhotoStrip
          photos={photos}
          onAddCamera={async () => { const p = await takePhoto(); addPhotoItems(p); }}
          onAddGallery={async () => { const p = await pickFromGallery(); addPhotoItems(p); }}
          onRemove={(i) => setPhotos((l) => l.filter((_, j) => j !== i))}
        />
      </Section>
      <Section title="What has changed" gap={16}>
        <Field label="Height (cm)" value={height} onChangeText={(t) => setHeight(t.replace(/[^\d.]/g, ''))} placeholder={last?.height_cm ? String(last.height_cm) : ''} keyboardType="decimal-pad" width={140} hint="Leave empty if it has not changed" />
        <Area label="Changes" value={changes} onChangeText={setChanges} placeholder="New pitchers, flowering, damage…" />
      </Section>
      <GpsRow gps={gps} loading={gpsLoading} error={gpsError} title="Same place as before" onRefresh={fetchGps} />
    </Screen>
  );
}
