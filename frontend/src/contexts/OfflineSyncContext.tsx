/**
 * Offline Sync Context
 * Provides offline-first data access and sync status to the app
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { syncService } from '../services/syncService';
import * as OfflineDB from '../services/offlineDatabase';
import { useAuth } from './AuthContext';

interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  networkStatus: 'online' | 'offline' | 'unknown';
  lastSyncTime: string | null;
  pendingOperations: number;
  error: string | null;
}

interface OfflineSyncContextType {
  // Sync state
  syncState: SyncState;
  isOnline: boolean;
  
  // Sync actions
  syncNow: () => Promise<void>;
  
  // Products (offline-first)
  products: OfflineDB.LocalProduct[];
  loadProducts: () => Promise<void>;
  createProduct: (product: Omit<OfflineDB.LocalProduct, 'id' | 'synced' | 'deleted' | 'user_id'>) => Promise<void>;
  updateProduct: (productId: string, updates: Partial<OfflineDB.LocalProduct>) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  
  // Orders (offline-first)
  orders: OfflineDB.LocalOrder[];
  loadOrders: () => Promise<void>;
  createOrder: (order: Omit<OfflineDB.LocalOrder, 'id' | 'synced' | 'user_id'>) => Promise<void>;
  
  // Parked Carts (offline-first)
  parkedCarts: OfflineDB.LocalParkedCart[];
  loadParkedCarts: () => Promise<void>;
  createParkedCart: (cart: Omit<OfflineDB.LocalParkedCart, 'id' | 'synced' | 'user_id'>) => Promise<void>;
  deleteParkedCart: (cartId: string) => Promise<void>;
  
  // Loading states
  isLoadingProducts: boolean;
  isLoadingOrders: boolean;
  isLoadingParkedCarts: boolean;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(undefined);

// Generate unique ID
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.user_id || '';

  // Sync state
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    networkStatus: 'unknown',
    lastSyncTime: null,
    pendingOperations: 0,
    error: null,
  });

  // Data state
  const [products, setProducts] = useState<OfflineDB.LocalProduct[]>([]);
  const [orders, setOrders] = useState<OfflineDB.LocalOrder[]>([]);
  const [parkedCarts, setParkedCarts] = useState<OfflineDB.LocalParkedCart[]>([]);

  // Loading states
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingParkedCarts, setIsLoadingParkedCarts] = useState(false);

  // Initialize sync service
  useEffect(() => {
    syncService.initialize();

    const unsubscribe = syncService.subscribe((state) => {
      setSyncState(state);
    });

    return () => {
      unsubscribe();
      syncService.destroy();
    };
  }, []);

  // Initial data load when user changes
  useEffect(() => {
    if (userId) {
      loadProducts();
      loadOrders();
      loadParkedCarts();
      
      // Trigger initial sync
      syncService.syncAll(userId);
    }
  }, [userId]);

  // ==================== PRODUCTS ====================

  const loadProducts = useCallback(async () => {
    if (!userId) return;
    
    setIsLoadingProducts(true);
    try {
      const localProducts = await OfflineDB.getLocalProducts(userId);
      setProducts(localProducts);
    } catch (error) {
      console.error('[OfflineSync] Failed to load products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [userId]);

  const createProduct = useCallback(async (
    productData: Omit<OfflineDB.LocalProduct, 'id' | 'synced' | 'deleted' | 'user_id'>
  ) => {
    if (!userId) return;

    const product: OfflineDB.LocalProduct = {
      ...productData,
      id: generateId(),
      user_id: userId,
      synced: false,
      deleted: false,
      created_at: new Date().toISOString(),
    };

    await syncService.createProduct(product);
    await loadProducts();
  }, [userId, loadProducts]);

  const updateProduct = useCallback(async (productId: string, updates: Partial<OfflineDB.LocalProduct>) => {
    if (!userId) return;

    await syncService.updateProduct(productId, { ...updates, user_id: userId });
    await loadProducts();
  }, [userId, loadProducts]);

  const deleteProduct = useCallback(async (productId: string) => {
    await syncService.deleteProduct(productId);
    await loadProducts();
  }, [loadProducts]);

  // ==================== ORDERS ====================

  const loadOrders = useCallback(async () => {
    if (!userId) return;

    setIsLoadingOrders(true);
    try {
      const localOrders = await OfflineDB.getLocalOrders(userId);
      setOrders(localOrders);
    } catch (error) {
      console.error('[OfflineSync] Failed to load orders:', error);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [userId]);

  const createOrder = useCallback(async (
    orderData: Omit<OfflineDB.LocalOrder, 'id' | 'synced' | 'user_id'>
  ) => {
    if (!userId) return;

    const order: OfflineDB.LocalOrder = {
      ...orderData,
      id: generateId(),
      user_id: userId,
      synced: false,
      created_at: new Date().toISOString(),
    };

    await syncService.createOrder(order);
    await loadOrders();
  }, [userId, loadOrders]);

  // ==================== PARKED CARTS ====================

  const loadParkedCarts = useCallback(async () => {
    if (!userId) return;

    setIsLoadingParkedCarts(true);
    try {
      const localCarts = await OfflineDB.getLocalParkedCarts(userId);
      setParkedCarts(localCarts);
    } catch (error) {
      console.error('[OfflineSync] Failed to load parked carts:', error);
    } finally {
      setIsLoadingParkedCarts(false);
    }
  }, [userId]);

  const createParkedCart = useCallback(async (
    cartData: Omit<OfflineDB.LocalParkedCart, 'id' | 'synced' | 'user_id'>
  ) => {
    if (!userId) return;

    const cart: OfflineDB.LocalParkedCart = {
      ...cartData,
      id: generateId(),
      user_id: userId,
      synced: false,
      created_at: new Date().toISOString(),
    };

    await syncService.createParkedCart(cart);
    await loadParkedCarts();
  }, [userId, loadParkedCarts]);

  const deleteParkedCart = useCallback(async (cartId: string) => {
    await syncService.deleteParkedCart(cartId);
    await loadParkedCarts();
  }, [loadParkedCarts]);

  // ==================== SYNC ====================

  const syncNow = useCallback(async () => {
    if (userId) {
      await syncService.syncAll(userId);
      // Reload all data after sync
      await loadProducts();
      await loadOrders();
      await loadParkedCarts();
    }
  }, [userId, loadProducts, loadOrders, loadParkedCarts]);

  const value: OfflineSyncContextType = {
    syncState,
    isOnline: syncState.networkStatus === 'online',
    syncNow,
    products,
    loadProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    orders,
    loadOrders,
    createOrder,
    parkedCarts,
    loadParkedCarts,
    createParkedCart,
    deleteParkedCart,
    isLoadingProducts,
    isLoadingOrders,
    isLoadingParkedCarts,
  };

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);
  if (context === undefined) {
    throw new Error('useOfflineSync must be used within an OfflineSyncProvider');
  }
  return context;
}
