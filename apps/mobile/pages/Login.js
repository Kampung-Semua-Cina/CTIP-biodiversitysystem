// apps/mobile/pages/Login.js
// Staff sign in through the API (POST /v1/auth/sign-in, CTIP-114).
import React, { useState } from 'react';
import { View } from 'react-native';

import { useStore } from '../../shared/store.js';
import { getStaffPageContent } from '../../shared/publicContent.js';
import { PARK } from '../../shared/site.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, Field, Button, Txt } from '../components/Bits.js';
import { LogoMark } from '../components/Chrome.js';

export default function SignIn({ nav }) {
  const { login, signIn } = useStore();
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const staff = getStaffPageContent(PARK);

  const submit = async () => {
    const res = await login(email, password);
    if (!res.ok) return setError(res.message);
    signIn(res.id); // the app then opens this person's first tab
  };

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
        <Button label="Sign in" disabled={!email || !password} onPress={submit} />
      </View>
      <Txt v="small" color={c.ink2} style={{ fontSize: 14 }}>{staff.description.split('. ').pop()} {staff.visitorHint}</Txt>
    </Screen>
  );
}
