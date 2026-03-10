import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../utils/api';

interface User {
  user_id: string;
  email: string;
  name?: string;
  organization_name: string;
  phone: string;
  email_verified: boolean;
  subscription_active: boolean;
  subscription_start?: string;
  subscription_end?: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; organization_name: string; phone: string; name?: string }) => Promise<string>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => '',
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        api.setToken(token);
        const userData = await api.getMe();
        setUser(userData);
      }
    } catch {
      await AsyncStorage.removeItem('session_token');
      api.setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    if (result.session_token) {
      await AsyncStorage.setItem('session_token', result.session_token);
      api.setToken(result.session_token);
      setUser(result.user);
    }
  };

  const register = async (data: { email: string; password: string; organization_name: string; phone: string; name?: string }) => {
    const result = await api.register(data);
    return result.message;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    await AsyncStorage.removeItem('session_token');
    api.setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await api.getMe();
      setUser(userData);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
