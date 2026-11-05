// apps/mobile/pages/Login.js
// Staff sign in through the API (POST /v1/auth/sign-in, CTIP-114).
// Two-step sign-in (VA-70): every staff member then types the 6-digit code from
// their authenticator app. The first time, the app is set up here: the phone
// cannot scan its own screen, so it opens the authenticator app with the
// set-up link, or the person copies the set-up key into it by hand.
import React, { useState } from 'react';
import { View, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useStore } from '../../shared/store.js';
import { getStaffPageContent } from '../../shared/publicContent.js';
import { PARK } from '../../shared/site.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, Field, Button, Txt } from '../components/Bits.js';
import { LogoMark } from '../components/Chrome.js';

export default function SignIn({ nav }) {
  const { login, signIn, mfaEnroll, mfaVerify, mfaCancel, notify } = useStore();
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('password'); // password | code | setup
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null); // { secret, uri } while setting up
  const [busy, setBusy] = useState(false);
  const staff = getStaffPageContent(PARK);

  const submit = async () => {
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    if (res.mfa === 'setup') {
      setBusy(true);
      const en = await mfaEnroll();
      setBusy(false);
      if (!en.ok) {
        await mfaCancel();
        return setError(en.message);
      }
      setSetup({ secret: en.secret, uri: en.uri });
      setCode('');
      return setStep('setup');
    }
    if (res.mfa === 'verify') {
      setCode('');
      return setStep('code');
    }
    signIn(res.id); // the app then opens this person's first tab
  };

  const submitCode = async () => {
    setBusy(true);
    const res = await mfaVerify(code);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    if (step === 'setup') notify('Two-step sign-in is set up');
    setSetup(null);
    signIn(res.id);
  };

  const openAuthenticator = async () => {
    try {
      await Linking.openURL(setup.uri);
    } catch {
      setError('No authenticator app found. Install one (for example Google Authenticator), or copy the set-up key into it.');
    }
  };

  const copyKey = async () => {
    await Clipboard.setStringAsync(setup.secret);
    notify('Set-up key copied');
  };

  const back = async () => {
    await mfaCancel();
    setStep('password');
    setCode('');
    setSetup(null);
    setError('');
  };

  if (step === 'setup' && setup) {
    return (
      <Screen header={<Header left={<IconButton name="x" label="Back to sign in" onPress={back} />} />} top={0} gap={18}>
        <TitleBlock title="Set up two-step sign-in" />
        <Txt v="body" color={c.ink2}>Every staff account needs a 6-digit code as well as its password. Install an authenticator app on this phone (for example Google Authenticator or Microsoft Authenticator), then add Daun Sense to it.</Txt>
        <Button label="Open authenticator app" kind="secondary" onPress={openAuthenticator} />
        <Txt v="small" color={c.ink2} style={{ fontSize: 14 }}>Or add it by hand with this set-up key:</Txt>
        <Txt v="mono" selectable style={{ fontSize: 16, lineHeight: 22 }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</Txt>
        <Button label="Copy set-up key" kind="quiet" onPress={copyKey} />
        <Field label="6-digit code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          placeholder="123456" keyboardType="number-pad" error={error || undefined} />
        <View style={{ paddingTop: 4 }}>
          <Button label={busy ? 'Checking...' : 'Finish set-up'} disabled={busy || code.length !== 6} onPress={submitCode} />
        </View>
      </Screen>
    );
  }

  if (step === 'code') {
    return (
      <Screen header={<Header left={<IconButton name="x" label="Back to sign in" onPress={back} />} />} top={0} gap={18}>
        <TitleBlock title="Enter your code" />
        <Txt v="body" color={c.ink2}>Open your authenticator app and type the 6-digit code for Daun Sense.</Txt>
        <Field label="6-digit code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          placeholder="123456" keyboardType="number-pad" error={error || undefined} />
        <View style={{ paddingTop: 4 }}>
          <Button label={busy ? 'Checking...' : 'Verify'} disabled={busy || code.length !== 6} onPress={submitCode} />
        </View>
        <Txt v="small" color={c.ink2} style={{ fontSize: 14 }}>Lost your phone? Ask an admin to reset your two-step sign-in.</Txt>
      </Screen>
    );
  }

  return (
    <Screen header={<Header left={<IconButton name="x" label="Close" onPress={nav.back} />} />} top={0} gap={18}>
      <View style={{ alignItems: 'flex-start', paddingTop: 8 }}>
        <LogoMark size={48} />
      </View>
      <TitleBlock title="Staff sign in" />
      <Txt v="body" color={c.ink2}>For Sarawak Forestry Corporation botanists, conservation officers and admins.</Txt>
      <Field label="Email" value={email} onChangeText={(v) => { setEmail(v); setError(''); }} placeholder="name@sfc.my" keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={(v) => { setPassword(v); setError(''); }} secure={!show}
        rightIcon={show ? 'eyeOff' : 'eye'} onRightPress={() => setShow(!show)} error={error || undefined} />
      <View style={{ paddingTop: 4 }}>
        <Button label={busy ? 'Signing in...' : 'Sign in'} disabled={busy || !email || !password} onPress={submit} />
      </View>
      <Txt v="small" color={c.ink2} style={{ fontSize: 14 }}>{staff.description.split('. ').pop()} {staff.visitorHint}</Txt>
    </Screen>
  );
}
