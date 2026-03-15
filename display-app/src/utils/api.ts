import { Platform } from 'react-native';

// Production backend URL - same logic as main app
const getBackendUrl = () => {
  // For native (iOS/Android), always use production URL
  if (Platform.OS !== 'web') {
    return 'https://qrcashios-production.up.railway.app';
  }
  // For web, use env variable with fallback to production
  return process.env.EXPO_PUBLIC_BACKEND_URL || 'https://qrcashios-production.up.railway.app';
};

const API_BASE = getBackendUrl();

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
