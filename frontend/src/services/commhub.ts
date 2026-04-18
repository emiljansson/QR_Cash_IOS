/**
 * CommHub Direct Integration - No Backend Required!
 * 
 * App → CommHub direkt (utan mellanliggande FastAPI-backend)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// CommHub Configuration
const COMMHUB_URL = 'https://commhub.cloud';
const APP_ID = 'fcd81e2d-d8b9-48c4-9eeb-84116442b3e0';

// Token storage key
const TOKEN_KEY = 'commhub_token';
const USER_KEY = 'commhub_user';

// ==================== Types ====================

export interface AuthResponse {
  token: string;
  user_id: string;
  email: string;
  org_id?: string;
  expires_at: string;
  user?: UserProfile;
}

export interface UserProfile {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  organization_name?: string;
  org_id?: string;
  phone?: string;
  picture?: string;
  email_verified?: boolean;
  subscription_active?: boolean;
  role?: string;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  category?: string;
  active?: boolean;
  sort_order?: number;
  user_id?: string;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  status: number;
  swish_phone?: string;
  customer_email?: string;
  created_at: string;
  user_id?: string;
}

export interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Settings {
  id?: string;
  swish_number?: string;
  admin_pin?: string;
  app_name?: string;
  currency?: string;
  tax_rate?: number;
  receipt_footer?: string;
  user_id?: string;
}

export interface ParkedCart {
  id: string;
  name: string;
  items: OrderItem[];
  total: number;
  created_at: string;
  user_id?: string;
}

// ==================== CommHub Service ====================

class CommHubService {
  private token: string | null = null;
  private userId: string | null = null;

  constructor() {
    // Load token from storage on init (only in browser/client context)
    if (typeof window !== 'undefined') {
      this.loadToken();
    }
  }

  private async loadToken() {
    try {
      this.token = await AsyncStorage.getItem(TOKEN_KEY);
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (userData) {
        const user = JSON.parse(userData);
        this.userId = user.user_id;
      }
    } catch (e) {
      // Silently ignore - this can happen during SSR
    }
  }

  private async saveToken(token: string, user: UserProfile) {
    this.token = token;
    this.userId = user.user_id;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  private async clearToken() {
    this.token = null;
    this.userId = null;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getUserId(): string | null {
    return this.userId;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  // ==================== Auth (Public API - No API Key!) ====================

  async register(
    email: string,
    password: string,
    organizationName: string,
    phone?: string,
    name?: string
  ): Promise<AuthResponse> {
    const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        organization_name: organizationName,
        phone,
        first_name: name,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(error.detail || 'Registration failed');
    }

    const data = await response.json();
    
    // Save token if provided
    if (data.token && data.user) {
      await this.saveToken(data.token, data.user);
    }

    return data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      // Handle case where detail might be an object
      const errorMessage = typeof error.detail === 'string' 
        ? error.detail 
        : (error.detail?.message || error.message || JSON.stringify(error.detail) || 'Fel e-post eller lösenord');
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Build user profile from response
    const user: UserProfile = data.user || {
      user_id: data.user_id,
      email: data.email,
      org_id: data.org_id,
    };

    await this.saveToken(data.token, user);
    return data;
  }

  async loginWithToken(token: string): Promise<UserProfile> {
    this.token = token;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return this.getMe();
  }

  async logout(): Promise<void> {
    try {
      if (this.token) {
        await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` },
        });
      }
    } catch (e) {
      // Ignore logout errors
    }
    await this.clearToken();
  }

  async getMe(): Promise<UserProfile> {
    const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/me`, {
      headers: { 'Authorization': `Bearer ${this.token}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.clearToken();
        throw new Error('Session expired');
      }
      throw new Error('Failed to get user profile');
    }

    const user = await response.json();
    this.userId = user.user_id;
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  async updateProfile(data: Partial<UserProfile>): Promise<UserProfile> {
    const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/me`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to update profile');
    }

    return response.json();
  }

  // ==================== Generic Data Operations (with RLS) ====================

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${COMMHUB_URL}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.clearToken();
        throw new Error('Session expired');
      }
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async list<T>(collection: string, options?: { limit?: number; skip?: number }): Promise<T[]> {
    const params = new URLSearchParams({ app_id: APP_ID });
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.skip) params.set('skip', String(options.skip));

    const data = await this.request<{ documents: T[] }>(
      `/api/data/${collection}?${params.toString()}`
    );
    return data.documents || [];
  }

  async get<T>(collection: string, id: string): Promise<T> {
    return this.request<T>(`/api/data/${collection}/${id}?app_id=${APP_ID}`);
  }

  async create<T>(collection: string, data: Partial<T>): Promise<T> {
    return this.request<T>(`/api/data/${collection}?app_id=${APP_ID}`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
  }

  async update<T>(collection: string, id: string, data: Partial<T>): Promise<T> {
    return this.request<T>(`/api/data/${collection}/${id}?app_id=${APP_ID}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.request(`/api/data/${collection}/${id}?app_id=${APP_ID}`, {
      method: 'DELETE',
    });
  }

  async query<T>(
    collection: string,
    filter: Record<string, any>,
    options?: { sort?: Record<string, number>; limit?: number; skip?: number }
  ): Promise<T[]> {
    const data = await this.request<{ documents: T[] }>(
      `/api/data/${collection}/query?app_id=${APP_ID}`,
      {
        method: 'POST',
        body: JSON.stringify({ filter, ...options }),
      }
    );
    return data.documents || [];
  }

  // ==================== Products ====================

  async getProducts(activeOnly = false): Promise<Product[]> {
    if (activeOnly) {
      return this.query<Product>('qr_products', { active: { $ne: false } }, { sort: { sort_order: 1 } });
    }
    const products = await this.list<Product>('qr_products');
    return products.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  async createProduct(data: Omit<Product, 'id'>): Promise<Product> {
    return this.create<Product>('qr_products', { ...data, active: true });
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    return this.update<Product>('qr_products', id, data);
  }

  async deleteProduct(id: string): Promise<void> {
    return this.delete('qr_products', id);
  }

  async reorderProducts(productIds: string[]): Promise<void> {
    // Update sort_order for each product
    await Promise.all(
      productIds.map((id, index) =>
        this.update('qr_products', id, { sort_order: index })
      )
    );
  }

  // ==================== Orders ====================

  async getOrders(status?: number, limit = 50): Promise<Order[]> {
    if (status !== undefined) {
      return this.query<Order>('qr_orders', { status }, { sort: { created_at: -1 }, limit });
    }
    return this.query<Order>('qr_orders', {}, { sort: { created_at: -1 }, limit });
  }

  async createOrder(data: Omit<Order, 'id' | 'created_at' | 'user_id'>): Promise<Order> {
    return this.create<Order>('qr_orders', {
      ...data,
      created_at: new Date().toISOString(),
    });
  }

  async confirmOrder(orderId: string): Promise<Order> {
    return this.update<Order>('qr_orders', orderId, { status: 200 });
  }

  async cancelOrder(orderId: string): Promise<Order> {
    return this.update<Order>('qr_orders', orderId, { status: 400 });
  }

  async deleteOrder(orderId: string): Promise<void> {
    return this.delete('qr_orders', orderId);
  }

  async getDailyStats(period = 'day', date?: string): Promise<any> {
    // Calculate stats locally from orders
    const now = new Date();
    const startDate = new Date();
    
    if (period === 'day') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(now.getMonth() - 1);
    }

    const orders = await this.query<Order>('qr_orders', {
      status: 200,
      created_at: { $gte: startDate.toISOString() }
    });

    const total = orders.reduce((sum, order) => sum + order.total, 0);
    const count = orders.length;

    return {
      total,
      count,
      average: count > 0 ? total / count : 0,
      orders,
    };
  }

  // ==================== Settings ====================

  async getSettings(): Promise<Settings> {
    const settings = await this.list<Settings>('qr_settings', { limit: 1 });
    return settings[0] || {};
  }

  async updateSettings(data: Partial<Settings>): Promise<Settings> {
    const existing = await this.getSettings();
    if (existing.id) {
      return this.update<Settings>('qr_settings', existing.id, data);
    } else {
      return this.create<Settings>('qr_settings', data);
    }
  }

  async verifyPin(pin: string): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.admin_pin === pin;
  }

  // ==================== Parked Carts ====================

  async getParkedCarts(): Promise<ParkedCart[]> {
    return this.list<ParkedCart>('qr_parked_carts');
  }

  async createParkedCart(data: Omit<ParkedCart, 'id' | 'created_at' | 'user_id'>): Promise<ParkedCart> {
    return this.create<ParkedCart>('qr_parked_carts', {
      ...data,
      created_at: new Date().toISOString(),
    });
  }

  async deleteParkedCart(id: string): Promise<void> {
    return this.delete('qr_parked_carts', id);
  }

  async mergeParkedCart(id: string, additionalItems: OrderItem[], additionalTotal: number): Promise<ParkedCart> {
    const cart = await this.get<ParkedCart>('qr_parked_carts', id);
    const mergedItems = [...cart.items, ...additionalItems];
    const mergedTotal = cart.total + additionalTotal;
    return this.update<ParkedCart>('qr_parked_carts', id, {
      items: mergedItems,
      total: mergedTotal,
    });
  }

  // ==================== File Upload (Signed URLs) ====================

  async getUploadUrl(filename: string, contentType: string, folder = 'uploads'): Promise<{
    upload_url: string;
    file_url: string;
    file_id: string;
    headers: Record<string, string>;
  }> {
    return this.request(`/api/public/${APP_ID}/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType, folder }),
    });
  }

  async uploadFile(uri: string, filename: string): Promise<string> {
    // Get content type
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Get presigned URL
    const { upload_url, file_url, headers } = await this.getUploadUrl(filename, contentType);

    // Upload file
    const response = await fetch(uri);
    const blob = await response.blob();

    const uploadResponse = await fetch(upload_url, {
      method: 'PUT',
      headers,
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error('Upload failed');
    }

    return file_url;
  }

  // ==================== WebSocket Realtime ====================

  connectRealtime(collections: string[], onEvent: (event: any) => void): WebSocket {
    const ws = new WebSocket(
      `wss://commhub.cloud/api/ws/realtime?token=${this.token}&app_id=${APP_ID}`
    );

    ws.onopen = () => {
      console.log('[CommHub WS] Connected');
      ws.send(JSON.stringify({
        action: 'subscribe',
        collections,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'document_changed' || msg.type === 'change') {
          onEvent(msg);
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    ws.onerror = (error) => {
      console.error('[CommHub WS] Error:', error);
    };

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);

    ws.onclose = () => {
      console.log('[CommHub WS] Disconnected');
      clearInterval(heartbeat);
    };

    return ws;
  }
}

// ==================== Singleton Export ====================

export const commhub = new CommHubService();

// Legacy compatibility - export as api too
export const api = commhub;
