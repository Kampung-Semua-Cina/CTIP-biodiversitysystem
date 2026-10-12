// apps/mobile/pages/Login.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../shared/store.js';
import { COLORS, commonStyles } from '../components/Theme.js';

function PasswordInput({ value, onChangeText, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.pwWrap}>
      <TextInput
        style={[commonStyles.input, styles.pwInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#688065"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.eyeBtn}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={8}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export default function MobileLogin({ onNavigate }) {
  const { login, signIn, changePassword, notify } = useStore();
  const [mode, setMode] = useState('signin'); // signin | change | first
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pending, setPending] = useState(null);

  const switchTo = (next) => {
    setMode(next);
    setPw('');
    setNewPw('');
  };

  const submit = () => {
    if (!email.trim() || !pw.trim()) {
      return notify('Please enter both email and password');
    }
    const res = login(email, pw);
    if (!res.ok) return notify(res.message);
    if (res.first) {
      setPending(res.id);
      return setMode('first');
    }
    signIn(res.id);
    notify('Signed in successfully');
    onNavigate?.('dashboard');
  };

  const change = () => {
    if (!email.trim()) return notify('Please enter your email');
    if (newPw.length < 8) return notify('Use at least 8 characters for the new password');
    const res = changePassword(email, newPw);
    if (!res.ok) return notify(res.message);
    notify('Password changed successfully');
    if (mode === 'first') {
      signIn(pending);
      return onNavigate?.('dashboard');
    }
    switchTo('signin');
  };

  const skip = () => {
    signIn(pending);
    onNavigate?.('dashboard');
  };

  return (
    <View style={commonStyles.card}>
      {mode === 'signin' && (
        <View>
          <Text style={commonStyles.heading}>Staff login</Text>
          <Text style={commonStyles.mute}>
            For botanists, conservation officers and admins. Sign in with your registered SFC email.
          </Text>

          <Text style={commonStyles.label}>Email</Text>
          <TextInput
            style={commonStyles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@sfc.my"
            placeholderTextColor="#688065"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={commonStyles.label}>Password</Text>
          <PasswordInput value={pw} onChangeText={setPw} placeholder="Enter password" />

          <View style={[commonStyles.rowWrap, { marginTop: 16 }]}>
            <TouchableOpacity style={commonStyles.btnPrimary} onPress={submit}>
              <Text style={commonStyles.btnPrimaryText}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={commonStyles.btnGhost} onPress={() => switchTo('change')}>
              <Text style={commonStyles.btnGhostText}>Change password</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {mode === 'change' && (
        <View>
          <Text style={commonStyles.heading}>Change password</Text>
          <Text style={commonStyles.mute}>Enter your email and choose a new password.</Text>

          <Text style={commonStyles.label}>Email</Text>
          <TextInput
            style={commonStyles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@sfc.my"
            placeholderTextColor="#688065"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={commonStyles.label}>New password (min 8 characters)</Text>
          <PasswordInput value={newPw} onChangeText={setNewPw} placeholder="New password" />

          <View style={[commonStyles.rowWrap, { marginTop: 16 }]}>
            <TouchableOpacity style={commonStyles.btnPrimary} onPress={change}>
              <Text style={commonStyles.btnPrimaryText}>Save new password</Text>
            </TouchableOpacity>
            <TouchableOpacity style={commonStyles.btnGhost} onPress={() => switchTo('signin')}>
              <Text style={commonStyles.btnGhostText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {mode === 'first' && (
        <View>
          <Text style={commonStyles.heading}>Set a new password</Text>
          <Text style={commonStyles.mute}>
            You signed in with the default password. Choose a new one now, or keep it for later.
          </Text>

          <Text style={commonStyles.label}>New password</Text>
          <PasswordInput value={newPw} onChangeText={setNewPw} placeholder="New password" />

          <View style={[commonStyles.rowWrap, { marginTop: 16 }]}>
            <TouchableOpacity style={commonStyles.btnPrimary} onPress={change}>
              <Text style={commonStyles.btnPrimaryText}>Change password</Text>
            </TouchableOpacity>
            <TouchableOpacity style={commonStyles.btnGhost} onPress={skip}>
              <Text style={commonStyles.btnGhostText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pwWrap: {
    justifyContent: 'center',
  },
  pwInput: {
    paddingRight: 44,
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    padding: 4,
  },
});
