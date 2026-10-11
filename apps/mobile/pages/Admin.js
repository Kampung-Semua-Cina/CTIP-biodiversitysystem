// apps/mobile/pages/Admin.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView } from 'react-native';
import { useStore } from '../../shared/store.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { DEFAULT_PW } from '../../shared/data.js';
import { fmtDate, fmtDateTime } from '../../shared/utils.js';
import { Chip } from '../components/Bits.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export function MobileUsers() {
  const { db, me, addUser, updateUser, notify } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState('botanist');

  const add = () => {
    if (!name.trim() || !email.trim()) {
      return notify('Please enter both name and email');
    }
    const success = addUser({ full_name: name.trim(), email: email.trim(), role: newRole });
    if (!success) return notify('This email already has an account');
    setName('');
    setEmail('');
    notify('Staff account created');
  };

  return (
    <View>
      <View style={commonStyles.card}>
        <Text style={commonStyles.heading}>Users & Access</Text>
        <Text style={commonStyles.mute}>
          Register botanists and conservation officers. Accounts are created by an administrator.
        </Text>

        {/* Add Account Form */}
        <View style={styles.addForm}>
          <Text style={commonStyles.subHeading}>＋ Add botanist or officer</Text>

          <Text style={commonStyles.label}>Full Name</Text>
          <TextInput
            style={commonStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Dayang Norsyafiqah"
            placeholderTextColor="#688065"
          />

          <Text style={commonStyles.label}>Email Address</Text>
          <TextInput
            style={commonStyles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="e.g. officer@sfc.my"
            placeholderTextColor="#688065"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={commonStyles.label}>Role Assignment</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleScroll}>
            {Object.entries(ROLE_LABEL).map(([r, text]) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleOption, newRole === r && styles.roleOptionActive]}
                onPress={() => setNewRole(r)}
              >
                <Text style={[styles.roleOptionText, newRole === r && styles.roleOptionTextActive]}>
                  {text}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={[commonStyles.btnPrimary, { marginTop: 12 }]} onPress={add}>
            <Text style={commonStyles.btnPrimaryText}>Add account</Text>
          </TouchableOpacity>

          <Text style={[commonStyles.mute, { marginTop: 8 }]}>
            Default temporary password: <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{DEFAULT_PW}</Text>
          </Text>
        </View>
      </View>

      {/* Existing Users List */}
      <View style={commonStyles.card}>
        <Text style={commonStyles.subHeading}>Registered Staff ({db.profiles.length})</Text>

        <View style={styles.userList}>
          {db.profiles.map((u) => {
            const isSelf = me && u.id === me.id;
            return (
              <View key={u.id} style={styles.userCard}>
                <View style={[commonStyles.row, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.userName}>
                      {u.full_name} {isSelf && <Text style={styles.selfTag}>(you)</Text>}
                    </Text>
                    <Text style={commonStyles.mute}>{u.email}</Text>
                  </View>
                  <Chip value={u.role}>{ROLE_LABEL[u.role] || u.role}</Chip>
                </View>

                {/* Role and Active toggle */}
                <View style={[commonStyles.row, styles.userControls]}>
                  <View style={commonStyles.row}>
                    <Text style={commonStyles.mute}>Active:</Text>
                    <Switch
                      value={u.is_active}
                      disabled={isSelf}
                      onValueChange={() => updateUser(u.id, { is_active: !u.is_active })}
                      trackColor={{ false: '#26422f', true: COLORS.primary }}
                      thumbColor={u.is_active ? '#14301d' : '#889e82'}
                    />
                  </View>

                  <Text style={styles.joinedDate}>Joined {fmtDate(u.created_at)}</Text>
                </View>

                {/* Role Switcher buttons */}
                {!isSelf && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switchRoleRow}>
                    {Object.entries(ROLE_LABEL).map(([r, text]) => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.smallRoleBtn, u.role === r && styles.smallRoleBtnActive]}
                        onPress={() => updateUser(u.id, { role: r })}
                      >
                        <Text style={[styles.smallRoleText, u.role === r && styles.smallRoleTextActive]}>
                          {text}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export function MobileAudit() {
  const { db } = useStore();

  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.heading}>Audit log</Text>
      <Text style={commonStyles.mute}>
        Immutable audit trail of system modifications and review actions ({db.audit.length} entries).
      </Text>

      <View style={styles.auditList}>
        {db.audit.map((a) => {
          const author = db.profiles.find((p) => p.id === a.changed_by);
          return (
            <View key={a.id} style={styles.auditCard}>
              <View style={[commonStyles.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
                <Text style={styles.auditTime}>{fmtDateTime(a.changed_at)}</Text>
                <Chip value={a.action} />
              </View>

              <Text style={styles.auditActor}>
                By: <Text style={{ color: COLORS.text, fontWeight: '700' }}>{author?.full_name || 'System'}</Text> · Table: <Text style={{ color: COLORS.primary }}>{a.table_name}</Text>
              </Text>

              <View style={styles.codeBox}>
                <Text style={styles.codeText}>
                  {a.old_value ? JSON.stringify(a.old_value) + ' → ' : ''}
                  {JSON.stringify(a.new_value)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addForm: {
    backgroundColor: '#0a1a11',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roleScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  roleOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#16301e',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roleOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleOptionText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  roleOptionTextActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },
  userList: {
    gap: 10,
    marginTop: 8,
  },
  userCard: {
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  selfTag: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 12,
  },
  userControls: {
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  joinedDate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  switchRoleRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  smallRoleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: '#132819',
  },
  smallRoleBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(155, 207, 106, 0.2)',
  },
  smallRoleText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  smallRoleTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  auditList: {
    gap: 10,
    marginTop: 12,
  },
  auditCard: {
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  auditTime: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  auditActor: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginVertical: 4,
  },
  codeBox: {
    backgroundColor: '#06110a',
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  codeText: {
    color: '#a8d5ba',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
