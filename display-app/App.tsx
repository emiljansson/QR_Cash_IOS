import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
  TextInput, Modal, ScrollView, Dimensions, StatusBar, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function App() {
  // Pairing state - Display generates code, POS enters it
  const [isPaired, setIsPaired] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Display state
  const [displayData, setDisplayData] = useState<DisplayData | null>(null);

  // Email receipt modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Thank you countdown
  const [thankYouCountdown, setThankYouCountdown] = useState(15);
  const thankYouTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sound
  const player = useAudioPlayer(require('./assets/pling.mp3'));
  const lastStatusRef = useRef<DisplayStatus>('idle');

  // Keep screen awake
  useEffect(() => {
    activateKeepAwakeAsync();
    return () => deactivateKeepAwake();
  }, []);

  // Lock to portrait orientation
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  // Load saved pairing on mount
  useEffect(() => {
    loadSavedPairing();
  }, []);

  const playPling = () => {
    try {
      player.seekTo(0);
      player.play();
    } catch (e) {}
  };

  const loadSavedPairing = async () => {
    try {
      const saved = await AsyncStorage.getItem('display_pairing');
      if (saved) {
        const { userId: savedUserId, displayId: savedDisplayId, storeName: savedStoreName } = JSON.parse(saved);
        // Verify pairing is still valid using displayId
        if (savedDisplayId) {
          try {
            const status = await api.get(`/api/customer-display/pairing-status?display_code=${savedDisplayId}`);
            if (status.paired) {
              setUserId(status.user_id || savedUserId);
              setDisplayId(savedDisplayId);
              setStoreName(status.store_name || savedStoreName || '');
              setIsPaired(true);
            } else {
              // Pairing no longer valid, generate new code
              await AsyncStorage.removeItem('display_pairing');
              generateNewCode();
            }
          } catch {
            // Can't verify, generate new code
            await AsyncStorage.removeItem('display_pairing');
            generateNewCode();
          }
        } else {
          // Old format without displayId, regenerate
          await AsyncStorage.removeItem('display_pairing');
          generateNewCode();
        }
      } else {
        generateNewCode();
      }
    } catch (e) {
      generateNewCode();
    } finally {
      setLoading(false);
    }
  };

  // Generate a new 4-digit pairing code
  const generateNewCode = async () => {
    setGeneratingCode(true);
    try {
      const res = await api.post('/api/customer-display/generate-code', {});
      setGeneratedCode(res.code);
      setDisplayId(res.display_id || null);
      // Start polling for when POS pairs with this code
      pollForPairing(res.code, res.display_id);
    } catch (e) {
      // Generate local fallback code
      const code = String(Math.floor(1000 + Math.random() * 9000));
      setGeneratedCode(code);
    } finally {
      setGeneratingCode(false);
    }
  };

  // Poll to check if POS has paired with our code
  const pollForPairing = (code: string, newDisplayId: string | null) => {
    const checkPairing = async () => {
      try {
        const res = await api.get(`/api/customer-display/check-pairing?code=${code}`);
        if (res.paired && res.user_id) {
          await AsyncStorage.setItem('display_pairing', JSON.stringify({
            userId: res.user_id,
            displayId: newDisplayId || code,
            storeName: res.store_name || '',
          }));
          setUserId(res.user_id);
          setDisplayId(newDisplayId || code);
          setStoreName(res.store_name || '');
          setIsPaired(true);
          return true;
        }
      } catch {}
      return false;
    };

    const interval = setInterval(async () => {
      const paired = await checkPairing();
      if (paired) {
        clearInterval(interval);
      }
    }, 2000);

    // Stop polling after 10 minutes and generate new code
    setTimeout(() => {
      clearInterval(interval);
      if (!isPaired) {
        generateNewCode();
      }
    }, 10 * 60 * 1000);
  };

  // Unpair and generate new code
  const handleUnpair = async () => {
    // Notify backend
    try {
      if (userId) {
        await api.post('/api/customer-display/unpair', { user_id: userId });
      }
    } catch {}
    
    await AsyncStorage.removeItem('display_pairing');
    setIsPaired(false);
    setUserId(null);
    setDisplayId(null);
    setStoreName('');
    setLogoUrl(null);
    setDisplayData(null);
    generateNewCode();
  };

  // Poll display data when paired + Background validation of pairing
  useEffect(() => {
    if (!isPaired || !userId) return;

    let validationInterval: NodeJS.Timeout | null = null;

    const fetchDisplayData = async () => {
      try {
        const data = await api.get(`/api/customer-display?user_id=${userId}`);
        
        // Check if we've been unpaired
        if (data.unpaired || data.status === 'unpaired') {
          handleUnpair();
          return;
        }
        
        setDisplayData(data);
        
        // Update store name and logo
        if (data.store_name) setStoreName(data.store_name);
        if (data.logo_url) setLogoUrl(data.logo_url);
        
        // Play pling when payment completes
        if (data.status === 'payment_complete' && lastStatusRef.current !== 'payment_complete') {
          playPling();
          // Start thank you countdown
          setThankYouCountdown(15);
          setShowEmailModal(true);
        }
        
        lastStatusRef.current = data.status;
      } catch (e) {
        // Error fetching display data - don't disconnect yet
      }
    };

    // Background validation of pairing status - runs every 5 seconds
    const validatePairing = async () => {
      if (!displayId) return;
      try {
        const status = await api.get(`/api/customer-display/pairing-status?display_code=${displayId}`);
        if (!status.paired) {
          handleUnpair();
        }
      } catch {
        // Network error - don't disconnect, just skip this check
      }
    };

    fetchDisplayData();
    const dataInterval = setInterval(fetchDisplayData, 2000);
    
    // Start background validation
    validationInterval = setInterval(validatePairing, 5000);

    return () => {
      clearInterval(dataInterval);
      if (validationInterval) clearInterval(validationInterval);
    };
  }, [isPaired, userId, displayId]);

  // Thank you countdown timer
  useEffect(() => {
    if (displayData?.status === 'payment_complete') {
      thankYouTimerRef.current = setInterval(() => {
        setThankYouCountdown(prev => {
          if (prev <= 1) {
            // Reset to idle
            setShowEmailModal(false);
            setEmail('');
            setEmailSent(false);
            return 15;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (thankYouTimerRef.current) {
        clearInterval(thankYouTimerRef.current);
      }
      setThankYouCountdown(15);
    }
    
    return () => {
      if (thankYouTimerRef.current) {
        clearInterval(thankYouTimerRef.current);
      }
    };
  }, [displayData?.status]);

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
        user_id: userId,
      });
      setEmailSent(true);
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

  // Pairing screen - Show generated code
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

          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Ange denna kod i kassan:</Text>
            {generatingCode ? (
              <ActivityIndicator size="large" color={Colors.primary} />
            ) : (
              <Text style={styles.codeDisplay}>{generatedCode}</Text>
            )}
          </View>

          <Text style={styles.instructions}>
            Öppna "Koppla skärm" i kassan och ange koden ovan
          </Text>

          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={generateNewCode}
            disabled={generatingCode}
          >
            <Ionicons name="refresh" size={18} color={Colors.primary} />
            <Text style={styles.refreshButtonText}>Generera ny kod</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Display screen - Portrait: QR top 50%, Cart bottom 50%
  const status = displayData?.status || 'idle';
  const showQR = status === 'payment_pending' && displayData?.qr_code_url;
  const showThankYou = status === 'payment_complete';

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

      {/* Main Content - Split 50/50 */}
      <View style={styles.splitContainer}>
        
        {/* Top 50% - QR Code or Status */}
        <View style={styles.topHalf}>
          {showThankYou ? (
            <View style={styles.thankYouContainer}>
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={60} color={Colors.white} />
              </View>
              <Text style={styles.thankYouTitle}>Tack för köpet!</Text>
              <Text style={styles.thankYouSubtitle}>Betalningen är genomförd</Text>
              <Text style={styles.countdownText}>Återställs om {thankYouCountdown}s</Text>
            </View>
          ) : showQR ? (
            <View style={styles.qrSection}>
              <Text style={styles.qrTitle}>Betala med Swish</Text>
              <View style={styles.qrBox}>
                {displayData?.qr_code_url ? (
                  <Image 
                    source={{ uri: displayData.qr_code_url }} 
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons name="qr-code" size={150} color={Colors.primary} />
                )}
              </View>
              <Text style={styles.qrAmount}>{displayData?.total} kr</Text>
              <Text style={styles.qrHint}>Skanna med Swish-appen</Text>
            </View>
          ) : (
            <View style={styles.idleTop}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.centerLogo} resizeMode="contain" />
              ) : (
                <Ionicons name="cart-outline" size={60} color={Colors.textMuted} />
              )}
              <Text style={styles.idleText}>Väntar på order...</Text>
            </View>
          )}
        </View>

        {/* Bottom 50% - Cart */}
        <View style={styles.bottomHalf}>
          {displayData?.items && displayData.items.length > 0 ? (
            <ScrollView style={styles.cartScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.cartTitle}>Din order</Text>
              {displayData.items.map((item, idx) => (
                <View key={idx} style={styles.cartItem}>
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemQty}>{item.quantity}x</Text>
                    <Text style={styles.itemName}>{item.name}</Text>
                  </View>
                  <Text style={styles.itemPrice}>{item.price * item.quantity} kr</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Totalt att betala</Text>
                <Text style={styles.totalValue}>{displayData.total} kr</Text>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.emptyCart}>
              <Ionicons name="basket-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyCartText}>Varukorgen är tom</Text>
            </View>
          )}
        </View>
      </View>

      {/* Email Receipt Modal - Shows on payment complete */}
      <Modal
        visible={showEmailModal && showThankYou}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmailModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            {emailSent ? (
              <View style={styles.emailSentContainer}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.primary} />
                <Text style={styles.emailSentText}>Kvitto skickat!</Text>
                <Text style={styles.emailSentSubtext}>Kolla din inkorg</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>Vill du ha kvitto?</Text>
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
                  autoFocus
                />

                {emailError ? (
                  <Text style={styles.modalError}>{emailError}</Text>
                ) : null}

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalSkipBtn}
                    onPress={() => setShowEmailModal(false)}
                  >
                    <Text style={styles.modalSkipText}>Nej tack</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSendBtn, sendingEmail && styles.buttonDisabled]}
                    onPress={handleSendReceipt}
                    disabled={sendingEmail}
                  >
                    {sendingEmail ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.modalSendText}>Skicka</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  
  // Pairing screen
  pairingCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconBox: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: 'rgba(34,197,94,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  pairingTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  pairingSubtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    marginBottom: 40,
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  codeLabel: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  codeDisplay: {
    fontSize: 72,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  instructions: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  refreshButtonText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },

  // Display screen
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  storeName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  unpairBtn: {
    padding: 8,
  },

  // Split container
  splitContainer: {
    flex: 1,
  },
  topHalf: {
    height: SCREEN_HEIGHT * 0.45,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  bottomHalf: {
    flex: 1,
    padding: 16,
  },

  // Idle state
  idleTop: {
    alignItems: 'center',
  },
  idleText: {
    fontSize: 18,
    color: Colors.textMuted,
    marginTop: 16,
  },
  centerLogo: {
    width: 120,
    height: 120,
    borderRadius: 16,
    marginBottom: 8,
  },

  // QR section
  qrSection: {
    alignItems: 'center',
    padding: 16,
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  qrBox: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  qrAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 8,
  },
  qrHint: {
    fontSize: 14,
    color: Colors.textMuted,
  },

  // Thank you
  thankYouContainer: {
    alignItems: 'center',
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  thankYouTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  thankYouSubtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  countdownText: {
    fontSize: 14,
    color: Colors.textMuted,
  },

  // Cart
  cartScroll: {
    flex: 1,
  },
  cartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemQty: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
    marginRight: 8,
    minWidth: 32,
  },
  itemName: {
    fontSize: 16,
    color: Colors.textPrimary,
    flex: 1,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: Colors.primary,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCartText: {
    fontSize: 16,
    color: Colors.textMuted,
    marginTop: 12,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalError: {
    color: Colors.destructive,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalSkipBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalSkipText: {
    fontSize: 16,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  modalSendBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalSendText: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emailSentContainer: {
    alignItems: 'center',
    padding: 24,
  },
  emailSentText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emailSentSubtext: {
    fontSize: 16,
    color: Colors.textMuted,
    marginTop: 8,
  },
});
