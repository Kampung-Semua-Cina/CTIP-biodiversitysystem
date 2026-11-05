// apps/mobile/pages/Scan.js
// Scan a pre-printed QR tag (CTIP-15). Tags are printed in batches beforehand and fixed
// to the plant in the field. What happens next depends on the tag and who is scanning:
//   unused tag + botanist   -> "Start a new plant record?"  -> Add plant
//   tag already on a plant  -> botanist: "Record a revisit" / everyone else: plant page
//   retired or unknown      -> explain, scan again
// A botanist with no tag to hand can make one instead (CTIP-27): "No tag? Make a new
// one" opens Add plant with no tag, which offers "Generate new QR tag".
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

import { useStore } from '../../shared/store.js';
import { plantView } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { Sheet, Button, Txt, Mono, Sci, DotLabel, Thumb, IconButton } from '../components/Bits.js';
import { shortDate } from '../components/format.js';

const CAMERA_TEXT = '#eef4e4';
const CAMERA_MUTED = '#b4c9ab';

// Pull "NIAH-0007" out of whatever the QR holds (a bare ID or a link to the plant page).
export function extractTag(raw) {
  const match = String(raw || '').toUpperCase().match(/NIAH-\d{4}/);
  return match ? match[0] : String(raw || '').trim().toUpperCase();
}

// What a scanned ID refers to. Supabase: GET /tags/{qrId} once the apps use the API.
export function lookupTag(db, id) {
  const cleanId = String(id || '').trim().toUpperCase();
  if (!cleanId || !db) return { kind: 'unknown', id: cleanId };
  const plants = db.plants || [];
  const tags = db.tags || [];
  const plant = plants.find((p) => p && p.qr_id && String(p.qr_id).toUpperCase() === cleanId && !p.is_deleted);
  if (plant) return { kind: 'used', id: cleanId, plant: plantView(db, plant) };
  const tag = tags.find((t) => t && t.qr_id && String(t.qr_id).toUpperCase() === cleanId);
  if (tag?.status === 'unused') return { kind: 'unused', id: cleanId, tag };
  if (tag?.status === 'retired') return { kind: 'retired', id: cleanId, tag };
  return { kind: 'unknown', id: cleanId };
}

export default function Scan({ nav, params = {} }) {
  const { db, role, me } = useStore();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [result, setResult] = useState(params.code ? lookupTag(db, extractTag(params.code), me?.id) : null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  const close = () => (nav.canGoBack ? nav.back() : nav.home());

  const handle = (raw) => {
    if (result) return; // ignore repeat reads while a result is showing
    const r = lookupTag(db, extractTag(raw), me?.id);
    // A visitor who scans a published plant goes straight to its page.
    if (r.kind === 'used' && role !== 'botanist') return nav.replace('tag', { qr: r.id });
    setTyping(false);
    setResult(r);
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        let foundData = null;
        try {
          if (typeof scanFromURLAsync === 'function') {
            const barcodes = await scanFromURLAsync(asset.uri, ['qr']);
            if (barcodes && barcodes.length > 0) foundData = barcodes[0].data;
          }
        } catch (e) {
          console.warn('scanFromURLAsync error in Scan:', e);
        }
        const tag = extractTag(foundData || asset.fileName || asset.uri);
        if (tag && /NIAH-\d{4}/.test(tag)) {
          handle(tag);
        } else {
          Alert.alert('No QR detected', 'Could not detect a valid plant QR tag in this photo.');
        }
      }
    } catch (err) {
      console.warn('Gallery pick error in Scan:', err);
    }
  };

  const granted = permission?.granted;

  return (
    <View style={{ flex: 1, backgroundColor: '#06110b' }}>
      {granted && !result ? (
        <CameraView
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handle(data)}
        />
      ) : null}

      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ height: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
          <IconButton name="x" label="Close scanner" color={CAMERA_TEXT} onPress={close} />
          {granted && !result ? <IconButton name="torch" label={torch ? 'Turn off torch' : 'Turn on torch'} color={torch ? '#e8bd5c' : CAMERA_TEXT} size={22} onPress={() => setTorch(!torch)} /> : null}
        </View>

        {result ? (
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Result result={result} role={role} nav={nav} onAgain={() => setResult(null)} />
          </View>
        ) : typing ? (
          <ManualEntry value={typed} onChange={setTyped} onSubmit={() => handle(typed)} onCancel={() => setTyping(false)} />
        ) : (
          <>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
              {granted ? <Viewfinder /> : <PermissionAsk onAsk={requestPermission} canAsk={permission?.canAskAgain !== false} />}
              <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 32 }}>
                <Text style={{ fontFamily: font('display', 700), fontSize: 22, color: CAMERA_TEXT, textAlign: 'center' }}>Point at the plant's tag</Text>
                <Text style={{ fontFamily: font('text', 400), fontSize: 15, lineHeight: 22, color: CAMERA_MUTED, textAlign: 'center' }}>
                  Hold steady about a hand's length away. It scans by itself.
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'center', paddingBottom: 20, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable accessibilityRole="button" onPress={pickFromGallery}
                  style={{ height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(238, 244, 228, 0.12)' }}>
                  <Icon name="plus" size={18} color={CAMERA_TEXT} />
                  <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: CAMERA_TEXT }}>From gallery</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setTyping(true)}
                  style={{ height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(238, 244, 228, 0.12)' }}>
                  <Icon name="keyboard" size={18} color={CAMERA_TEXT} />
                  <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: CAMERA_TEXT }}>Type ID</Text>
                </Pressable>
              </View>
              {role === 'botanist' ? (
                <Pressable accessibilityRole="button" onPress={() => nav.replace('add', { make: true })} hitSlop={8}
                  style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
                  <Icon name="qr" size={18} color={CAMERA_TEXT} />
                  <Text style={{ fontFamily: font('text', 700), fontSize: 14, color: CAMERA_TEXT, textDecorationLine: 'underline' }}>No tag? Make a new one</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function Viewfinder() {
  const corner = { position: 'absolute', width: 44, height: 44, borderColor: '#9bcf6a' };
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 250, height: 250 }}>
      <View style={[corner, { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 20 }]} />
      <View style={[corner, { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 20 }]} />
      <View style={[corner, { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 20 }]} />
      <View style={[corner, { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 20 }]} />
    </View>
  );
}

function PermissionAsk({ onAsk, canAsk }) {
  return (
    <View style={{ width: 280, alignItems: 'center', gap: 14 }}>
      <Icon name="camera" size={40} color={CAMERA_MUTED} />
      <Text style={{ fontFamily: font('text', 400), fontSize: 15, lineHeight: 22, color: CAMERA_MUTED, textAlign: 'center' }}>
        {canAsk ? 'The camera is needed to read plant tags.' : 'Camera access is off. Turn it on in the phone settings, or type the tag ID.'}
      </Text>
      {canAsk ? <View style={{ width: '100%' }}><Button label="Allow camera" onPress={onAsk} /></View> : null}
    </View>
  );
}

function ManualEntry({ value, onChange, onSubmit, onCancel }) {
  const { c } = useTheme();
  return (
    // App.js lifts the screen above the keyboard, so the sheet stays visible while typing.
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Sheet>
        <Txt v="title2">Type the tag ID</Txt>
        <TextInput
          autoFocus
          accessibilityLabel="Tag ID"
          value={value}
          onChangeText={(t) => onChange(t.toUpperCase())}
          placeholder="NIAH-0001"
          placeholderTextColor={c.ink3}
          autoCapitalize="characters"
          onSubmitEditing={onSubmit}
          style={{ height: 52, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.bg, fontFamily: font('mono', 500), fontSize: 18, color: c.ink }}
        />
        <View style={{ gap: 4 }}>
          <Button label="Look up tag" disabled={!/NIAH-\d{4}/.test(value)} onPress={onSubmit} />
          <Button label="Back to camera" kind="text" height={48} size={15} onPress={onCancel} />
        </View>
      </Sheet>
    </View>
  );
}

function Result({ result, role, nav, onAgain }) {
  const { c } = useTheme();
  const { db } = useStore();

  if (result.kind === 'unfinished') {
    return (
      <Sheet>
        <Mono size={20}>{result.id}</Mono>
        <View style={{ gap: 6 }}>
          <Txt v="title2" style={{ fontSize: 26, lineHeight: 32 }}>Finish this plant record?</Txt>
          <Txt v="body" color={c.ink2}>You saved this plant, but its record did not reach the server. Send it again to put it in the review queue.</Txt>
        </View>
        <View style={{ gap: 4 }}>
          <Button label="Finish and send" onPress={() => nav.replace('add', { qr: result.id })} />
          <Button label="Scan a different tag" kind="text" height={48} size={15} onPress={onAgain} />
        </View>
      </Sheet>
    );
  }

  if (result.kind === 'unused') {
    const botanist = role === 'botanist';
    return (
      <Sheet>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.successSoft }}>
            <Icon name="check" size={26} color={c.success} strokeWidth={2} />
          </View>
          <View style={{ gap: 2 }}>
            <Mono size={20}>{result.id}</Mono>
            <DotLabel tone="neutral" label={`Unused tag · batch ${result.tag.batch_label}`} />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Txt v="title2" style={{ fontSize: 26, lineHeight: 32 }}>{botanist ? 'Start a new plant record?' : 'This tag is not on a plant yet'}</Txt>
          <Txt v="body" color={c.ink2}>
            {botanist
              ? "This tag isn't linked to a plant yet. Once you save, it belongs to this plant for good."
              : 'Park botanists have not recorded a plant with this tag yet.'}
          </Txt>
        </View>
        {botanist ? (
          <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.bg }}>
            <Icon name="info" size={20} color={c.ink2} />
            <Txt v="small" style={{ flex: 1, fontFamily: font('text', 400) }}>Check the tag is fixed to the plant and its plastic cover is sealed before you continue.</Txt>
          </View>
        ) : null}
        <View style={{ gap: 4 }}>
          {botanist ? <Button label="Start plant record" onPress={() => nav.replace('add', { qr: result.id })} /> : null}
          <Button label="Scan a different tag" kind={botanist ? 'text' : 'primary'} height={botanist ? 48 : 52} size={botanist ? 15 : 16} onPress={onAgain} />
        </View>
      </Sheet>
    );
  }

  if (result.kind === 'used') {
    const p = result.plant;
    const last = db.observations.filter((o) => o.specimen_id === p.id).map((o) => o.observed_at).sort().pop();
    return (
      <Sheet>
        <View style={{ gap: 6 }}>
          <Mono size={15} color={c.ink2}>{result.id}</Mono>
          <Txt v="title2" style={{ fontSize: 26, lineHeight: 32 }}>This tag is already on a plant</Txt>
        </View>
        <Pressable accessibilityRole="button" onPress={() => nav.replace('tag', { qr: result.id })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: c.bg }}>
          <Thumb uri={p.photos[0]?.url} size={64} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontFamily: font('display', 600), fontSize: 18, color: c.ink }}>{p.name}</Text>
            {p.scientific ? <Sci size={14}>{p.scientific}</Sci> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <DotLabel status={p.status} />
              <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>· last visit {shortDate(last)}</Txt>
            </View>
          </View>
          <Icon name="chevR" size={20} color={c.ink3} />
        </Pressable>
        <View style={{ gap: 4 }}>
          <Button label="Record a revisit" icon="plus" onPress={() => nav.replace('revisit', { qr: result.id })} />
          <Button label="Open plant page" kind="text" height={48} size={15} onPress={() => nav.replace('tag', { qr: result.id })} />
        </View>
        <Txt v="caption" color={c.ink2} style={{ textAlign: 'center', fontFamily: font('text', 600) }}>Each tag holds one plant. To tag a different plant, use an unused tag.</Txt>
      </Sheet>
    );
  }

  return (
    <Sheet>
      <View style={{ gap: 6 }}>
        <Mono size={15} color={c.ink2}>{result.id || 'No tag ID'}</Mono>
        <Txt v="title2" style={{ fontSize: 26, lineHeight: 32 }}>{result.kind === 'retired' ? 'This tag was retired' : "We don't know this tag"}</Txt>
        <Txt v="body" color={c.ink2}>
          {result.kind === 'retired'
            ? 'It was taken out of use. Use a new unused tag for this plant.'
            : 'It is not a Daun Sense tag for Niah National Park. Check the code and try again.'}
        </Txt>
      </View>
      <View style={{ gap: 4 }}>
        <Button label="Scan again" onPress={onAgain} />
        {role === 'botanist' ? <Button label="Make a new tag instead" kind="text" height={48} size={15} onPress={() => nav.replace('add', { make: true })} /> : null}
      </View>
    </Sheet>
  );
}
