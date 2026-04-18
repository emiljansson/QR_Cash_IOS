import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Alert, ActivityIndicator, SafeAreaView,
  Platform, ScrollView, useWindowDimensions,
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

// Web-compatible alert helpers
const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const confirmAction = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'OK', onPress: onConfirm },
    ]);
  }
};

// Custom numeric keypad component
function NumericKeypad({ onPress, onDelete }: { onPress: (num: string) => void; onDelete: () => void }) {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  return (
    <View style={keypadStyles.container}>
      {keys.map((row, rowIndex) => (
        <View key={rowIndex} style={keypadStyles.row}>
          {row.map((key, keyIndex) => {
            if (key === '') {
              return <View key={keyIndex} style={keypadStyles.emptyKey} />;
            }
            if (key === 'del') {
              return (
                <TouchableOpacity
                  key={keyIndex}
                  style={keypadStyles.key}
                  onPress={onDelete}
                  activeOpacity={0.7}
                >
                  <Ionicons name="backspace-outline" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                key={keyIndex}
                style={keypadStyles.key}
                onPress={() => onPress(key)}
                activeOpacity={0.7}
              >
                <Text style={keypadStyles.keyText}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const keypadStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  key: {
    width: 72,
    height: 52,
    backgroundColor: Colors.background,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyKey: {
    width: 72,
    height: 52,
    marginVertical: 4,
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
});

export default function PairDisplayScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('Kundskärm');
  const [pairing, setPairing] = useState(false);
  const [displays, setDisplays] = useState<PairedDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; count: number }>({ connected: false, count: 0 });

  // Detect if tablet/iPad in landscape
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;

  const loadDisplays = useCallback(async () => {
    // Feature disabled - backend removed
    // TODO: Migrate to CommHub when supported
    setLoading(false);
    setDisplays([]);
    setConnectionStatus({ connected: false, count: 0 });
  }, []);

  useEffect(() => {
    loadDisplays();
  }, []);

  const handlePair = async () => {
    // Feature disabled - backend removed
    showAlert('Inte tillgänglig', 'Denna funktion är tillfälligt avstängd. Kontakta support.');
  };

  const handleUnpair = (display: PairedDisplay) => {
    // Feature disabled - backend removed
    showAlert('Inte tillgänglig', 'Denna funktion är tillfälligt avstängd.');
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('sv-SE') + ' ' +
        new Date(dateStr).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  const handleKeyPress = (num: string) => {
    if (code.length < 4) {
      setCode(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setCode(prev => prev.slice(0, -1));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header - fixed at top */}
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Koppla kundskärm</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Main content - scrollable */}
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
            Ladda ner appen QR-Display och koppla ihop med koden som visas.
          </Text>

          {/* Code display boxes */}
          <View style={styles.codeDisplayRow}>
            <View style={styles.codeBoxes}>
              {[0, 1, 2, 3].map((index) => (
                <View key={index} style={[styles.codeBox, code.length === index && styles.codeBoxActive]}>
                  <Text style={styles.codeBoxText}>{code[index] || ''}</Text>
                </View>
              ))}
            </View>
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
            displays.map((item) => (
              <View key={item.display_id} testID={`display-row-${item.display_id}`} style={styles.displayRow}>
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
            ))
          )}
        </View>
      </ScrollView>

      {/* Custom numeric keypad - always docked at bottom */}
      <NumericKeypad onPress={handleKeyPress} onDelete={handleDelete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1, paddingBottom: 20 },
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
  codeDisplayRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  codeBoxes: { flexDirection: 'row', gap: 8, flex: 1 },
  codeBox: {
    flex: 1,
    height: 56,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 70,
  },
  codeBoxActive: {
    borderColor: Colors.primary,
  },
  codeBoxText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  pairBtn: {
    flexDirection: 'row', backgroundColor: Colors.primary, paddingHorizontal: 24,
    height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  pairBtnDisabled: { opacity: 0.5 },
  pairBtnText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  nameRow: { marginTop: 12 },
  nameLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 4 },
  nameInput: {
    height: 44, backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
    color: Colors.textPrimary, fontSize: 15, letterSpacing: 0,
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
});
