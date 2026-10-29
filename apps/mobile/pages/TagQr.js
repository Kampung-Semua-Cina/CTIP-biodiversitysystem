// apps/mobile/pages/TagQr.js
// A tag's QR code on the phone (CTIP-27), for when no pre-printed tag is to hand.
// The code holds a link to the plant's page (tagUrl), never the plant's details, so
// scanning it in the app opens the record and a phone camera opens the website.
// "Share or save image" turns the card into a PNG for printing.
import React, { useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { tagUrl } from '../../shared/selectors.js';
import { SITE } from '../../shared/site.js';
import { palettes } from '../../shared/tokens.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, Mono, Txt, Button, Notice, Empty } from '../components/Bits.js';

// A QR code must stay dark on light to scan reliably, so the card always uses the
// light theme's colours, even in dark mode.
const PRINT = { paper: palettes.light.surface, ink: palettes.light.ink };

export default function TagQr({ nav, params = {} }) {
  const { c } = useTheme();
  const card = useRef(null);
  const [sharing, setSharing] = useState(false);
  const qr = params.qr;

  const back = <Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />;
  if (!qr) {
    return <Screen header={back}><Empty icon="qr">No tag selected.</Empty></Screen>;
  }

  const share = async () => {
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
        return;
      }
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `QR tag ${qr}` });
    } catch (err) {
      Alert.alert('Could not share the QR code', err?.message || 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen header={back} top={0} gap={20}>
      <TitleBlock title="QR tag" sub={qr} />
      {/* collapsable={false} keeps this View on Android, so captureRef can find it. */}
      <View ref={card} collapsable={false}
        style={{ alignSelf: 'center', alignItems: 'center', gap: 12, padding: 20, borderRadius: 16, backgroundColor: PRINT.paper }}>
        <QRCode value={tagUrl(qr)} size={240} ecl="M" quietZone={16} color={PRINT.ink} backgroundColor={PRINT.paper} />
        <Mono size={22} color={PRINT.ink}>{qr}</Mono>
        <Txt v="caption" color={PRINT.ink}>{SITE}</Txt>
      </View>
      <Button label={sharing ? 'Preparing image…' : 'Share or save image'} icon="share" disabled={sharing} onPress={share} />
      <Notice tone="info" title="Print it and fix it to the plant"
        body="Put the printed code in a plastic cover. Scanning it opens this record in the app, and the public plant page for visitors." />
      <Txt v="caption" color={c.ink3} style={{ textAlign: 'center' }}>{tagUrl(qr)}</Txt>
    </Screen>
  );
}
