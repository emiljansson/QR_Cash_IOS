/**
 * RevenueCat Service for In-App Purchases
 * 
 * SETUP REQUIRED:
 * 1. Create account at https://www.revenuecat.com
 * 2. Create project and connect App Store Connect / Google Play Console
 * 3. Create products: qrkassan_monthly, qrkassan_6months, qrkassan_yearly
 * 4. Create entitlement: "pro"
 * 5. Replace API keys below with your keys from RevenueCat Dashboard
 */

import { Platform } from 'react-native';
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  PurchasesError,
} from 'react-native-purchases';

// ⚠️ REPLACE THESE WITH YOUR REVENUECAT API KEYS
const REVENUECAT_IOS_KEY = 'YOUR_REVENUECAT_IOS_API_KEY';
const REVENUECAT_ANDROID_KEY = 'YOUR_REVENUECAT_ANDROID_API_KEY';

// Entitlement identifier (create this in RevenueCat Dashboard)
export const ENTITLEMENT_ID = 'pro';

// Product identifiers (must match App Store Connect / Google Play Console)
export const PRODUCT_IDS = {
  MONTHLY: 'qrkassan_monthly',
  SIX_MONTHS: 'qrkassan_6months',
  YEARLY: 'qrkassan_yearly',
};

export interface SubscriptionPackage {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    price: number;
    priceString: string;
    currencyCode: string;
  };
  originalPackage: PurchasesPackage;
}

export interface SubscriptionStatus {
  isActive: boolean;
  expirationDate: string | null;
  productIdentifier: string | null;
  willRenew: boolean;
}

class RevenueCatService {
  private initialized = false;
  private customerInfo: CustomerInfo | null = null;

  /**
   * Initialize RevenueCat SDK
   * Call this once when app starts
   */
  async initialize(userId?: string): Promise<void> {
    if (this.initialized) {
      console.log('[RevenueCat] Already initialized');
      return;
    }

    try {
      // Enable debug logs in development
      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }

      const apiKey = Platform.select({
        ios: REVENUECAT_IOS_KEY,
        android: REVENUECAT_ANDROID_KEY,
        default: REVENUECAT_IOS_KEY,
      });

      if (apiKey.startsWith('YOUR_')) {
        console.warn('[RevenueCat] ⚠️ API key not configured! Replace placeholder in revenuecat.ts');
        return;
      }

      // Configure with optional user ID for cross-device sync
      if (userId) {
        await Purchases.configure({ apiKey, appUserID: userId });
      } else {
        await Purchases.configure({ apiKey });
      }

      this.initialized = true;
      console.log('[RevenueCat] Initialized successfully');

      // Get initial customer info
      this.customerInfo = await Purchases.getCustomerInfo();
    } catch (error) {
      console.error('[RevenueCat] Initialization error:', error);
    }
  }

  /**
   * Login user to RevenueCat (for cross-device subscription sync)
   */
  async login(userId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize(userId);
      return;
    }

    try {
      const { customerInfo } = await Purchases.logIn(userId);
      this.customerInfo = customerInfo;
      console.log('[RevenueCat] Logged in user:', userId);
    } catch (error) {
      console.error('[RevenueCat] Login error:', error);
    }
  }

  /**
   * Logout user from RevenueCat
   */
  async logout(): Promise<void> {
    try {
      this.customerInfo = await Purchases.logOut();
      console.log('[RevenueCat] Logged out');
    } catch (error) {
      console.error('[RevenueCat] Logout error:', error);
    }
  }

  /**
   * Get available subscription packages
   */
  async getPackages(): Promise<SubscriptionPackage[]> {
    if (!this.initialized) {
      console.warn('[RevenueCat] Not initialized');
      return [];
    }

    try {
      const offerings = await Purchases.getOfferings();
      
      if (!offerings.current?.availablePackages) {
        console.log('[RevenueCat] No offerings available');
        return [];
      }

      return offerings.current.availablePackages.map((pkg) => ({
        identifier: pkg.identifier,
        packageType: pkg.packageType,
        product: {
          identifier: pkg.product.identifier,
          title: pkg.product.title,
          description: pkg.product.description,
          price: pkg.product.price,
          priceString: pkg.product.priceString,
          currencyCode: pkg.product.currencyCode,
        },
        originalPackage: pkg,
      }));
    } catch (error) {
      console.error('[RevenueCat] Get packages error:', error);
      return [];
    }
  }

  /**
   * Purchase a subscription package
   */
  async purchasePackage(pkg: SubscriptionPackage): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized) {
      return { success: false, error: 'RevenueCat inte initialiserat' };
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg.originalPackage);
      this.customerInfo = customerInfo;

      // Check if purchase granted the entitlement
      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        console.log('[RevenueCat] Purchase successful, entitlement active');
        return { success: true };
      }

      return { success: false, error: 'Köpet slutfördes men prenumerationen aktiverades inte' };
    } catch (error) {
      const purchaseError = error as PurchasesError;
      
      if (purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        return { success: false, error: 'Köpet avbröts' };
      }
      
      console.error('[RevenueCat] Purchase error:', error);
      return { success: false, error: purchaseError.message || 'Ett fel uppstod vid köpet' };
    }
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<{ success: boolean; hasActiveSubscription: boolean; error?: string }> {
    if (!this.initialized) {
      return { success: false, hasActiveSubscription: false, error: 'RevenueCat inte initialiserat' };
    }

    try {
      this.customerInfo = await Purchases.restorePurchases();
      const hasActive = !!this.customerInfo.entitlements.active[ENTITLEMENT_ID];
      
      console.log('[RevenueCat] Purchases restored, active:', hasActive);
      return { success: true, hasActiveSubscription: hasActive };
    } catch (error) {
      console.error('[RevenueCat] Restore error:', error);
      return { success: false, hasActiveSubscription: false, error: 'Kunde inte återställa köp' };
    }
  }

  /**
   * Check if user has active subscription
   */
  async checkSubscriptionStatus(): Promise<SubscriptionStatus> {
    if (!this.initialized) {
      return {
        isActive: false,
        expirationDate: null,
        productIdentifier: null,
        willRenew: false,
      };
    }

    try {
      this.customerInfo = await Purchases.getCustomerInfo();
      const entitlement = this.customerInfo.entitlements.active[ENTITLEMENT_ID];

      if (entitlement) {
        return {
          isActive: true,
          expirationDate: entitlement.expirationDate,
          productIdentifier: entitlement.productIdentifier,
          willRenew: entitlement.willRenew,
        };
      }

      return {
        isActive: false,
        expirationDate: null,
        productIdentifier: null,
        willRenew: false,
      };
    } catch (error) {
      console.error('[RevenueCat] Check status error:', error);
      return {
        isActive: false,
        expirationDate: null,
        productIdentifier: null,
        willRenew: false,
      };
    }
  }

  /**
   * Check if subscription is active (synchronous, uses cached data)
   */
  isSubscriptionActive(): boolean {
    if (!this.customerInfo) return false;
    return !!this.customerInfo.entitlements.active[ENTITLEMENT_ID];
  }

  /**
   * Get customer info (for debugging)
   */
  getCustomerInfo(): CustomerInfo | null {
    return this.customerInfo;
  }

  /**
   * Add listener for customer info updates
   */
  addCustomerInfoListener(listener: (info: CustomerInfo) => void): () => void {
    const remove = Purchases.addCustomerInfoUpdateListener((info) => {
      this.customerInfo = info;
      listener(info);
    });
    return remove;
  }
}

export const revenueCat = new RevenueCatService();
export default revenueCat;
