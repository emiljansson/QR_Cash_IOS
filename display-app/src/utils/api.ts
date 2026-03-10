import Constants from 'expo-constants';

// Use environment variable or fallback
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export const api = {
  baseUrl: API_BASE,
  
  async get(endpoint: string) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error('Request failed');
    return res.json();
  },
  
  async post(endpoint: string, data: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Request failed');
    }
    return res.json();
  },
};
