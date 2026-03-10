import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/utils/colors';
import { useAuth } from '../../src/contexts/AuthContext';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Logga ut', 'Vill du logga ut?', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Logga ut',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={Colors.textMuted} />
          </View>
          <Text style={styles.orgName}>{user?.organization_name || 'Min organisation'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.phone ? <Text style={styles.phone}>{user.phone}</Text> : null}

          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, user?.subscription_active ? styles.badgeActive : styles.badgeInactive]}>
              <Ionicons
                name={user?.subscription_active ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={user?.subscription_active ? Colors.primary : Colors.destructive}
              />
              <Text style={[styles.statusText, { color: user?.subscription_active ? Colors.primary : Colors.destructive }]}>
                {user?.subscription_active ? 'Aktivt abonnemang' : 'Inaktivt abonnemang'}
              </Text>
            </View>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Kontoinformation</Text>
          {[
            { icon: 'business-outline' as const, label: 'Organisation', value: user?.organization_name },
            { icon: 'mail-outline' as const, label: 'E-post', value: user?.email },
            { icon: 'call-outline' as const, label: 'Telefon', value: user?.phone || '-' },
            { icon: 'person-outline' as const, label: 'Namn', value: user?.name || '-' },
            { icon: 'shield-checkmark-outline' as const, label: 'E-post verifierad', value: user?.email_verified ? 'Ja' : 'Nej' },
          ].map((item, idx) => (
            <View key={idx} style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <Ionicons name={item.icon} size={18} color={Colors.textMuted} />
                <Text style={styles.infoLabel}>{item.label}</Text>
              </View>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <TouchableOpacity testID="logout-btn" style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={Colors.destructive} />
          <Text style={styles.logoutText}>Logga ut</Text>
        </TouchableOpacity>

        <Text style={styles.version}>QR-Kassan v2.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  orgName: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  email: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  phone: { fontSize: 14, color: Colors.textMuted, marginTop: 2 },
  statusRow: { marginTop: 16 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, gap: 6,
  },
  badgeActive: { backgroundColor: 'rgba(34,197,94,0.1)' },
  badgeInactive: { backgroundColor: 'rgba(239,68,68,0.1)' },
  statusText: { fontSize: 13, fontWeight: '500' },
  infoSection: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: { fontSize: 14, color: Colors.textSecondary },
  infoValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)', height: 52, borderRadius: 12,
    marginTop: 32, gap: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  logoutText: { color: Colors.destructive, fontSize: 16, fontWeight: '600' },
  version: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, marginTop: 24 },
});
