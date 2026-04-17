/**
 * Offline Database Service
 * Uses AsyncStorage for cross-platform offline storage
 * This provides offline-first functionality for both web and native
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@qrkassa_';

// ==================== STORAGE HELPERS ====================

async function getStorage<T>(key: string): Promise<T[]> {
  try {
    const data = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error(`[OfflineDB] Error reading ${key}:`, e);
    return [];
  }
}

async function setStorage<T>(key: string, data: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(data));
  } catch (e) {
    console.error(`[OfflineDB] Error writing ${key}:`, e);
  }
}

async function getValue(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    return null;
  }
}

async function setValue(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
}

// ==================== DATABASE INITIALIZATION ====================

export async function getDatabase(): Promise<null> {
  // AsyncStorage doesn't need initialization
  console.log('[OfflineDB] Using AsyncStorage for offline data');
  return null;
}

// ==================== PRODUCTS ====================

export interface LocalProduct {
  id: string;
  user_id: string;
  name: string;
  price: number;
  image_url?: string;
  category: string;
  active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  synced: boolean;
  deleted: boolean;
}

export async function getLocalProducts(userId: string): Promise<LocalProduct[]> {
  const products = await getStorage<LocalProduct>('products');
  return products
    .filter(p => p.user_id === userId && !p.deleted)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

export async function saveLocalProduct(product: Partial<LocalProduct>): Promise<void> {
  const products = await getStorage<LocalProduct>('products');
  const index = products.findIndex(p => p.id === product.id);
  
  const fullProduct: LocalProduct = {
    id: product.id || '',
    user_id: product.user_id || '',
    name: product.name || '',
    price: product.price || 0,
    image_url: product.image_url,
    category: product.category || 'Övrigt',
    active: product.active !== false,
    sort_order: product.sort_order || 0,
    created_at: product.created_at || new Date().toISOString(),
    updated_at: product.updated_at || new Date().toISOString(),
    synced: product.synced || false,
    deleted: product.deleted || false,
  };
  
  if (index >= 0) {
    products[index] = fullProduct;
  } else {
    products.push(fullProduct);
  }
  
  await setStorage('products', products);
}

export async function deleteLocalProduct(productId: string): Promise<void> {
  const products = await getStorage<LocalProduct>('products');
  const index = products.findIndex(p => p.id === productId);
  
  if (index >= 0) {
    products[index].deleted = true;
    products[index].synced = false;
    products[index].updated_at = new Date().toISOString();
    await setStorage('products', products);
  }
}

export async function bulkSaveProducts(newProducts: LocalProduct[]): Promise<void> {
  const products = await getStorage<LocalProduct>('products');
  
  for (const newProduct of newProducts) {
    const index = products.findIndex(p => p.id === newProduct.id);
    if (index >= 0) {
      products[index] = { ...newProduct, synced: true };
    } else {
      products.push({ ...newProduct, synced: true });
    }
  }
  
  await setStorage('products', products);
}

// ==================== ORDERS ====================

export interface LocalOrder {
  id: string;
  user_id: string;
  items: any[];
  total: number;
  swish_phone?: string;
  qr_data?: string;
  status: string;
  customer_email?: string;
  created_at?: string;
  updated_at?: string;
  synced: boolean;
}

export async function getLocalOrders(userId: string, limit: number = 100): Promise<LocalOrder[]> {
  const orders = await getStorage<LocalOrder>('orders');
  return orders
    .filter(o => o.user_id === userId)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, limit);
}

export async function saveLocalOrder(order: Partial<LocalOrder>): Promise<void> {
  const orders = await getStorage<LocalOrder>('orders');
  const index = orders.findIndex(o => o.id === order.id);
  
  const fullOrder: LocalOrder = {
    id: order.id || '',
    user_id: order.user_id || '',
    items: order.items || [],
    total: order.total || 0,
    swish_phone: order.swish_phone,
    qr_data: order.qr_data,
    status: order.status || 'pending',
    customer_email: order.customer_email,
    created_at: order.created_at || new Date().toISOString(),
    updated_at: order.updated_at || new Date().toISOString(),
    synced: order.synced || false,
  };
  
  if (index >= 0) {
    orders[index] = fullOrder;
  } else {
    orders.push(fullOrder);
  }
  
  await setStorage('orders', orders);
}

export async function bulkSaveOrders(newOrders: LocalOrder[]): Promise<void> {
  const orders = await getStorage<LocalOrder>('orders');
  
  for (const newOrder of newOrders) {
    const index = orders.findIndex(o => o.id === newOrder.id);
    if (index >= 0) {
      orders[index] = { ...newOrder, synced: true };
    } else {
      orders.push({ ...newOrder, synced: true });
    }
  }
  
  await setStorage('orders', orders);
}

// ==================== PARKED CARTS ====================

export interface LocalParkedCart {
  id: string;
  user_id: string;
  name?: string;
  items: any[];
  total: number;
  created_at?: string;
  synced: boolean;
}

export async function getLocalParkedCarts(userId: string): Promise<LocalParkedCart[]> {
  const carts = await getStorage<LocalParkedCart>('parked_carts');
  return carts
    .filter(c => c.user_id === userId)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export async function saveLocalParkedCart(cart: Partial<LocalParkedCart>): Promise<void> {
  const carts = await getStorage<LocalParkedCart>('parked_carts');
  const index = carts.findIndex(c => c.id === cart.id);
  
  const fullCart: LocalParkedCart = {
    id: cart.id || '',
    user_id: cart.user_id || '',
    name: cart.name,
    items: cart.items || [],
    total: cart.total || 0,
    created_at: cart.created_at || new Date().toISOString(),
    synced: cart.synced || false,
  };
  
  if (index >= 0) {
    carts[index] = fullCart;
  } else {
    carts.push(fullCart);
  }
  
  await setStorage('parked_carts', carts);
}

export async function deleteLocalParkedCart(cartId: string): Promise<void> {
  const carts = await getStorage<LocalParkedCart>('parked_carts');
  const filtered = carts.filter(c => c.id !== cartId);
  await setStorage('parked_carts', filtered);
}

// ==================== SYNC QUEUE ====================

export interface SyncOperation {
  id?: number;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string;
  data?: any;
  created_at?: string;
  attempts: number;
  last_error?: string;
}

let syncQueueId = Date.now();

export async function addToSyncQueue(op: Omit<SyncOperation, 'id' | 'attempts'>): Promise<void> {
  const queue = await getStorage<SyncOperation>('sync_queue');
  queue.push({
    ...op,
    id: syncQueueId++,
    attempts: 0,
    created_at: new Date().toISOString(),
  });
  await setStorage('sync_queue', queue);
}

export async function getSyncQueue(): Promise<SyncOperation[]> {
  const queue = await getStorage<SyncOperation>('sync_queue');
  return queue.filter(op => op.attempts < 5).sort((a, b) => 
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
}

export async function removeSyncOperation(id: number): Promise<void> {
  const queue = await getStorage<SyncOperation>('sync_queue');
  const filtered = queue.filter(op => op.id !== id);
  await setStorage('sync_queue', filtered);
}

export async function updateSyncOperationError(id: number, error: string): Promise<void> {
  const queue = await getStorage<SyncOperation>('sync_queue');
  const index = queue.findIndex(op => op.id === id);
  if (index >= 0) {
    queue[index].attempts += 1;
    queue[index].last_error = error;
    await setStorage('sync_queue', queue);
  }
}

export async function getSyncQueueCount(): Promise<number> {
  const queue = await getSyncQueue();
  return queue.length;
}

// ==================== SYNC METADATA ====================

export async function getSyncMetadata(key: string): Promise<string | null> {
  return getValue(`metadata_${key}`);
}

export async function setSyncMetadata(key: string, value: string): Promise<void> {
  await setValue(`metadata_${key}`, value);
}

// ==================== CLEAR DATA ====================

export async function clearAllLocalData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const qrkassaKeys = keys.filter(k => k.startsWith(STORAGE_PREFIX));
  await AsyncStorage.multiRemove(qrkassaKeys);
  console.log('[OfflineDB] All local data cleared');
}

export async function markAllAsSynced(tableName: string): Promise<void> {
  const data = await getStorage<any>(tableName);
  const updated = data.map((item: any) => ({ ...item, synced: true }));
  await setStorage(tableName, updated);
}
