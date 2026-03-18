import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
  TextInput, Modal, ScrollView, Dimensions, StatusBar, Image,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Constants from 'expo-constants';
import { Colors } from './src/utils/colors';
import { api } from './src/utils/api';

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

type DisplayState = 'loading' | 'generating' | 'waiting_pair' | 'paired_idle' | 'paired_waiting' | 'paired_paid' | 'error' | 'unpaired' | 'reconnecting';

interface DisplayData {
  status: string;
  items?: { name: string; price: number; quantity: number }[];
  total?: number;
  qr_code_url?: string;
  qr_data?: string;
  message?: string;
  store_name?: string;
  order_id?: string;
  logo_url?: string;
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  
  // State management
  const [state, setState] = useState<DisplayState>('loading');
  const [pairingCode, setPairingCode] = useState('');
  const [displayId, setDisplayId] = useState('');
  const [userId, setUserId] = useState('');
  const [displayData, setDisplayData] = useState<DisplayData | null>(null);
  const [storeName, setStoreName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [qrLoadError, setQrLoadError] = useState(false);
  
  // Email receipt state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [thankYouCountdown, setThankYouCountdown] = useState(20);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paidAnimation, setPaidAnimation] = useState(false);
  
  // Refs
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const dataPollRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownStartedRef = useRef(false);
  const openedDuringCountdownRef = useRef(false);
  const lastDataHashRef = useRef<string>('');
  const isInitializedRef = useRef(false);
  const currentOrderIdRef = useRef<string | null>(null);
  const confirmedOrderIdRef = useRef<string | null>(null);
  const lastSuccessfulPollRef = useRef<number>(Date.now());
  
  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  // Sound
  const player = useAudioPlayer(require('./assets/pling.mp3'));

  const playPling = () => {
    try {
      player.seekTo(0);
      player.play();
    } catch (e) {}
  };

  // Keep screen awake
  useEffect(() => {
    activateKeepAwakeAsync();
    return () => deactivateKeepAwake();
  }, []);

  // Allow all orientations
  useEffect(() => {
    ScreenOrientation.unlockAsync();
  }, []);

  // Load saved pairing on mount - only once
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    checkSavedPairing();
    
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (dataPollRef.current) clearInterval(dataPollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    };
  }, []);

  // Check for saved pairing
  const checkSavedPairing = async () => {
    try {
      const saved = await AsyncStorage.getItem('display_pairing');
      if (saved) {
        const { userId: savedUserId, displayId: savedDisplayId, storeName: savedStoreName } = JSON.parse(saved);
        if (savedDisplayId) {
          try {
            const status = await api.get(`/api/customer-display/pairing-status?display_code=${savedDisplayId}`);
            if (status.paired) {
              setUserId(status.user_id || savedUserId);
              setDisplayId(savedDisplayId);
              setStoreName(status.store_name || savedStoreName || '');
              setState('paired_idle');
              return;
            }
          } catch {}
        }
        await AsyncStorage.removeItem('display_pairing');
      }
      generateCode();
    } catch (e) {
      generateCode();
    }
  };

  // Generate pairing code
  const generateCode = async () => {
    setState('generating');
    setError('');
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    
    try {
      const res = await api.post('/api/customer-display/generate-code', {});
      setPairingCode(res.code);
      setDisplayId(res.display_id || '');
      setState('waiting_pair');
    } catch (e) {
      setError('Kunde inte ansluta till servern');
      setState('error');
    }
  };

  // Save pairing
  const savePairing = async (newUserId: string, newDisplayId: string, newStoreName: string) => {
    await AsyncStorage.setItem('display_pairing', JSON.stringify({
      userId: newUserId,
      displayId: newDisplayId,
      storeName: newStoreName,
    }));
  };

  // Reset inactivity timeout - called on each successful poll
  const resetInactivityTimeout = () => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    
    inactivityTimeoutRef.current = setTimeout(async () => {
      // 5 minutes of no successful communication - show reconnecting screen with pairing code
      // BUT keep the existing pairing so we can auto-reconnect if POS comes back
      console.log('Inactivity timeout - showing reconnecting screen');
      setState('reconnecting');
      
      // Generate a new pairing code (for new connections) but keep old userId
      try {
        const res = await api.post('/api/customer-display/generate-code', {});
        setPairingCode(res.code);
        // Keep the old displayId and userId for potential reconnection
      } catch (e) {
        console.log('Failed to generate reconnection code:', e);
      }
    }, INACTIVITY_TIMEOUT_MS);
  };

  // Unpair
  const handleUnpair = async () => {
    // Stop all polling
    if (dataPollRef.current) clearInterval(dataPollRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    dataPollRef.current = null;
    pollRef.current = null;
    countdownRef.current = null;
    inactivityTimeoutRef.current = null;
    
    // Notify backend
    try {
      if (userId) {
        await api.post('/api/customer-display/unpair', { user_id: userId });
      }
    } catch {}
    
    // Clear all state
    await AsyncStorage.removeItem('display_pairing');
    setUserId('');
    setDisplayId('');
    setStoreName('');
    setLogoUrl(null);
    setDisplayData(null);
    countdownStartedRef.current = false;
    currentOrderIdRef.current = null;
    confirmedOrderIdRef.current = null;
    
    // Generate new code
    generateCode();
  };

  // Poll for pairing (when waiting for code entry)
  useEffect(() => {
    if (state !== 'waiting_pair' || !pairingCode) return;

    const checkPairing = async () => {
      try {
        const res = await api.get(`/api/customer-display/check-code/${pairingCode}`);
        if (res.paired && res.user_id) {
          const newUserId = res.user_id;
          const newDisplayId = res.display_id || displayId;
          
          setUserId(newUserId);
          if (res.display_id) setDisplayId(newDisplayId);
          
          await savePairing(newUserId, newDisplayId, '');
          setState('paired_idle');
          
          // Start inactivity timeout
          lastSuccessfulPollRef.current = Date.now();
          resetInactivityTimeout();
        } else if (!res.valid) {
          generateCode();
        }
      } catch {}
    };

    pollRef.current = setInterval(checkPairing, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, pairingCode, displayId]);

  // Poll display data once paired (or reconnecting)
  useEffect(() => {
    if (!userId || (state !== 'paired_idle' && state !== 'paired_waiting' && state !== 'paired_paid' && state !== 'reconnecting')) return;

    const fetchDisplay = async () => {
      try {
        const data = await api.get(`/api/customer-display?user_id=${userId}&display_id=${displayId}`);

        if (data.status === 'unpaired') {
          await AsyncStorage.removeItem('display_pairing');
          setUserId(null);
          setDisplayId('');
          if (inactivityTimeoutRef.current) {
            clearTimeout(inactivityTimeoutRef.current);
            inactivityTimeoutRef.current = null;
          }
          // Go directly to generate new code
          generateCode();
          return;
        }

        // Successful poll - reset inactivity timer
        lastSuccessfulPollRef.current = Date.now();
        resetInactivityTimeout();
        
        // If we were in reconnecting state, we're back online!
        if (state === 'reconnecting') {
          console.log('Reconnected to POS!');
          // Go to appropriate state based on backend status
          if (data.status === 'waiting') {
            setState('paired_waiting');
          } else if (data.status === 'paid') {
            setState('paired_paid');
          } else {
            setState('paired_idle');
          }
        }

        // Update store info
        if (data.store_name) setStoreName(data.store_name);
        if (data.logo_url) setLogoUrl(data.logo_url);

        const incomingOrderId = data.order_id || null;
        const backendStatus = data.status; // 'idle', 'waiting', 'paid'

        // CASE 1: Backend says PAID
        if (backendStatus === 'paid') {
          // Only trigger paid state if this is a NEW confirmation (not already confirmed)
          if (incomingOrderId && incomingOrderId !== confirmedOrderIdRef.current) {
            // New payment confirmation!
            confirmedOrderIdRef.current = incomingOrderId;
            currentOrderIdRef.current = incomingOrderId;
            setDisplayData(data);
            setState('paired_paid');
            setPaidAnimation(true);
            setPaidAmount(data.total || 0);
            playPling();
            
            // Start countdown
            if (countdownRef.current) clearInterval(countdownRef.current);
            countdownStartedRef.current = true;
            setThankYouCountdown(20);
            
            countdownRef.current = setInterval(() => {
              setThankYouCountdown(prev => {
                if (prev <= 1) {
                  if (countdownRef.current) clearInterval(countdownRef.current);
                  countdownRef.current = null;
                  countdownStartedRef.current = false;
                  setState('paired_idle');
                  setPaidAnimation(false);
                  setEmailSent(false);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          }
          // If already confirmed this order, stay on thank you screen (do nothing)
          return;
        }

        // CASE 2: Backend says WAITING (new order to display)
        if (backendStatus === 'waiting') {
          // Check if this is a new/different order than what we're showing
          if (incomingOrderId && incomingOrderId !== currentOrderIdRef.current) {
            // New order! Show it
            currentOrderIdRef.current = incomingOrderId;
            setDisplayData(data);
            setQrLoadError(false); // Reset QR error state for new order
            
            // If we were on paid screen, stop countdown
            if (state === 'paired_paid') {
              if (countdownRef.current) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
              }
              countdownStartedRef.current = false;
              setPaidAnimation(false);
              setEmailSent(false);
            }
            
            setState('paired_waiting');
          } else if (state !== 'paired_waiting' && state !== 'paired_paid') {
            // Same order but we're not showing it yet
            setDisplayData(data);
            setState('paired_waiting');
          }
          return;
        }

        // CASE 3: Backend says IDLE
        if (backendStatus === 'idle') {
          // Only go to idle if we're not in the middle of a paid countdown
          if (state !== 'paired_paid') {
            currentOrderIdRef.current = null;
            setDisplayData(data);
            setState('paired_idle');
          }
          return;
        }

      } catch (e) {
        console.log('Display poll error:', e);
      }
    };

    fetchDisplay();
    dataPollRef.current = setInterval(fetchDisplay, 2000);
    
    return () => { 
      if (dataPollRef.current) clearInterval(dataPollRef.current);
    };
  }, [userId, state]);

  // Handle email submission
  const handleSendReceipt = async () => {
    if (!email || !email.includes('@')) return;
    setSendingEmail(true);
    try {
      const res = await api.post('/api/customer-display/send-receipt', {
        email,
        user_id: userId
      });
      if (res.success) {
        setEmailSent(true);
        
        const wasOpenedDuringCountdown = openedDuringCountdownRef.current;
        
        // Show "Skickat!" for 5 seconds
        setTimeout(() => {
          setShowEmailModal(false);
          setEmail('');
          setEmailSent(false);
          
          if (wasOpenedDuringCountdown) {
            // Sent within 20s - reset entire display
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            countdownStartedRef.current = false;
            openedDuringCountdownRef.current = false;
            setState('paired_idle');
            setPaidAnimation(false);
            setPaidAmount(0);
          }
        }, 5000);
      }
    } catch (e) {
      // Silent fail
    } finally {
      setSendingEmail(false);
    }
  };

  // Open email modal and track timing
  const openEmailModal = () => {
    openedDuringCountdownRef.current = state === 'paired_paid';
    setShowEmailModal(true);
  };

  // SCREEN: Loading
  if (state === 'loading') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={styles.statusText}>Kontrollerar anslutning...</Text>
        </View>
      </View>
    );
  }

  // SCREEN: Generating code
  if (state === 'generating') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={styles.statusText}>Förbereder kundskärm...</Text>
        </View>
      </View>
    );
  }

  // SCREEN: Error
  if (state === 'error') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={64} color={C.red} />
          <Text style={styles.errorTitle}>Anslutningsfel</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={generateCode}>
            <Text style={styles.retryBtnText}>Försök igen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // SCREEN: Unpaired
  if (state === 'unpaired') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <Ionicons name="unlink-outline" size={64} color={C.textMut} />
          <Text style={styles.unpairedTitle}>Frånkopplad</Text>
          <Text style={styles.unpairedText}>Skärmen har kopplats bort från kassan</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleUnpair}>
            <Ionicons name="refresh" size={18} color={C.white} />
            <Text style={styles.retryBtnText}>Koppla igen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // SCREEN: Waiting for pairing
  if (state === 'waiting_pair') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
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

          <TouchableOpacity style={styles.newCodeBtn} onPress={generateCode}>
            <Ionicons name="refresh" size={16} color={C.textSec} />
            <Text style={styles.newCodeBtnText}>Generera ny kod</Text>
          </TouchableOpacity>
          
          <Text style={styles.versionText}>QR-Display v{APP_VERSION}</Text>
        </View>
      </View>
    );
  }

  // SCREEN: Reconnecting - showing pairing code but still trying to reconnect
  if (state === 'reconnecting') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <View style={styles.reconnectIconContainer}>
            <Ionicons name="sync-outline" size={48} color={C.orange} />
          </View>
          <Text style={styles.reconnectTitle}>Återansluter...</Text>
          <Text style={styles.reconnectSubtitle}>
            Försöker återansluta till kassan.{'\n'}
            Eller koppla med ny kod nedan.
          </Text>

          <View style={styles.codeContainer}>
            {pairingCode.split('').map((digit, idx) => (
              <View key={idx} style={styles.codeDigit}>
                <Text style={styles.codeDigitText}>{digit}</Text>
              </View>
            ))}
          </View>

          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={C.orange} />
            <Text style={styles.waitingText}>Söker anslutning...</Text>
          </View>

          <TouchableOpacity style={styles.newCodeBtn} onPress={generateCode}>
            <Ionicons name="refresh" size={16} color={C.textSec} />
            <Text style={styles.newCodeBtnText}>Generera ny kod</Text>
          </TouchableOpacity>
          
          <Text style={styles.versionText}>QR-Display v{APP_VERSION}</Text>
        </View>
      </View>
    );
  }

  // SCREEN: Paired - show display
  const items = displayData?.items || [];
  const total = displayData?.total || 0;
  const qrData = displayData?.qr_data;
  const isPaid = state === 'paired_paid';
  const isWaiting = state === 'paired_waiting';
  const showQR = isWaiting && qrData;
  const hasItems = items.length > 0;

  // SCREEN: Payment complete - Thank you
  if (isPaid) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.thankYouScreen}>
          <View style={[styles.thankYouCheckCircle, paidAnimation && styles.thankYouCheckCircleAnimated]}>
            <Ionicons name="checkmark" size={80} color={C.white} />
          </View>
          
          <Text style={styles.thankYouTitle}>Tack för ditt köp!</Text>
          <Text style={styles.thankYouAmount}>{paidAmount.toFixed(0)} kr</Text>
          <Text style={styles.thankYouSubtitle}>Betalningen är genomförd</Text>

          {/* Email receipt button */}
          {!showEmailModal && !emailSent && (
            <TouchableOpacity 
              style={styles.emailReceiptBtn}
              onPress={openEmailModal}
            >
              <Ionicons name="mail-outline" size={24} color={C.green} />
              <Text style={styles.emailReceiptBtnText}>Få kvitto via e-post</Text>
            </TouchableOpacity>
          )}

          {/* Email sent confirmation */}
          {emailSent && (
            <View style={styles.emailSentContainer}>
              <Ionicons name="checkmark-circle" size={32} color={C.green} />
              <Text style={styles.emailSentText}>Kvitto skickat!</Text>
            </View>
          )}

          <Text style={styles.thankYouCountdown}>
            Återställs om {thankYouCountdown}s
          </Text>
        </View>

        {/* Email Modal */}
        <Modal
          visible={showEmailModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowEmailModal(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.emailModalOverlay}
          >
            <View style={styles.emailModalContent}>
              <TouchableOpacity 
                style={styles.emailModalClose}
                onPress={() => setShowEmailModal(false)}
              >
                <Ionicons name="close" size={24} color={C.textMut} />
              </TouchableOpacity>

              {emailSent ? (
                <View style={styles.emailModalSent}>
                  <Ionicons name="checkmark-circle" size={64} color={C.green} />
                  <Text style={styles.emailModalSentTitle}>Kvitto skickat!</Text>
                  <Text style={styles.emailModalSentText}>Kolla din inkorg</Text>
                </View>
              ) : (
                <>
                  <Ionicons name="mail-outline" size={48} color={C.green} style={{ marginBottom: 16 }} />
                  <Text style={styles.emailModalTitle}>Få kvitto via e-post</Text>
                  <Text style={styles.emailModalSubtitle}>Ange din e-postadress nedan</Text>
                  
                  <TextInput
                    style={styles.emailInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="din@email.se"
                    placeholderTextColor={C.textMut}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                  
                  <TouchableOpacity 
                    style={[styles.emailSendBtn, sendingEmail && styles.emailSendBtnDisabled]}
                    onPress={handleSendReceipt}
                    disabled={sendingEmail}
                  >
                    {sendingEmail ? (
                      <ActivityIndicator color={C.white} />
                    ) : (
                      <Text style={styles.emailSendBtnText}>Skicka kvitto</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  // SCREEN: Idle - Just logo and store name centered (no active order)
  // Show idle screen when state is idle OR when there's no QR and no items
  const isIdle = state === 'paired_idle' || (!showQR && !hasItems);
  
  if (isIdle && !showQR) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        
        {/* Small unpair button in corner */}
        <TouchableOpacity onPress={handleUnpair} style={styles.unpairBtnCorner}>
          <Ionicons name="close-circle-outline" size={24} color={C.textMut} />
        </TouchableOpacity>

        {/* Centered logo and store name */}
        <View style={styles.idleFullScreen}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.idleLogo} resizeMode="contain" />
          ) : (
            <View style={styles.idleLogoPlaceholder}>
              <Ionicons name="storefront" size={80} color={C.green} />
            </View>
          )}
          <Text style={styles.idleStoreName}>{storeName || 'Välkommen!'}</Text>
        </View>
      </View>
    );
  }

  // SCREEN: Paired display (idle or waiting)
  // Portrait: Header -> QR -> Cart (top to bottom)
  // Landscape: Header on top, then Cart left | QR right
  
  if (isLandscape) {
    // LANDSCAPE LAYOUT
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {logoUrl && (
              <Image source={{ uri: logoUrl }} style={styles.headerLogo} resizeMode="contain" />
            )}
            <Text style={styles.storeNameText}>{storeName || 'QR-Kassan'}</Text>
          </View>
          <TouchableOpacity onPress={handleUnpair} style={styles.unpairBtn}>
            <Ionicons name="close-circle-outline" size={24} color={C.textMut} />
          </TouchableOpacity>
        </View>

        {/* Main Content - Cart left, QR right */}
        <View style={styles.landscapeContent}>
          {/* Cart Section - LEFT */}
          <View style={styles.landscapeCart}>
            <Text style={styles.cartTitle}>Din order</Text>
            <ScrollView style={styles.cartScroll} showsVerticalScrollIndicator={false}>
              {items.map((item, idx) => (
                <View key={idx} style={styles.cartItem}>
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemQty}>{item.quantity}x</Text>
                    <Text style={styles.itemName}>{item.name}</Text>
                  </View>
                  <Text style={styles.itemPrice}>{item.price * item.quantity} kr</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Totalt att betala</Text>
              <Text style={styles.totalValue}>{total} kr</Text>
            </View>
          </View>

          {/* QR Section - RIGHT */}
          <View style={styles.landscapeQR}>
            <Text style={styles.qrTitle}>Betala med Swish</Text>
            <View style={[styles.qrBoxLandscape, { width: Math.min(height * 0.5, 350), height: Math.min(height * 0.5, 350) }]}>
              {qrLoadError ? (
                <View style={styles.qrErrorContainer}>
                  <Ionicons name="qr-code-outline" size={80} color={C.green} />
                  <Text style={styles.qrErrorText}>QR-kod kunde inte laddas</Text>
                  <TouchableOpacity onPress={() => setQrLoadError(false)} style={styles.qrRetryBtn}>
                    <Text style={styles.qrRetryText}>Försök igen</Text>
                  </TouchableOpacity>
                </View>
              ) : displayData?.qr_code_url ? (
                <Image 
                  source={{ uri: displayData.qr_code_url }} 
                  style={styles.qrImageLandscape}
                  resizeMode="contain"
                  onError={() => setQrLoadError(true)}
                />
              ) : qrData ? (
                <Image 
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=H&data=${encodeURIComponent(qrData)}` }} 
                  style={styles.qrImageLandscape}
                  resizeMode="contain"
                  onError={() => setQrLoadError(true)}
                />
              ) : (
                <ActivityIndicator size="large" color={C.green} />
              )}
            </View>
            <Text style={styles.qrAmount}>{total} kr</Text>
            <Text style={styles.qrHint}>Skanna med Swish-appen</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // PORTRAIT LAYOUT
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.headerPortrait}>
        <View style={styles.headerLeft}>
          {logoUrl && (
            <Image source={{ uri: logoUrl }} style={styles.headerLogo} resizeMode="contain" />
          )}
          <Text style={styles.storeNameText}>{storeName || 'QR-Kassan'}</Text>
        </View>
        <TouchableOpacity onPress={handleUnpair} style={styles.unpairBtn}>
          <Ionicons name="close-circle-outline" size={24} color={C.textMut} />
        </TouchableOpacity>
      </View>

      {/* QR Section - TOP */}
      <View style={styles.portraitQR}>
        <Text style={styles.qrTitleSmall}>Betala med Swish</Text>
        <View style={[styles.qrBoxPortrait, { width: Math.min(width * 0.5, 220), height: Math.min(width * 0.5, 220) }]}>
          {qrLoadError ? (
            <View style={styles.qrErrorContainer}>
              <Ionicons name="qr-code-outline" size={60} color={C.green} />
              <Text style={styles.qrErrorTextSmall}>QR-kod kunde inte laddas</Text>
              <TouchableOpacity onPress={() => setQrLoadError(false)} style={styles.qrRetryBtnSmall}>
                <Text style={styles.qrRetryText}>Försök igen</Text>
              </TouchableOpacity>
            </View>
          ) : displayData?.qr_code_url ? (
            <Image 
              source={{ uri: displayData.qr_code_url }} 
              style={styles.qrImagePortrait}
              resizeMode="contain"
              onError={() => setQrLoadError(true)}
            />
          ) : qrData ? (
            <Image 
              source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrData)}` }} 
              style={styles.qrImagePortrait}
              resizeMode="contain"
              onError={() => setQrLoadError(true)}
            />
          ) : (
            <ActivityIndicator size="large" color={C.green} />
          )}
        </View>
        <Text style={styles.qrAmountSmall}>{total} kr</Text>
        <Text style={styles.qrHintSmall}>Skanna med Swish-appen</Text>
      </View>

      {/* Cart Section - BOTTOM */}
      <View style={styles.portraitCart}>
        <Text style={styles.cartTitle}>Din order</Text>
        <ScrollView style={styles.cartScrollPortrait} showsVerticalScrollIndicator={false}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.cartItem}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemQty}>{item.quantity}x</Text>
                <Text style={styles.itemName}>{item.name}</Text>
              </View>
              <Text style={styles.itemPrice}>{item.price * item.quantity} kr</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Totalt att betala</Text>
          <Text style={styles.totalValue}>{total} kr</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

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
  orange: '#f97316',
  white: '#ffffff',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  statusText: {
    color: C.textSec,
    fontSize: 16,
    marginTop: 16,
  },
  
  // Error screen
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
    marginTop: 16,
  },
  errorText: {
    color: C.textMut,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.green,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 24,
  },
  retryBtnText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Unpaired screen
  unpairedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
    marginTop: 16,
  },
  unpairedText: {
    color: C.textMut,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  
  // Pairing screen
  pairIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: 'rgba(34,197,94,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  
  // Reconnecting screen
  reconnectIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: 'rgba(249,115,22,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  reconnectTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: C.orange,
    marginBottom: 8,
  },
  reconnectSubtitle: {
    color: C.textSec,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  
  pairTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  pairSubtitle: {
    fontSize: 16,
    color: C.textMut,
    textAlign: 'center',
    marginBottom: 32,
  },
  codeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  codeDigit: {
    width: 64,
    height: 80,
    backgroundColor: C.surface,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.green,
  },
  codeDigitText: {
    fontSize: 36,
    fontWeight: '800',
    color: C.green,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  waitingText: {
    color: C.textSec,
    fontSize: 14,
  },
  newCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  newCodeBtnText: {
    color: C.textSec,
    fontSize: 14,
  },
  versionText: {
    color: '#4a4a4a',
    fontSize: 12,
    marginTop: 24,
    textAlign: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  storeNameText: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
  },
  unpairBtn: {
    padding: 8,
  },
  unpairBtnCorner: {
    position: 'absolute',
    top: 60,
    right: 20,
    padding: 8,
    zIndex: 10,
  },

  // Idle full screen (no order)
  idleFullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  idleLogo: {
    width: 200,
    height: 200,
    borderRadius: 24,
    marginBottom: 24,
  },
  idleLogoPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 24,
    backgroundColor: 'rgba(34,197,94,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  idleStoreName: {
    fontSize: 36,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },

  // QR Error handling
  qrErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  qrErrorText: {
    color: C.textSec,
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  qrErrorTextSmall: {
    color: C.textSec,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  qrRetryBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: C.green,
    borderRadius: 8,
  },
  qrRetryBtnSmall: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: C.green,
    borderRadius: 6,
  },
  qrRetryText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '600',
  },

  // Main content
  mainContent: {
    flex: 1,
    flexDirection: 'column-reverse',
  },
  mainContentLandscape: {
    flexDirection: 'row',
  },

  // LANDSCAPE LAYOUT
  landscapeContent: {
    flex: 1,
    flexDirection: 'row',
  },
  landscapeCart: {
    flex: 1,
    backgroundColor: C.surface,
    padding: 20,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
  },
  landscapeQR: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrBoxLandscape: {
    backgroundColor: C.white,
    padding: 20,
    borderRadius: 24,
    marginVertical: 16,
    // Size set dynamically in component
  },
  qrImageLandscape: {
    width: '100%',
    height: '100%',
  },

  // PORTRAIT LAYOUT
  headerPortrait: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  portraitQR: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  qrBoxPortrait: {
    backgroundColor: C.white,
    padding: 12,
    borderRadius: 16,
    marginVertical: 8,
    // Size set dynamically in component
  },
  qrImagePortrait: {
    width: '100%',
    height: '100%',
  },
  qrTitleSmall: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  qrAmountSmall: {
    fontSize: 28,
    fontWeight: '700',
    color: C.green,
  },
  qrHintSmall: {
    fontSize: 12,
    color: C.textMut,
  },
  portraitCart: {
    flex: 1,
    backgroundColor: C.surface,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  cartScrollPortrait: {
    flex: 1,
  },

  // Cart section (shared)
  cartSection: {
    backgroundColor: C.surface,
    padding: 16,
  },
  cartSectionPortrait: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  cartSectionLandscape: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
  },
  cartScroll: {
    flex: 1,
  },
  cartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
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
    color: C.green,
    fontWeight: '600',
    marginRight: 8,
    minWidth: 32,
  },
  itemName: {
    fontSize: 16,
    color: C.text,
    flex: 1,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: C.green,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: C.green,
  },
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCartText: {
    fontSize: 16,
    color: C.textMut,
    marginTop: 12,
  },

  // QR section
  qrSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrSectionPortrait: {},
  qrSectionLandscape: {
    paddingHorizontal: 40,
  },
  qrContainer: {
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: C.text,
    marginBottom: 16,
  },
  qrBox: {
    backgroundColor: C.white,
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    width: '90%',
    maxWidth: 350,
    aspectRatio: 1,
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  qrAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: C.green,
    marginBottom: 8,
  },
  qrHint: {
    fontSize: 15,
    color: C.textMut,
  },

  // Idle state
  idleContainer: {
    alignItems: 'center',
  },
  idleTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    marginTop: 16,
  },
  idleSubtitle: {
    fontSize: 16,
    color: C.textMut,
    marginTop: 8,
    textAlign: 'center',
  },
  centerLogo: {
    width: 150,
    height: 150,
    borderRadius: 20,
  },

  // Thank you screen
  thankYouScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  thankYouCheckCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.green,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  thankYouCheckCircleAnimated: {
    transform: [{ scale: 1.1 }],
  },
  thankYouTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  thankYouAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: C.green,
    marginBottom: 8,
  },
  thankYouSubtitle: {
    fontSize: 18,
    color: C.textSec,
    marginBottom: 32,
  },
  thankYouCountdown: {
    fontSize: 14,
    color: C.textMut,
    marginTop: 24,
  },
  
  // Email receipt button on thank you screen
  emailReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.green,
  },
  emailReceiptBtnText: {
    color: C.green,
    fontSize: 16,
    fontWeight: '600',
  },
  emailSentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emailSentText: {
    color: C.green,
    fontSize: 16,
    fontWeight: '500',
  },

  // Email modal
  emailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emailModalContent: {
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  emailModalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  emailModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  emailModalSubtitle: {
    fontSize: 14,
    color: C.textMut,
    marginBottom: 24,
    textAlign: 'center',
  },
  emailInput: {
    width: '100%',
    height: 56,
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    color: C.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  emailSendBtn: {
    width: '100%',
    height: 56,
    backgroundColor: C.green,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emailSendBtnDisabled: {
    opacity: 0.6,
  },
  emailSendBtnText: {
    color: C.white,
    fontSize: 18,
    fontWeight: '600',
  },
  emailModalSent: {
    alignItems: 'center',
    padding: 24,
  },
  emailModalSentTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
    marginTop: 16,
  },
  emailModalSentText: {
    fontSize: 14,
    color: C.textMut,
    marginTop: 8,
  },
});
