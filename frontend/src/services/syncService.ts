/**
 * Sync Service
 * Handles synchronization between local SQLite and remote API
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as OfflineDB from './offlineDatabase';
import { commhub as api } from '../services/commhub';

type SyncStatus = 'idle' | 'syncing' | 'error';
type NetworkStatus = 'online' | 'offline' | 'unknown';

interface SyncState {
  status: SyncStatus;
  networkStatus: NetworkStatus;
  lastSyncTime: string | null;
  pendingOperations: number;
  error: string | null;
}

class SyncService {
  private state: SyncState = {
    status: 'idle',
    networkStatus: 'unknown',
    lastSyncTime: null,
    pendingOperations: 0,
    error: null,
  };

  private listeners: Set<(state: SyncState) => void> = new Set();
  private syncInProgress = false;
  private networkUnsubscribe: (() => void) | null = null;

  // Initialize the sync service
  async initialize(): Promise<void> {
    console.log('[SyncService] Initializing...');

    // Get initial network state
    const networkState = await NetInfo.fetch();
    this.updateNetworkStatus(networkState);

    // Subscribe to network changes
    this.networkUnsubscribe = NetInfo.addEventListener((state) => {
      this.handleNetworkChange(state);
    });

    // Get pending operations count
    await this.updatePendingCount();

    // Get last sync time
    const lastSync = await OfflineDB.getSyncMetadata('lastSyncTime');
    if (lastSync) {
      this.state.lastSyncTime = lastSync;
    }

    console.log('[SyncService] Initialized', this.state);
  }

  // Cleanup
  destroy(): void {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
    }
  }

  // Subscribe to state changes
  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  // Notify listeners
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }

  // Update network status
  private updateNetworkStatus(state: NetInfoState): void {
    const wasOffline = this.state.networkStatus === 'offline';
    this.state.networkStatus = state.isConnected ? 'online' : 'offline';
    this.notifyListeners();

    // If we just came online, trigger sync
    if (wasOffline && state.isConnected) {
      console.log('[SyncService] Network restored, triggering sync...');
      this.syncAll();
    }
  }

  // Handle network changes
  private handleNetworkChange(state: NetInfoState): void {
    console.log('[SyncService] Network changed:', state.isConnected ? 'online' : 'offline');
    this.updateNetworkStatus(state);
  }

  // Update pending operations count
  private async updatePendingCount(): Promise<void> {
    this.state.pendingOperations = await OfflineDB.getSyncQueueCount();
    this.notifyListeners();
  }

  // Check if online
  isOnline(): boolean {
    return this.state.networkStatus === 'online';
  }

  // Get current state
  getState(): SyncState {
    return { ...this.state };
  }

  // ==================== SYNC OPERATIONS ====================

  // Full sync - pull from server and push local changes
  async syncAll(userId?: string): Promise<void> {
    if (this.syncInProgress) {
      console.log('[SyncService] Sync already in progress');
      return;
    }

    if (!this.isOnline()) {
      console.log('[SyncService] Offline, skipping sync');
      return;
    }

    this.syncInProgress = true;
    this.state.status = 'syncing';
    this.state.error = null;
    this.notifyListeners();

    try {
      // Process sync queue first (push local changes)
      await this.processSyncQueue();

      // Then pull fresh data from server
      if (userId) {
        await this.pullProducts(userId);
        await this.pullOrders(userId);
        await this.pullParkedCarts(userId);
      }

      // Update last sync time
      const now = new Date().toISOString();
      await OfflineDB.setSyncMetadata('lastSyncTime', now);
      this.state.lastSyncTime = now;

      this.state.status = 'idle';
      console.log('[SyncService] Sync completed');
    } catch (error: any) {
      console.error('[SyncService] Sync failed:', error);
      this.state.status = 'error';
      this.state.error = error.message || 'Sync failed';
    } finally {
      this.syncInProgress = false;
      await this.updatePendingCount();
      this.notifyListeners();
    }
  }

  // Process the sync queue
  async processSyncQueue(): Promise<void> {
    const queue = await OfflineDB.getSyncQueue();
    console.log(`[SyncService] Processing ${queue.length} queued operations`);

    for (const op of queue) {
      try {
        await this.processOperation(op);
        if (op.id) {
          await OfflineDB.removeSyncOperation(op.id);
        }
      } catch (error: any) {
        console.error(`[SyncService] Operation failed:`, op, error);
        if (op.id) {
          await OfflineDB.updateSyncOperationError(op.id, error.message);
        }
      }
    }

    await this.updatePendingCount();
  }

  // Process a single sync operation
  private async processOperation(op: OfflineDB.SyncOperation): Promise<void> {
    console.log(`[SyncService] Processing: ${op.operation} ${op.table_name}/${op.record_id}`);

    switch (op.table_name) {
      case 'products':
        await this.syncProductOperation(op);
        break;
      case 'orders':
        await this.syncOrderOperation(op);
        break;
      case 'parked_carts':
        await this.syncParkedCartOperation(op);
        break;
      default:
        console.warn(`[SyncService] Unknown table: ${op.table_name}`);
    }
  }

  // Sync product operation
  private async syncProductOperation(op: OfflineDB.SyncOperation): Promise<void> {
    switch (op.operation) {
      case 'CREATE':
        await api.createProduct(op.data);
        break;
      case 'UPDATE':
        await api.updateProduct(op.record_id, op.data);
        break;
      case 'DELETE':
        await api.deleteProduct(op.record_id);
        break;
    }
  }

  // Sync order operation
  private async syncOrderOperation(op: OfflineDB.SyncOperation): Promise<void> {
    switch (op.operation) {
      case 'CREATE':
        await api.createOrder(op.data);
        break;
      case 'UPDATE':
        await api.updateOrder(op.record_id, op.data);
        break;
    }
  }

  // Sync parked cart operation
  private async syncParkedCartOperation(op: OfflineDB.SyncOperation): Promise<void> {
    switch (op.operation) {
      case 'CREATE':
        await api.createParkedCart(op.data);
        break;
      case 'DELETE':
        await api.deleteParkedCart(op.record_id);
        break;
    }
  }

  // ==================== PULL FROM SERVER ====================

  async pullProducts(userId: string): Promise<void> {
    try {
      // Use CommHub API instead of legacy endpoint
      const products = await api.getProducts(false);
      const validProducts = Array.isArray(products) ? products : [];

      for (const product of validProducts) {
        await OfflineDB.saveLocalProduct({
          ...product,
          user_id: userId,
          synced: true,
          deleted: false,
        });
      }

      console.log(`[SyncService] Pulled ${validProducts.length} products`);
    } catch (error) {
      console.error('[SyncService] Failed to pull products:', error);
      throw error;
    }
  }

  async pullOrders(userId: string): Promise<void> {
    try {
      // Use CommHub API instead of legacy endpoint
      const orders = await api.getOrders(undefined, 100);
      const validOrders = Array.isArray(orders) ? orders : [];

      for (const order of validOrders) {
        await OfflineDB.saveLocalOrder({
          ...order,
          user_id: userId,
          synced: true,
        });
      }

      console.log(`[SyncService] Pulled ${validOrders.length} orders`);
    } catch (error) {
      console.error('[SyncService] Failed to pull orders:', error);
      throw error;
    }
  }

  async pullParkedCarts(userId: string): Promise<void> {
    try {
      // Use CommHub API instead of legacy endpoint
      const carts = await api.getParkedCarts();
      const validCarts = Array.isArray(carts) ? carts : [];

      for (const cart of validCarts) {
        await OfflineDB.saveLocalParkedCart({
          ...cart,
          user_id: userId,
          synced: true,
        });
      }

      console.log(`[SyncService] Pulled ${validCarts.length} parked carts`);
    } catch (error) {
      console.error('[SyncService] Failed to pull parked carts:', error);
      throw error;
    }
  }

  // ==================== LOCAL-FIRST CRUD ====================

  // Create product (local first, then queue for sync)
  async createProduct(product: Omit<OfflineDB.LocalProduct, 'synced' | 'deleted'>): Promise<void> {
    // Save locally first
    await OfflineDB.saveLocalProduct({
      ...product,
      synced: false,
      deleted: false,
    });

    // Queue for sync
    await OfflineDB.addToSyncQueue({
      operation: 'CREATE',
      table_name: 'products',
      record_id: product.id,
      data: product,
    });

    await this.updatePendingCount();

    // Try to sync immediately if online
    if (this.isOnline()) {
      this.processSyncQueue();
    }
  }

  // Update product
  async updateProduct(productId: string, updates: Partial<OfflineDB.LocalProduct>): Promise<void> {
    const products = await OfflineDB.getLocalProducts(updates.user_id || '');
    const existing = products.find((p) => p.id === productId);

    if (existing) {
      await OfflineDB.saveLocalProduct({
        ...existing,
        ...updates,
        synced: false,
        updated_at: new Date().toISOString(),
      });

      await OfflineDB.addToSyncQueue({
        operation: 'UPDATE',
        table_name: 'products',
        record_id: productId,
        data: updates,
      });

      await this.updatePendingCount();

      if (this.isOnline()) {
        this.processSyncQueue();
      }
    }
  }

  // Delete product
  async deleteProduct(productId: string): Promise<void> {
    await OfflineDB.deleteLocalProduct(productId);

    await OfflineDB.addToSyncQueue({
      operation: 'DELETE',
      table_name: 'products',
      record_id: productId,
    });

    await this.updatePendingCount();

    if (this.isOnline()) {
      this.processSyncQueue();
    }
  }

  // Create order
  async createOrder(order: Omit<OfflineDB.LocalOrder, 'synced'>): Promise<void> {
    await OfflineDB.saveLocalOrder({
      ...order,
      synced: false,
    });

    await OfflineDB.addToSyncQueue({
      operation: 'CREATE',
      table_name: 'orders',
      record_id: order.id,
      data: {
        items: order.items,
        total: order.total,
        swish_phone: order.swish_phone,
        customer_email: order.customer_email,
      },
    });

    await this.updatePendingCount();

    if (this.isOnline()) {
      this.processSyncQueue();
    }
  }

  // Create parked cart
  async createParkedCart(cart: Omit<OfflineDB.LocalParkedCart, 'synced'>): Promise<void> {
    await OfflineDB.saveLocalParkedCart({
      ...cart,
      synced: false,
    });

    await OfflineDB.addToSyncQueue({
      operation: 'CREATE',
      table_name: 'parked_carts',
      record_id: cart.id,
      data: {
        name: cart.name,
        items: cart.items,
        total: cart.total,
      },
    });

    await this.updatePendingCount();

    if (this.isOnline()) {
      this.processSyncQueue();
    }
  }

  // Delete parked cart
  async deleteParkedCart(cartId: string): Promise<void> {
    await OfflineDB.deleteLocalParkedCart(cartId);

    await OfflineDB.addToSyncQueue({
      operation: 'DELETE',
      table_name: 'parked_carts',
      record_id: cartId,
    });

    await this.updatePendingCount();

    if (this.isOnline()) {
      this.processSyncQueue();
    }
  }
}

// Singleton instance
export const syncService = new SyncService();
