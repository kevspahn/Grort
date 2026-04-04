import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, FlatList, TextInput, ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';
import { GrortMascot } from '../../src/components/GrortMascot';

interface HouseholdMember {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'member';
}

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);

  useFocusEffect(useCallback(() => {
    if (user?.householdId) loadMembers();
  }, [user?.householdId]));

  async function loadMembers() {
    if (!user?.householdId) return;
    try {
      const response = await apiClient.get(`/households/${user.householdId}/members`);
      setMembers(response.data);
    } catch {
      // ignore
    }
  }

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  }

  async function handleCreateHousehold() {
    if (!householdName.trim()) {
      Alert.alert('Error', 'Please enter a household name');
      return;
    }
    try {
      await apiClient.post('/households', { name: householdName });
      await refreshUser();
      setHouseholdName('');
      setIsCreatingHousehold(false);
      loadMembers();
      Alert.alert('Success', 'Household created.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to create household');
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !user?.householdId) return;
    try {
      await apiClient.post(`/households/${user.householdId}/invite`, { email: inviteEmail });
      setInviteEmail('');
      loadMembers();
      Alert.alert('Success', 'Member invited');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to invite member');
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!user?.householdId) return;
    Alert.alert('Remove Member', `Remove ${memberName} from household?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await apiClient.delete(`/households/${user.householdId}/members/${memberId}`);
          loadMembers();
        } catch (err: any) {
          Alert.alert('Error', err?.response?.data?.error || 'Failed to remove member');
        }
      }},
    ]);
  }

  return (
    <ScrollView style={styles.container}>
      {/* Account Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.profileHeader}>
            <GrortMascot receiptCount={user?.receiptCount ?? 0} size={80} showTierName />
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Household */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Household</Text>
        {user?.householdId ? (
          <View style={styles.card}>
            <Text style={styles.roleText}>Role: {user.householdRole}</Text>

            {/* Members list */}
            {members.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <View>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberEmail}>{member.email} ({member.role})</Text>
                </View>
                {user.householdRole === 'owner' && member.id !== user.id && (
                  <TouchableOpacity onPress={() => handleRemoveMember(member.id, member.name)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {/* Invite */}
            {user.householdRole === 'owner' && (
              <View style={styles.inviteRow}>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="Email to invite"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.inviteButton} onPress={handleInvite}>
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.noHousehold}>You are not in a household</Text>
            {isCreatingHousehold ? (
              <View style={styles.createForm}>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="Household name"
                  value={householdName}
                  onChangeText={setHouseholdName}
                />
                <View style={styles.createButtons}>
                  <TouchableOpacity style={styles.inviteButton} onPress={handleCreateHousehold}>
                    <Text style={styles.inviteButtonText}>Create</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsCreatingHousehold(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.createButton} onPress={() => setIsCreatingHousehold(true)}>
                <Text style={styles.createButtonText}>Create Household</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  section: { padding: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.text, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  email: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  roleText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600', marginBottom: spacing.sm },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { fontSize: fontSize.md, color: colors.text },
  memberEmail: { fontSize: fontSize.xs, color: colors.textSecondary },
  removeText: { color: colors.error, fontSize: fontSize.sm },
  inviteRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  inviteInput: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm, fontSize: fontSize.sm },
  inviteButton: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 6, justifyContent: 'center' },
  inviteButtonText: { color: colors.textOnPrimary, fontWeight: 'bold', fontSize: fontSize.sm },
  noHousehold: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.md },
  createButton: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 8, alignItems: 'center' },
  createButtonText: { color: colors.textOnPrimary, fontWeight: 'bold' },
  createForm: { gap: spacing.sm },
  createButtons: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  cancelText: { color: colors.textSecondary },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileInfo: { flex: 1 },
  logoutButton: { margin: spacing.md, padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.error, alignItems: 'center' },
  logoutText: { color: colors.error, fontWeight: '600', fontSize: fontSize.md },
});
