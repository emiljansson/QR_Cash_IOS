/**
 * Local-First Data Store
 * Prioritizes local data, syncs with server periodically
 * Reduces network traffic significantly
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import NetInfo from '@react-native-community/netinfo';

const CACHE_PREFIX = '@qrkassa_cache_';
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // Sync every 5 minutes
const CACHE_TTL_MS = 10 * 60 * 1000; // Cache valid for 10 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  userId: string;
}

interface SyncConfig {
  autoSync: boolean;
  syncInterval: number;
}

class LocalFirstStore {
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private lastSyncTime: { [key: string]: number } = {};
  private pendingChanges: any[] = [];
  private config: SyncConfig = {
    autoSync: true,
    syncInterval: SYNC_INTERVAL_MS,
  };

  // ==================== CACHE MANAGEMENT ====================

  private async getCache<T>(key: string, userId: string): Promise<T | null> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}_${userId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      
      if (cached) {
        const entry: CacheEntry<T> = JSON.parse(cached);
        const age = Date.now() - entry.timestamp;
        
        // Return cached data regardless of age (local-first)
        // Age check is only for deciding when to background sync
        return entry.data;
      }
      return null;
    } catch (e) {
      console.error('[LocalFirst] Cache read error:', e);
      return null;
    }
  }

  private async setCache<T>(key: string, userId: string, data: T): Promise<void> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}_${userId}`;
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        userId,
      };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (e) {
      console.error('[LocalFirst] Cache write error:', e);
    }
  }

  private async getCacheAge(key: string, userId: string): Promise<number> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}_${userId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const entry = JSON.parse(cached);
        return Date.now() - entry.timestamp;
      }
      return Infinity;
    } catch {
      return Infinity;
    }
  }

  // ==================== PRODUCTS ====================

  async getProducts(userId: string, activeOnly: boolean = false): Promise<any[]> {
    // 1. Return cached data immediately
    const cacheKey = activeOnly ? 'products_active' : 'products';
    const cached = await this.getCache<any[]>(cacheKey, userId);
    
    if (cached) {
      // Check if we should background sync
      const age = await this.getCacheAge(cacheKey, userId);
      if (age > CACHE_TTL_MS) {
        this.backgroundSyncProducts(userId, activeOnly);
      }
      return cached;
    }

    // 2. No cache - fetch from server
    try {
      const products = await api.getProducts(activeOnly);
      await this.setCache(cacheKey, userId, products);
      return products;
    } catch (e) {
      console.error('[LocalFirst] Failed to fetch products:', e);
      return [];
    }
  }

  private async backgroundSyncProducts(userId: string, activeOnly: boolean): Promise<void> {
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) return;

    try {
      const products = await api.getProducts(activeOnly);
      const cacheKey = activeOnly ? 'products_active' : 'products';
      await this.setCache(cacheKey, userId, products);
      console.log('[LocalFirst] Background synced products');
    } catch (e) {
      console.log('[LocalFirst] Background sync failed, using cached data');
    }
  }

  // ==================== SETTINGS ====================

  async getSettings(userId: string): Promise<any> {
    const cached = await this.getCache<any>('settings', userId);
    
    if (cached) {
      const age = await this.getCacheAge('settings', userId);
      if (age > CACHE_TTL_MS) {
        this.backgroundSyncSettings(userId);
      }
      return cached;
    }

    try {
      const settings = await api.getSettings();
      await this.setCache('settings', userId, settings);
      return settings;
    } catch (e) {
      return {};
    }
  }

  private async backgroundSyncSettings(userId: string): Promise<void> {
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) return;

    try {
      const settings = await api.getSettings();
      await this.setCache('settings', userId, settings);
    } catch {}
  }

  // ==================== ORDERS ====================

  async getOrders(userId: string, limit: number = 50): Promise<any[]> {
    const cached = await this.getCache<any[]>('orders', userId);
    
    if (cached) {
      const age = await this.getCacheAge('orders', userId);
      if (age > CACHE_TTL_MS) {
        this.backgroundSyncOrders(userId, limit);
      }
      return cached;
    }

    try {
      const orders = await api.getOrders(limit);
      await this.setCache('orders', userId, orders);
      return orders;
    } catch (e) {
      return [];
    }
  }

  private async backgroundSyncOrders(userId: string, limit: number): Promise<void> {
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) return;

    try {
      const orders = await api.getOrders(limit);
      await this.setCache('orders', userId, orders);
    } catch {}
  }

  // ==================== PARKED CARTS ====================

  async getParkedCarts(userId: string): Promise<any[]> {
    const cached = await this.getCache<any[]>('parked_carts', userId);
    
    if (cached) {
      const age = await this.getCacheAge('parked_carts', userId);
      if (age > CACHE_TTL_MS) {
        this.backgroundSyncParkedCarts(userId);
      }
      return cached;
    }

    try {
      const carts = await api.getParkedCarts();
      await this.setCache('parked_carts', userId, carts);
      return carts;
    } catch (e) {
      return [];
    }
  }

  private async backgroundSyncParkedCarts(userId: string): Promise<void> {
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) return;

    try {
      const carts = await api.getParkedCarts();
      await this.setCache('parked_carts', userId, carts);
    } catch {}
  }

  // ==================== CREATE OPERATIONS (Offline-capable) ====================

  async createOrder(userId: string, orderData: any): Promise<any> {
    // Add to pending if offline
    const networkState = await NetInfo.fetch();
    
    if (!networkState.isConnected) {
      // Store locally with pending flag
      const localOrder = {
        ...orderData,
        id: `local_${Date.now()}`,
        status: 'pending_sync',
        created_at: new Date().toISOString(),
      };
      
      // Add to local orders cache
      const orders = await this.getCache<any[]>('orders', userId) || [];
      orders.unshift(localOrder);
      await this.setCache('orders', userId, orders);
      
      // Add to sync queue
      this.pendingChanges.push({
        type: 'create_order',
        data: orderData,
        timestamp: Date.now(),
      });
      await this.savePendingChanges();
      
      return localOrder;
    }

    // Online - create directly
    try {
      const order = await api.createOrder(orderData);
      
      // Update local cache
      const orders = await this.getCache<any[]>('orders', userId) || [];
      orders.unshift(order);
      await this.setCache('orders', userId, orders);
      
      return order;
    } catch (e) {
      throw e;
    }
  }

  // ==================== SYNC MANAGEMENT ====================

  async forceSyncAll(userId: string): Promise<void> {
    console.log('[LocalFirst] Force syncing all data...');
    
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) {
      console.log('[LocalFirst] Offline - cannot sync');
      return;
    }

    try {
      // Sync all data types in parallel
      const [products, settings, orders, carts] = await Promise.all([
        api.getProducts(false),
        api.getSettings(),
        api.getOrders(100),
        api.getParkedCarts(),
      ]);

      await Promise.all([
        this.setCache('products', userId, products),
        this.setCache('products_active', userId, products.filter((p: any) => p.active !== false)),
        this.setCache('settings', userId, settings),
        this.setCache('orders', userId, orders),
        this.setCache('parked_carts', userId, carts),
      ]);

      // Process pending changes
      await this.processPendingChanges();

      console.log('[LocalFirst] Sync completed');
    } catch (e) {
      console.error('[LocalFirst] Sync failed:', e);
    }
  }

  private async savePendingChanges(): Promise<void> {
    await AsyncStorage.setItem(
      `${CACHE_PREFIX}pending_changes`,
      JSON.stringify(this.pendingChanges)
    );
  }

  private async loadPendingChanges(): Promise<void> {
    try {
      const pending = await AsyncStorage.getItem(`${CACHE_PREFIX}pending_changes`);
      this.pendingChanges = pending ? JSON.parse(pending) : [];
    } catch {
      this.pendingChanges = [];
    }
  }

  private async processPendingChanges(): Promise<void> {
    await this.loadPendingChanges();
    
    if (this.pendingChanges.length === 0) return;

    console.log(`[LocalFirst] Processing ${this.pendingChanges.length} pending changes`);
    
    const remaining: any[] = [];
    
    for (const change of this.pendingChanges) {
      try {
        if (change.type === 'create_order') {
          await api.createOrder(change.data);
        }
        // Add other change types as needed
      } catch (e) {
        console.error('[LocalFirst] Failed to sync change:', e);
        remaining.push(change);
      }
    }

    this.pendingChanges = remaining;
    await this.savePendingChanges();
  }

  // ==================== CACHE INVALIDATION ====================

  async invalidateCache(key: string, userId: string): Promise<void> {
    const cacheKey = `${CACHE_PREFIX}${key}_${userId}`;
    await AsyncStorage.removeItem(cacheKey);
  }

  async clearAllCache(userId: string): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => 
      k.startsWith(CACHE_PREFIX) && k.includes(userId)
    );
    await AsyncStorage.multiRemove(cacheKeys);
  }

  // ==================== AUTO SYNC ====================

  startAutoSync(userId: string): void {
    if (this.syncTimer) return;
    
    this.syncTimer = setInterval(() => {
      this.forceSyncAll(userId);
    }, this.config.syncInterval);
    
    console.log(`[LocalFirst] Auto-sync started (every ${this.config.syncInterval / 1000}s)`);
  }

  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('[LocalFirst] Auto-sync stopped');
    }
  }

  setSyncInterval(ms: number): void {
    this.config.syncInterval = ms;
    if (this.syncTimer) {
      // Restart with new interval
      this.stopAutoSync();
      // Will be restarted by component
    }
  }
}

// Singleton instance
export const localStore = new LocalFirstStore();
