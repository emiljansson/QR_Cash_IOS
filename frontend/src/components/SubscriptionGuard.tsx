/**
 * Subscription Guard Component
 * 
 * Blocks access to the app if subscription is not active.
 * Shows a paywall screen instead.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, Linking, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../utils/colors';
import revenueCat, { SubscriptionStatus, ENTITLEMENT_ID } from '../services/revenuecat';
import { commhub } from '../services/commhub';

interface SubscriptionGuardProps {
  children: React.ReactNode;
  userId?: string;
  // Grace period in days - allow usage after expiration
  gracePeriodDays?: number;
  // If true, only check database status (faster, works offline)
  offlineMode?: boolean;
}

export function SubscriptionGuard({ 
  children, 
  userId,
  gracePeriodDays = 7,
  offlineMode = false,
}: SubscriptionGuardProps) {
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

  useEffect(() => {
    checkSubscription();
  }, [userId]);

  const checkSubscription = async () => {
    setLoading(true);
    
    try {
      // Query ALL users with subscription_active = true and check if current user's email matches
      const cachedUser = await commhub.getCurrentUser();
      console.log('[SubscriptionGuard] Checking subscription for:', cachedUser?.email);
      
      if (cachedUser?.email) {
        // Direct query to database for this specific email
        const users = await commhub.query('qr_users', { email: cachedUser.email.toLowerCase() }, { limit: 1 });
        const userFromDb = users[0];
        
        console.log('[SubscriptionGuard] Found user in DB:', userFromDb?.email, 'subscription_active:', userFromDb?.subscription_active);
        
        if (userFromDb?.subscription_active === true) {
          console.log('[SubscriptionGuard] ✅ Subscription active!');
          setIsActive(true);
          setLoading(false);
          return;
        }
      }
      
      // Fallback: check cached user
      if (cachedUser?.subscription_active === true) {
        console.log('[SubscriptionGuard] ✅ Cached subscription active!');
        setIsActive(true);
        setLoading(false);
        return;
      }

      // Last resort: Check RevenueCat
      try {
        await revenueCat.initialize(userId);
        const rcStatus = await revenueCat.checkSubscriptionStatus();
        if (rcStatus.isActive) {
          console.log('[SubscriptionGuard] ✅ RevenueCat subscription active!');
          setIsActive(true);
        }
      } catch (e) {
        console.log('[SubscriptionGuard] RevenueCat check failed:', e);
      }
    } catch (error) {
      console.error('[SubscriptionGuard] Error:', error);
      // On error, allow access (fail open for better UX during issues)
      setIsActive(true);
    } finally {
      setLoading(false);
    }
  };

  const syncSubscriptionToDatabase = async (userId: string, status: SubscriptionStatus) => {
    try {
      await commhub.updateCurrentUser({
        subscription_active: status.isActive,
        subscription_end: status.expirationDate || undefined,
        subscription_product: status.productIdentifier || undefined,
      });
      console.log('[SubscriptionGuard] Synced subscription to database');
    } catch (error) {
      console.error('[SubscriptionGuard] Failed to sync subscription:', error);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await revenueCat.restorePurchases();
      if (result.hasActiveSubscription) {
        await checkSubscription();
      } else {
        // Show message
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleManageSubscription = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Kontrollerar prenumeration...</Text>
      </View>
    );
  }

  // Subscription is active - render children
  if (isActive) {
    return (
      <>
        {daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0 && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={16} color="#92400e" />
            <Text style={styles.warningText}>
              Din prenumeration går ut om {daysRemaining} {daysRemaining === 1 ? 'dag' : 'dagar'}
            </Text>
          </View>
        )}
        {daysRemaining !== null && daysRemaining < 0 && (
          <View style={styles.graceBanner}>
            <Ionicons name="time" size={16} color="#dc2626" />
            <Text style={styles.graceText}>
              Grace period: {Math.abs(daysRemaining)} {Math.abs(daysRemaining) === 1 ? 'dag' : 'dagar'} kvar
            </Text>
          </View>
        )}
        {children}
      </>
    );
  }

  // Subscription not active - show paywall
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.paywallContent}>
      <View style={styles.iconContainer}>
        <Ionicons name="lock-closed" size={64} color={Colors.primary} />
      </View>
      
      <Text style={styles.title}>Prenumeration krävs</Text>
      <Text style={styles.subtitle}>
        För att fortsätta använda QR-Kassan behöver du en aktiv prenumeration.
      </Text>

      <View style={styles.featuresBox}>
        <Text style={styles.featuresTitle}>Med QR-Kassan Pro får du:</Text>
        {[
          'Obegränsade Swish-betalningar',
          'Statistik & rapporter',
          'Flera användare/kassor',
          'Offline-läge',
          'Digitala kvitton',
          'Prioriterad support',
        ].map((feature, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity 
        style={styles.subscribeButton}
        onPress={handleManageSubscription}
      >
        <Ionicons name="card" size={24} color="#fff" />
        <Text style={styles.subscribeButtonText}>Prenumerera nu</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.restoreButton}
        onPress={handleRestore}
        disabled={restoring}
      >
        {restoring ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Text style={styles.restoreButtonText}>Återställ tidigare köp</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.helpText}>
        Har du frågor? Kontakta oss på{' '}
        <Text 
          style={styles.helpLink}
          onPress={() => Linking.openURL('mailto:support@frontproduction.se')}
        >
          support@frontproduction.se
        </Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  paywallContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 300,
    lineHeight: 24,
  },
  featuresBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  featureText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  restoreButton: {
    paddingVertical: 16,
    marginTop: 8,
  },
  restoreButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  helpText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
  helpLink: {
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  warningText: {
    color: '#92400e',
    fontSize: 14,
    fontWeight: '500',
  },
  graceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  graceText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default SubscriptionGuard;
