import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  Dimensions, ScrollView, TouchableOpacity, Platform, useWindowDimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

// Get backend URL - same logic as api.ts
const getBackendUrl = () => {
  if (Platform.OS !== 'web') {
    return 'https://qrcashios-production.up.railway.app';
  }
  return process.env.EXPO_PUBLIC_BACKEND_URL || 'https://qrcashios-production.up.railway.app';
};
const BACKEND_URL = getBackendUrl();

// Storage keys for persistent pairing
const STORAGE_KEYS = {
  USER_ID: 'display_user_id',
  DISPLAY_ID: 'display_id',
  STORE_NAME: 'display_store_name',
};

// Helper functions for localStorage (web only)
const storage = {
  get: (key: string): string | null => {
    if (Platform.OS !== 'web') return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  remove: (key: string): void => {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.removeItem(key);
    } catch {}
  },
  clearPairing: (): void => {
    storage.remove(STORAGE_KEYS.USER_ID);
    storage.remove(STORAGE_KEYS.DISPLAY_ID);
    storage.remove(STORAGE_KEYS.STORE_NAME);
  },
};

const C = {
  bg: '#09090b',
  surface: '#18181b',
  surfaceHi: '#27272a',
  border: '#3f3f46',
  text: '#f4f4f5',
  textSec: '#a1a1aa',
  textMut: '#71717a',
  green: '#22c55e',
  greenDark: '#16a34a',
  red: '#ef4444',
  white: '#ffffff',
  swish: '#D41420',
};

type DisplayState = 'loading' | 'generating' | 'waiting_pair' | 'paired_idle' | 'paired_waiting' | 'paired_paid' | 'error' | 'unpaired';

export default function CustomerDisplayScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  
  const [state, setState] = useState<DisplayState>('loading');
  const [pairingCode, setPairingCode] = useState('');
  const [displayId, setDisplayId] = useState('');
  const [userId, setUserId] = useState('');
  const [displayData, setDisplayData] = useState<any>(null);
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [paidAnimation, setPaidAnimation] = useState(false);

  // Check for saved pairing on startup
  const checkSavedPairing = useCallback(async () => {
    const savedUserId = storage.get(STORAGE_KEYS.USER_ID);
    const savedDisplayId = storage.get(STORAGE_KEYS.DISPLAY_ID);
    const savedStoreName = storage.get(STORAGE_KEYS.STORE_NAME);
    
    if (savedUserId && savedDisplayId) {
      // Verify pairing is still valid
      try {
        const res = await fetch(`${BACKEND_URL}/api/customer-display/pairing-status?display_code=${savedDisplayId}`);
        const data = await res.json();
        
        if (data.paired) {
          // Pairing still valid - restore state
          const restoredUserId = data.user_id || savedUserId;
          setUserId(restoredUserId);
          setDisplayId(savedDisplayId);
          setStoreName(data.store_name || savedStoreName || '');
          
          // Update stored user_id if different
          if (data.user_id && data.user_id !== savedUserId) {
            storage.set(STORAGE_KEYS.USER_ID, data.user_id);
          }
          
          setState('paired_idle');
          return true;
        }
      } catch {}
      
      // Pairing no longer valid - clear storage
      storage.clearPairing();
    }
    
    return false;
  }, []);

  // Step 1: Generate pairing code
  const generateCode = useCallback(async () => {
    setState('generating');
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/customer-display/generate-code`, { method: 'POST' });
      const data = await res.json();
      setPairingCode(data.code);
      setDisplayId(data.display_id);
      setState('waiting_pair');
    } catch (e) {
      setError('Kunde inte ansluta till servern');
      setState('error');
    }
  }, []);

  // Save pairing to localStorage when paired
  const savePairing = useCallback((newUserId: string, newDisplayId: string, newStoreName: string) => {
    storage.set(STORAGE_KEYS.USER_ID, newUserId);
    storage.set(STORAGE_KEYS.DISPLAY_ID, newDisplayId);
    storage.set(STORAGE_KEYS.STORE_NAME, newStoreName);
  }, []);

  // Clear pairing and generate new code
  const handleUnpair = useCallback(() => {
    storage.clearPairing();
    setUserId('');
    setDisplayId('');
    setStoreName('');
    generateCode();
  }, [generateCode]);

  // Initial load - check for saved pairing first
  useEffect(() => {
    const init = async () => {
      const hasSavedPairing = await checkSavedPairing();
      if (!hasSavedPairing) {
        generateCode();
      }
    };
    init();
    
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (dataPollRef.current) clearInterval(dataPollRef.current);
    };
  }, []);

  // Step 2: Poll for pairing
  useEffect(() => {
    if (state !== 'waiting_pair' || !pairingCode) return;

    const checkPairing = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/customer-display/check-code/${pairingCode}`);
        const data = await res.json();
        if (data.paired && data.user_id) {
          const newUserId = data.user_id;
          const newDisplayId = data.display_id || displayId;
          
          setUserId(newUserId);
          if (data.display_id) setDisplayId(newDisplayId);
          
          // Save pairing to localStorage for persistence
          savePairing(newUserId, newDisplayId, '');
          
          setState('paired_idle');
        } else if (!data.valid) {
          // Code expired
          generateCode();
        }
      } catch {}
    };

    pollRef.current = setInterval(checkPairing, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, pairingCode, displayId, savePairing, generateCode]);

  // Step 3: Poll display data once paired
  useEffect(() => {
    if (!userId || (state !== 'paired_idle' && state !== 'paired_waiting' && state !== 'paired_paid')) return;

    const fetchDisplay = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/customer-display?user_id=${userId}`);
        const data = await res.json();

        if (data.status === 'unpaired') {
          // Clear localStorage and go to unpaired state
          storage.clearPairing();
          setState('unpaired');
          return;
        }

        setDisplayData(data);
        if (data.store_name) {
          setStoreName(data.store_name);
          // Update stored store name
          storage.set(STORAGE_KEYS.STORE_NAME, data.store_name);
        }

        if (data.status === 'paid' && state !== 'paired_paid') {
          setState('paired_paid');
          setPaidAnimation(true);
          setTimeout(() => setPaidAnimation(false), 3000);
        } else if (data.status === 'waiting') {
          setState('paired_waiting');
        } else if (data.status === 'idle') {
          setState('paired_idle');
        }
      } catch {}
    };

    fetchDisplay();
    dataPollRef.current = setInterval(fetchDisplay, 2000);
    return () => { if (dataPollRef.current) clearInterval(dataPollRef.current); };
  }, [userId, state]);

  // SCREEN: Loading saved pairing
  if (state === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={styles.statusText}>Kontrollerar anslutning...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // SCREEN: Generating code
  if (state === 'generating') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={styles.statusText}>Förbereder kundskärm...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // SCREEN: Error
  if (state === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={64} color={C.red} />
          <Text style={styles.errorTitle}>Anslutningsfel</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity testID="retry-btn" style={styles.retryBtn} onPress={generateCode}>
            <Text style={styles.retryBtnText}>Försök igen</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // SCREEN: Unpaired (was paired but now disconnected)
  if (state === 'unpaired') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="unlink-outline" size={64} color={C.textMut} />
          <Text style={styles.unpairedTitle}>Frånkopplad</Text>
          <Text style={styles.unpairedText}>Skärmen har kopplats bort från kassan</Text>
          <TouchableOpacity testID="reconnect-btn" style={styles.retryBtn} onPress={handleUnpair}>
            <Ionicons name="refresh" size={18} color={C.white} />
            <Text style={styles.retryBtnText}>Koppla igen</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // SCREEN: Waiting for pairing
  if (state === 'waiting_pair') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <View style={styles.pairIconContainer}>
            <Ionicons name="tv-outline" size={48} color={C.green} />
          </View>
          <Text style={styles.pairTitle}>Koppla kundskärm</Text>
          <Text style={styles.pairSubtitle}>Ange koden i kassaappen under "Koppla skärm"</Text>

          <View style={styles.codeContainer}>
            {pairingCode.split('').map((digit, idx) => (
              <View key={idx} style={styles.codeDigit}>
                <Text style={styles.codeDigitText}>{digit}</Text>
              </View>
            ))}
          </View>

          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={C.green} />
            <Text style={styles.waitingText}>Väntar på koppling...</Text>
          </View>

          <TouchableOpacity testID="regenerate-code-btn" style={styles.newCodeBtn} onPress={generateCode}>
            <Ionicons name="refresh" size={16} color={C.textSec} />
            <Text style={styles.newCodeBtnText}>Generera ny kod</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // SCREEN: Paired - show display
  const items = displayData?.items || [];
  const total = displayData?.total || 0;
  const qrData = displayData?.qr_data;
  const logoUrl = displayData?.logo_url;
  const isPaid = state === 'paired_paid';
  const isWaiting = state === 'paired_waiting';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.displayHeader}>
        <View style={styles.storeInfo}>
          <Ionicons name="storefront" size={24} color={C.green} />
          <Text style={styles.storeNameText}>{storeName || 'Butik'}</Text>
        </View>
        <View style={styles.connectedBadge}>
          <View style={styles.connectedDot} />
          <Text style={styles.connectedText}>Ansluten</Text>
        </View>
      </View>

      {/* Paid animation */}
      {isPaid && (
        <View style={styles.paidOverlay}>
          <View style={styles.paidCard}>
            <Ionicons name="checkmark-circle" size={96} color={C.green} />
            <Text style={styles.paidTitle}>Tack!</Text>
            <Text style={styles.paidSubtitle}>Betalning mottagen</Text>
            <Text style={styles.paidAmount}>{total.toFixed(0)} kr</Text>
          </View>
        </View>
      )}

      {/* Idle state */}
      {state === 'paired_idle' && (
        <View style={styles.idleContainer}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.centerLogo} resizeMode="contain" />
          ) : (
            <View style={styles.idleIconWrap}>
              <Ionicons name="qr-code" size={64} color={C.green} />
            </View>
          )}
          <Text style={styles.idleTitle}>{storeName || 'Välkommen!'}</Text>
          <Text style={styles.idleSubtitle}>Skanna QR-koden för att betala med Swish</Text>
        </View>
      )}

      {/* Waiting for payment - Responsive layout */}
      {isWaiting && !isPaid && (
        <View style={[styles.waitingContainer, !isLandscape && styles.waitingContainerPortrait]}>
          {isLandscape ? (
            // LANDSCAPE: Side by side - Cart left, QR right
            <>
              <View style={styles.leftSide}>
                <Text style={styles.itemsTitle}>Din beställning</Text>
                <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
                  {items.map((item: any, idx: number) => (
                    <View key={idx} style={styles.displayItem}>
                      <View style={styles.itemLeft}>
                        <View style={styles.itemQtyBadge}>
                          <Text style={styles.itemQtyText}>{item.quantity}x</Text>
                        </View>
                        <Text style={styles.itemName}>{item.name}</Text>
                      </View>
                      <Text style={styles.itemPrice}>{(item.price * item.quantity).toFixed(0)} kr</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.totalContainer}>
                  <Text style={styles.totalLabel}>Att betala</Text>
                  <Text style={styles.totalAmount}>{total.toFixed(0)} kr</Text>
                </View>
              </View>
              <View style={styles.rightSide}>
                {qrData && (
                  <View style={styles.qrContainer}>
                    <View style={styles.qrBox}>
                      <QRCode 
                        value={qrData} 
                        size={Math.min(height * 0.5, width * 0.4, 350)} 
                        backgroundColor="white" 
                        color="black" 
                      />
                    </View>
                    <View style={styles.swishBranding}>
                      <Ionicons name="phone-portrait-outline" size={20} color={C.swish} />
                      <Text style={styles.swishText}>Skanna med Swish</Text>
                    </View>
                  </View>
                )}
              </View>
            </>
          ) : (
            // PORTRAIT: QR top 50%, Cart bottom 50%
            <>
              {/* TOP: QR Code + Total */}
              <View style={styles.topSection}>
                {qrData && (
                  <View style={styles.qrContainerPortrait}>
                    <View style={styles.qrBoxPortrait}>
                      <QRCode 
                        value={qrData} 
                        size={Math.min(width * 0.55, height * 0.3, 280)} 
                        backgroundColor="white" 
                        color="black" 
                      />
                    </View>
                    <View style={styles.totalRowPortrait}>
                      <Text style={styles.totalLabelPortrait}>Att betala</Text>
                      <Text style={styles.totalAmountPortrait}>{total.toFixed(0)} kr</Text>
                    </View>
                    <View style={styles.swishBrandingPortrait}>
                      <Ionicons name="phone-portrait-outline" size={16} color={C.swish} />
                      <Text style={styles.swishTextPortrait}>Skanna med Swish</Text>
                    </View>
                  </View>
                )}
              </View>
              
              {/* BOTTOM: Cart items (scrollable) */}
              <View style={styles.bottomSection}>
                <Text style={styles.itemsTitlePortrait}>Din beställning</Text>
                <ScrollView style={styles.itemsListPortrait} showsVerticalScrollIndicator={true}>
                  {items.map((item: any, idx: number) => (
                    <View key={idx} style={styles.displayItemPortrait}>
                      <View style={styles.itemLeftPortrait}>
                        <View style={styles.itemQtyBadgePortrait}>
                          <Text style={styles.itemQtyTextPortrait}>{item.quantity}x</Text>
                        </View>
                        <Text style={styles.itemNamePortrait}>{item.name}</Text>
                      </View>
                      <Text style={styles.itemPricePortrait}>{(item.price * item.quantity).toFixed(0)} kr</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  statusText: { color: C.textSec, fontSize: 16, marginTop: 16 },

  // Error
  errorTitle: { fontSize: 24, fontWeight: '700', color: C.text, marginTop: 16 },
  errorText: { fontSize: 16, color: C.textSec, marginTop: 8, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', backgroundColor: C.green, paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 12, marginTop: 24, gap: 8, alignItems: 'center',
  },
  retryBtnText: { color: C.white, fontSize: 16, fontWeight: '600' },

  // Unpaired
  unpairedTitle: { fontSize: 24, fontWeight: '700', color: C.text, marginTop: 16 },
  unpairedText: { fontSize: 16, color: C.textSec, marginTop: 8, textAlign: 'center' },

  // Pairing
  pairIconContainer: {
    width: 96, height: 96, borderRadius: 24, backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 24,
  },
  pairTitle: { fontSize: 28, fontWeight: '700', color: C.text },
  pairSubtitle: { fontSize: 16, color: C.textSec, marginTop: 8, textAlign: 'center', maxWidth: 300 },
  codeContainer: { flexDirection: 'row', gap: 16, marginTop: 32 },
  codeDigit: {
    width: 72, height: 88, backgroundColor: C.surface, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: C.green,
  },
  codeDigitText: { fontSize: 40, fontWeight: '700', color: C.green },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 32 },
  waitingText: { color: C.textSec, fontSize: 14 },
  newCodeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  newCodeBtnText: { color: C.textSec, fontSize: 13 },

  // Display header
  displayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  storeInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  storeNameText: { fontSize: 20, fontWeight: '700', color: C.text },
  connectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,197,94,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  connectedText: { fontSize: 12, color: C.green, fontWeight: '500' },
  storeLogoDisplay: { width: 32, height: 32, borderRadius: 6 },

  // Idle
  idleContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  idleIconWrap: {
    width: 120, height: 120, borderRadius: 30, backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    borderWidth: 1, borderColor: C.border,
  },
  centerLogo: {
    width: 150, height: 150, borderRadius: 20, marginBottom: 24,
  },
  idleTitle: { fontSize: 32, fontWeight: '700', color: C.text },
  idleSubtitle: { fontSize: 18, color: C.textSec, marginTop: 8, textAlign: 'center' },

  // Waiting - Side by side layout
  waitingContainer: { flex: 1, flexDirection: 'row' },
  
  // Left side - Cart + Total
  leftSide: { 
    flex: 1, 
    padding: 24, 
    borderRightWidth: 1, 
    borderRightColor: C.border,
    maxWidth: width * 0.45,
  },
  itemsTitle: { fontSize: 22, fontWeight: '600', color: C.text, marginBottom: 16 },
  itemsList: { flex: 1 },
  displayItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  itemQtyBadge: {
    backgroundColor: C.green, width: 36, height: 36, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  itemQtyText: { color: C.white, fontSize: 14, fontWeight: '700' },
  itemName: { fontSize: 18, color: C.text, fontWeight: '500' },
  itemPrice: { fontSize: 18, color: C.textSec, fontWeight: '600' },
  
  // Total container - Fixed at bottom
  totalContainer: {
    borderTopWidth: 2,
    borderTopColor: C.green,
    paddingTop: 20,
    marginTop: 16,
  },
  totalLabel: { fontSize: 18, fontWeight: '500', color: C.textSec, marginBottom: 4 },
  totalAmount: { fontSize: 48, fontWeight: '700', color: C.green },

  // Right side - QR code maximized
  rightSide: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    padding: 32,
  },
  qrContainer: { 
    alignItems: 'center',
  },
  qrBox: {
    backgroundColor: C.white, 
    borderRadius: 24, 
    padding: 32,
    alignItems: 'center', 
    justifyContent: 'center',
  },
  swishBranding: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24,
    backgroundColor: C.surface, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24,
  },
  swishText: { color: C.swish, fontSize: 16, fontWeight: '600' },

  // Paid overlay
  paidOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,9,11,0.95)',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  paidCard: { alignItems: 'center' },
  paidTitle: { fontSize: 48, fontWeight: '700', color: C.green, marginTop: 16 },
  paidSubtitle: { fontSize: 20, color: C.textSec, marginTop: 8 },
  paidAmount: { fontSize: 56, fontWeight: '700', color: C.text, marginTop: 16 },

  // PORTRAIT STYLES
  waitingContainerPortrait: { flexDirection: 'column' },
  
  // Top section - QR + Total (50%)
  topSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  qrContainerPortrait: { alignItems: 'center' },
  qrBoxPortrait: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRowPortrait: {
    alignItems: 'center',
    marginTop: 16,
  },
  totalLabelPortrait: { fontSize: 14, color: C.textSec, fontWeight: '500' },
  totalAmountPortrait: { fontSize: 36, fontWeight: '700', color: C.green },
  swishBrandingPortrait: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  swishTextPortrait: { color: C.swish, fontSize: 13, fontWeight: '600' },
  
  // Bottom section - Cart (50%)
  bottomSection: {
    flex: 1,
    padding: 16,
  },
  itemsTitlePortrait: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 12 },
  itemsListPortrait: { flex: 1 },
  displayItemPortrait: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  itemLeftPortrait: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  itemQtyBadgePortrait: {
    backgroundColor: C.green, width: 28, height: 28, borderRadius: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  itemQtyTextPortrait: { color: C.white, fontSize: 12, fontWeight: '700' },
  itemNamePortrait: { fontSize: 15, color: C.text, fontWeight: '500' },
  itemPricePortrait: { fontSize: 15, color: C.textSec, fontWeight: '600' },
});
