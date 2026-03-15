import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
  TextInput, Modal, Platform, Dimensions, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Colors } from './src/utils/colors';
import { api } from './src/utils/api';

type DisplayStatus = 'idle' | 'showing_cart' | 'payment_pending' | 'payment_complete';

interface DisplayData {
  status: DisplayStatus;
  items?: { name: string; price: number; quantity: number }[];
  total?: number;
  qr_code_url?: string;
  message?: string;
  store_name?: string;
  order_id?: string;
}

export default function App() {
  // Pairing state
  const [isPaired, setIsPaired] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingError, setPairingError] = useState('');
  const [pairing, setPairing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');

  // Display state
  const [displayData, setDisplayData] = useState<DisplayData | null>(null);
  const [loading, setLoading] = useState(true);

  // Email receipt modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Sound
  const soundRef = useRef<Audio.Sound | null>(null);
  const lastStatusRef = useRef<DisplayStatus>('idle');

  // Keep screen awake
  useEffect(() => {
    activateKeepAwakeAsync();
    return () => {
      deactivateKeepAwake();
    };
  }, []);

  // Lock to portrait orientation
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  // Load saved pairing on mount
  useEffect(() => {
    loadSavedPairing();
    loadSound();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const loadSound = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        require('./assets/pling.mp3'),
        { shouldPlay: false }
      );
      soundRef.current = sound;
    } catch (e) {
      // Silent fail - sound is not critical
    }
  };

  const playPling = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.replayAsync();
      }
    } catch (e) {
      // Silent fail - sound is not critical
    }
  };

  const loadSavedPairing = async () => {
    try {
      const saved = await AsyncStorage.getItem('display_pairing');
      if (saved) {
        const { userId: savedUserId, storeName: savedStoreName } = JSON.parse(saved);
        setUserId(savedUserId);
        setStoreName(savedStoreName || '');
        setIsPaired(true);
      }
    } catch (e) {
      console.error('Failed to load pairing:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePair = async () => {
    if (!pairingCode.trim()) {
      setPairingError('Ange en parkoplingskod');
      return;
    }
    setPairing(true);
    setPairingError('');
    try {
      const res = await api.post('/api/display/pair', { pairing_code: pairingCode.trim().toUpperCase() });
      const pairedUserId = res.user_id;
      const pairedStoreName = res.store_name || '';
      
      await AsyncStorage.setItem('display_pairing', JSON.stringify({
        userId: pairedUserId,
        storeName: pairedStoreName,
      }));
      
      setUserId(pairedUserId);
      setStoreName(pairedStoreName);
      setIsPaired(true);
      setPairingCode('');
    } catch (e: any) {
      setPairingError(e.message || 'Parkopplingen misslyckades');
    } finally {
      setPairing(false);
    }
  };

  const handleUnpair = async () => {
    await AsyncStorage.removeItem('display_pairing');
    setIsPaired(false);
    setUserId(null);
    setStoreName('');
    setDisplayData(null);
  };

  // Poll display data
  useEffect(() => {
    if (!isPaired || !userId) return;

    const fetchDisplayData = async () => {
      try {
        const data = await api.get(`/api/customer-display?user_id=${userId}`);
        setDisplayData(data);
        
        // Play pling when QR code appears (transition to payment_pending)
        if (data.status === 'payment_pending' && lastStatusRef.current !== 'payment_pending') {
          playPling();
        }
        lastStatusRef.current = data.status;
      } catch (e) {
        console.error('Failed to fetch display data:', e);
      }
    };

    fetchDisplayData();
    const interval = setInterval(fetchDisplayData, 2000);
    return () => clearInterval(interval);
  }, [isPaired, userId]);

  const handleSendReceipt = async () => {
    if (!email.trim() || !displayData?.order_id) {
      setEmailError('Ange en giltig e-postadress');
      return;
    }
    setSendingEmail(true);
    setEmailError('');
    try {
      await api.post('/api/receipts/send', {
        order_id: displayData.order_id,
        email: email.trim(),
      });
      setEmailSent(true);
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSent(false);
        setEmail('');
      }, 2000);
    } catch (e: any) {
      setEmailError(e.message || 'Kunde inte skicka kvitto');
    } finally {
      setSendingEmail(false);
    }
  };

  // Loading screen
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Pairing screen
  if (!isPaired) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.pairingCard}>
          <View style={styles.iconBox}>
            <Ionicons name="tv-outline" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.pairingTitle}>QR-Kassan Display</Text>
          <Text style={styles.pairingSubtitle}>Kundskärm för betalning</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Parkoplingskod</Text>
            <TextInput
              style={styles.input}
              value={pairingCode}
              onChangeText={setPairingCode}
              placeholder="Ange kod från kassan"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          {pairingError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.destructive} />
              <Text style={styles.errorText}>{pairingError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.pairButton, pairing && styles.buttonDisabled]}
            onPress={handlePair}
            disabled={pairing}
          >
            {pairing ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.pairButtonText}>Koppla skärm</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.instructions}>
            Öppna "Koppla skärm" i kassan för att få en parkoplingskod
          </Text>
        </View>
      </View>
    );
  }

  // Display screen
  const status = displayData?.status || 'idle';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.storeName}>{storeName || 'QR-Kassan'}</Text>
        <TouchableOpacity onPress={handleUnpair} style={styles.unpairBtn}>
          <Ionicons name="close-circle-outline" size={24} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {status === 'idle' && (
          <View style={styles.idleContainer}>
            <Ionicons name="cart-outline" size={80} color={Colors.textMuted} />
            <Text style={styles.idleText}>Väntar på order...</Text>
          </View>
        )}

        {status === 'showing_cart' && displayData?.items && (
          <View style={styles.cartContainer}>
            <Text style={styles.cartTitle}>Din order</Text>
            {displayData.items.map((item, idx) => (
              <View key={idx} style={styles.cartItem}>
                <Text style={styles.itemName}>{item.quantity}x {item.name}</Text>
                <Text style={styles.itemPrice}>{item.price * item.quantity} kr</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Totalt</Text>
              <Text style={styles.totalValue}>{displayData.total} kr</Text>
            </View>
          </View>
        )}

        {status === 'payment_pending' && displayData?.qr_code_url && (
          <View style={styles.paymentContainer}>
            <Text style={styles.paymentTitle}>Betala med Swish</Text>
            <View style={styles.qrContainer}>
              <View style={styles.qrPlaceholder}>
                <Ionicons name="qr-code" size={180} color={Colors.primary} />
              </View>
            </View>
            <Text style={styles.totalAmount}>{displayData.total} kr</Text>
            <Text style={styles.scanText}>Skanna QR-koden med Swish-appen</Text>
          </View>
        )}

        {status === 'payment_complete' && (
          <View style={styles.completeContainer}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={80} color={Colors.white} />
            </View>
            <Text style={styles.completeTitle}>Tack för ditt köp!</Text>
            <Text style={styles.completeSubtitle}>Betalningen är genomförd</Text>
            
            {/* Email receipt button */}
            <TouchableOpacity
              style={styles.receiptButton}
              onPress={() => setShowEmailModal(true)}
            >
              <Ionicons name="mail-outline" size={20} color={Colors.primary} />
              <Text style={styles.receiptButtonText}>Skicka kvitto via e-post</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Email Receipt Modal */}
      <Modal
        visible={showEmailModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {emailSent ? (
              <View style={styles.emailSentContainer}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.primary} />
                <Text style={styles.emailSentText}>Kvitto skickat!</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>Skicka kvitto</Text>
                <Text style={styles.modalSubtitle}>Ange din e-postadress</Text>
                
                <TextInput
                  style={styles.modalInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="din@email.se"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {emailError ? (
                  <Text style={styles.modalError}>{emailError}</Text>
                ) : null}

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => {
                      setShowEmailModal(false);
                      setEmail('');
                      setEmailError('');
                    }}
                  >
                    <Text style={styles.modalCancelText}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSendBtn, sendingEmail && styles.buttonDisabled]}
                    onPress={handleSendReceipt}
                    disabled={sendingEmail}
                  >
                    {sendingEmail ? (
                      <ActivityIndicator color={Colors.white} size="small" />
                    ) : (
                      <Text style={styles.modalSendText}>Skicka</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
  },
  
  // Pairing screen
  pairingCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconBox: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pairingTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  pairingSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 40,
  },
  inputGroup: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    fontSize: 18,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
    width: '100%',
    maxWidth: 320,
  },
  errorText: {
    color: Colors.destructive,
    fontSize: 14,
    flex: 1,
  },
  pairButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pairButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  instructions: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
    maxWidth: 280,
  },

  // Display screen
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  storeName: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  unpairBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // Idle state
  idleContainer: {
    alignItems: 'center',
  },
  idleText: {
    fontSize: 24,
    color: Colors.textMuted,
    marginTop: 24,
  },

  // Cart state
  cartContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cartTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemName: {
    fontSize: 18,
    color: Colors.textPrimary,
  },
  itemPrice: {
    fontSize: 18,
    color: Colors.textSecondary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
  },
  totalLabel: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Payment state
  paymentContainer: {
    alignItems: 'center',
  },
  paymentTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 24,
  },
  qrContainer: {
    backgroundColor: Colors.white,
    padding: 24,
    borderRadius: 20,
    marginBottom: 24,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 16,
  },
  scanText: {
    fontSize: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Complete state
  completeContainer: {
    alignItems: 'center',
  },
  checkCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  completeTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  completeSubtitle: {
    fontSize: 18,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  receiptButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    width: '85%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  modalError: {
    color: Colors.destructive,
    fontSize: 14,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSendBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  modalSendText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  emailSentContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emailSentText: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 16,
  },
});
