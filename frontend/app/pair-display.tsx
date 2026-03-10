import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Alert, Modal, ActivityIndicator, FlatList, SafeAreaView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/utils/colors';
import { api } from '../src/utils/api';
import { useAuth } from '../src/contexts/AuthContext';
import { useRouter } from 'expo-router';

interface PairedDisplay {
  display_id: string;
  device_name: string;
  paired_at: string;
  last_active: string;
}

export default function PairDisplayScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('Kundskärm');
  const [pairing, setPairing] = useState(false);
  const [displays, setDisplays] = useState<PairedDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; count: number }>({ connected: false, count: 0 });

  const loadDisplays = useCallback(async () => {
    try {
      const [displaysRes, statusRes] = await Promise.all([
        api.getSettings().then(() => fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/customer-display/paired-displays`, {
          headers: { 'Authorization': `Bearer ${api.getToken()}` }
        }).then(r => r.json())),
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/customer-display/connection-status`, {
          headers: { 'Authorization': `Bearer ${api.getToken()}` }
        }).then(r => r.json()),
      ]);
      setDisplays(displaysRes.displays || []);
      setConnectionStatus(statusRes);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadDisplays();
  }, []);

  const handlePair = async () => {
    if (code.length !== 4) {
      Alert.alert('Fel', 'Ange en 4-siffrig kod');
      return;
    }
    setPairing(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/customer-display/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.getToken()}`,
        },
        body: JSON.stringify({ code, device_name: deviceName }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Kopplad!', 'Kundskärmen är nu ansluten');
        setCode('');
        loadDisplays();
      } else {
        Alert.alert('Fel', data.message || 'Kunde inte koppla skärm');
      }
    } catch (e: any) {
      Alert.alert('Fel', 'Något gick fel');
    } finally { setPairing(false); }
  };

  const handleUnpair = (display: PairedDisplay) => {
    Alert.alert('Koppla bort', `Vill du koppla bort "${display.device_name}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Koppla bort', style: 'destructive', onPress: async () => {
          try {
            await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/customer-display/paired-displays/${display.display_id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${api.getToken()}` },
            });
            loadDisplays();
          } catch {}
        }
      }
    ]);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('sv-SE') + ' ' +
        new Date(dateStr).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Koppla kundskärm</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Connection Status */}
        <View style={styles.statusCard}>
          <View style={[styles.statusDot, connectionStatus.connected ? styles.statusOnline : styles.statusOffline]} />
          <Text style={styles.statusText}>
            {connectionStatus.connected
              ? `${connectionStatus.count} skärm${connectionStatus.count > 1 ? 'ar' : ''} ansluten`
              : 'Ingen skärm ansluten'}
          </Text>
        </View>

        {/* Pair new display */}
        <View style={styles.pairSection}>
          <Text style={styles.sectionTitle}>Koppla ny skärm</Text>
          <Text style={styles.sectionSubtitle}>
            Öppna kundskärmen på en annan enhet och ange den 4-siffriga koden som visas
          </Text>

          <View style={styles.codeInputRow}>
            <TextInput
              testID="pair-code-input"
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="0000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
            />
            <TouchableOpacity
              testID="pair-submit-btn"
              style={[styles.pairBtn, (code.length !== 4 || pairing) && styles.pairBtnDisabled]}
              onPress={handlePair}
              disabled={code.length !== 4 || pairing}
            >
              {pairing ? <ActivityIndicator color={Colors.white} /> : (
                <>
                  <Ionicons name="link" size={18} color={Colors.white} />
                  <Text style={styles.pairBtnText}>Koppla</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.nameLabel}>Enhetens namn</Text>
            <TextInput
              testID="device-name-input"
              style={styles.nameInput}
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="Kundskärm"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        {/* Paired displays */}
        <View style={styles.displaysSection}>
          <Text style={styles.sectionTitle}>Kopplade skärmar</Text>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
          ) : displays.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="tv-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Inga kopplade skärmar</Text>
            </View>
          ) : (
            <FlatList
              data={displays}
              keyExtractor={(item) => item.display_id}
              renderItem={({ item }) => (
                <View testID={`display-row-${item.display_id}`} style={styles.displayRow}>
                  <View style={styles.displayInfo}>
                    <View style={styles.displayIconWrap}>
                      <Ionicons name="tv-outline" size={20} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.displayName}>{item.device_name}</Text>
                      <Text style={styles.displayDate}>Kopplad {formatDate(item.paired_at)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    testID={`unpair-${item.display_id}`}
                    style={styles.unpairBtn}
                    onPress={() => handleUnpair(item)}
                  >
                    <Ionicons name="unlink-outline" size={18} color={Colors.destructive} />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>

        {/* Help text */}
        <View style={styles.helpSection}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.helpText}>
            Öppna kundvisningen genom att navigera till /display på valfri enhet
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, padding: 14, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOnline: { backgroundColor: Colors.primary },
  statusOffline: { backgroundColor: Colors.textMuted },
  statusText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  pairSection: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 16 },
  codeInputRow: { flexDirection: 'row', gap: 12 },
  codeInput: {
    flex: 1, height: 56, backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 2, borderColor: Colors.border, paddingHorizontal: 16,
    color: Colors.textPrimary, fontSize: 28, fontWeight: '700', letterSpacing: 12, textAlign: 'center',
  },
  pairBtn: {
    flexDirection: 'row', backgroundColor: Colors.primary, paddingHorizontal: 24,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  pairBtnDisabled: { opacity: 0.5 },
  pairBtnText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  nameRow: { marginTop: 12 },
  nameLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 4 },
  nameInput: {
    height: 44, backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
    color: Colors.textPrimary, fontSize: 15,
  },
  displaysSection: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: Colors.textMuted, fontSize: 14, marginTop: 8 },
  displayRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  displayInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  displayIconWrap: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  displayName: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  displayDate: { fontSize: 12, color: Colors.textMuted },
  unpairBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  helpSection: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8,
  },
  helpText: { color: Colors.textMuted, fontSize: 12, flex: 1 },
});
