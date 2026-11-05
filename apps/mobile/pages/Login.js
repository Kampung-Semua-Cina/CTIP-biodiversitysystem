// apps/mobile/pages/Login.js
// Staff sign in through the API (POST /v1/auth/sign-in, CTIP-114).
// Two-step sign-in (VA-70): officers and admins then type the 6-digit code from
// their authenticator app. Setting the app up (scanning a QR code) is done on
// the website, because the QR code cannot be scanned by the same phone.
import React, { useState } from 'react';
import { View } from 'react-native';

import { useStore } from '../../shared/store.js';
import { getStaffPageContent } from '../../shared/publicContent.js';
import { PARK } from '../../shared/site.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, Field, Button, Txt } from '../components/Bits.js';
import { LogoMark } from '../components/Chrome.js';

export default function SignIn({ nav }) {
  const { login, signIn, mfaVerify, mfaCancel } = useStore();
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('password'); // password | code
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const staff = getStaffPageContent(PARK);

  const submit = async () => {
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    if (res.mfa === 'setup') {
      await mfaCancel();
      return setError('Officers and admins need two-step sign-in. Set it up first: sign in on the website, scan the QR code with an authenticator app, then sign in here.');
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
    signIn(res.id);
  };

  const back = async () => {
    await mfaCancel();
    setStep('password');
    setCode('');
    setError('');
  };

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
