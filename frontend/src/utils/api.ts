// Production backend URL - hardcoded for native builds
// In Expo Go, process.env may not work correctly, so we use hardcoded URL as primary
import { Platform } from 'react-native';

const getBackendUrl = () => {
  // For native (iOS/Android), always use production URL
  if (Platform.OS !== 'web') {
    return 'https://qrcashios-production.up.railway.app';
  }
  // For web, use env variable with fallback to production
  return process.env.EXPO_PUBLIC_BACKEND_URL || 'https://qrcashios-production.up.railway.app';
};

const BACKEND_URL = getBackendUrl();

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${BACKEND_URL}/api${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Generic fetch method for custom endpoints
  async fetch(endpoint: string, options: RequestInit = {}) {
    return this.request(endpoint, options);
  }

  // Auth
  async login(email: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(data: { email: string; password: string; organization_name: string; phone: string; name?: string }) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async updateProfile(data: { organization_name?: string; phone?: string; name?: string }) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Products
  async getProducts(activeOnly = false) {
    const query = activeOnly ? '?active_only=true' : '';
    return this.request(`/products${query}`);
  }

  async createProduct(data: { name: string; price: number; image_url?: string; category?: string }) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProduct(id: string, data: { name?: string; price?: number; image_url?: string; category?: string; active?: boolean }) {
    return this.request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProduct(id: string) {
    return this.request(`/products/${id}`, { method: 'DELETE' });
  }

  async reorderProducts(productIds: string[]) {
    return this.request('/products/reorder', {
      method: 'POST',
      body: JSON.stringify({ product_ids: productIds }),
    });
  }

  // Orders
  async createOrder(data: { items: any[]; total: number; swish_phone: string; customer_email?: string }) {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getOrders(status?: string, limit = 50) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    return this.request(`/orders?${params.toString()}`);
  }

  async confirmOrder(orderId: string) {
    return this.request(`/orders/${orderId}/confirm`, { method: 'POST' });
  }

  async cancelOrder(orderId: string) {
    return this.request(`/orders/${orderId}/cancel`, { method: 'POST' });
  }

  async deleteOrder(orderId: string) {
    return this.request(`/orders/${orderId}`, { method: 'DELETE' });
  }

  async getDailyStats(period = 'day', date?: string) {
    const params = new URLSearchParams({ period });
    if (date) params.set('date', date);
    return this.request(`/orders/daily-stats?${params.toString()}`);
  }

  // Admin
  async verifyPin(pin: string) {
    return this.request('/admin/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }

  async getSettings() {
    return this.request('/admin/settings');
  }

  async updateSettings(data: Record<string, any>) {
    return this.request('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAdminStats() {
    return this.request('/admin/stats');
  }

  async getUserSalesStats(period = 'day', startDate?: string, endDate?: string) {
    const params = new URLSearchParams({ period });
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    return this.request(`/admin/stats/users?${params.toString()}`);
  }

  async clearOrders() {
    return this.request('/admin/clear-orders', { method: 'DELETE' });
  }

  // Customer Display
  async getCustomerDisplay(userId?: string) {
    const query = userId ? `?user_id=${userId}` : '';
    return this.request(`/customer-display${query}`);
  }

  async resetCustomerDisplay() {
    return this.request('/customer-display/reset', { method: 'POST' });
  }

  // Parked Carts
  async getParkedCarts() {
    return this.request('/parked-carts');
  }

  async createParkedCart(data: { name: string; items: any[]; total: number }) {
    return this.request('/parked-carts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteParkedCart(id: string) {
    return this.request(`/parked-carts/${id}`, { method: 'DELETE' });
  }

  async sendParkedCartToDisplay(id: string) {
    return this.request(`/parked-carts/${id}/send-to-display`, { method: 'POST' });
  }

  // Receipts
  async sendReceipt(orderId: string, email: string) {
    return this.request('/receipts/send', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, recipient_email: email }),
    });
  }
}

export const api = new ApiClient();
