import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { commhub, UserProfile } from '../services/commhub';

interface User {
  user_id: string;
  email: string;
  name?: string;
  organization_name?: string;
  phone?: string;
  email_verified?: boolean;
  subscription_active?: boolean;
  subscription_start?: string;
  subscription_end?: string;
  picture?: string;
  role?: string;
  org_id?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string | null, token?: string) => Promise<void>;
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

// Helper to convert CommHub UserProfile to our User type
function profileToUser(profile: UserProfile): User {
  return {
    user_id: profile.user_id,
    email: profile.email,
    name: profile.name || profile.first_name || '',
    organization_name: profile.organization_name || '',
    phone: profile.phone || '',
    email_verified: profile.email_verified ?? true,
    subscription_active: profile.subscription_active ?? true,
    picture: profile.picture,
    role: profile.role,
    org_id: profile.org_id,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      // Check if we have a stored token
      if (commhub.getToken()) {
        const profile = await commhub.getMe();
        setUser(profileToUser(profile));
      }
    } catch (e) {
      console.log('[Auth] Session expired or invalid');
      // Token is invalid, commhub will clear it
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (email: string, password: string | null, token?: string) => {
    // If token is provided, use it directly (for code login)
    if (token) {
      const profile = await commhub.loginWithToken(token);
      setUser(profileToUser(profile));
      return;
    }

    // Normal email/password login via CommHub Public API
    const result = await commhub.login(email, password || '');
    
    // Use the user profile from login result (already has legacy data mapped)
    if (result.user) {
      setUser(profileToUser(result.user));
    } else {
      // Fallback to getting profile from stored data
      const profile = await commhub.getMe();
      setUser(profileToUser(profile));
    }
  };

  const register = async (data: { email: string; password: string; organization_name: string; phone: string; name?: string }): Promise<string> => {
    const result = await commhub.register(
      data.email,
      data.password,
      data.organization_name,
      data.phone,
      data.name
    );
    
    // If auto-login after register, set user
    if (result.token && result.user) {
      setUser(profileToUser(result.user));
    }
    
    return 'Registrering lyckades!';
  };

  const logout = async () => {
    await commhub.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const profile = await commhub.getMe();
      setUser(profileToUser(profile));
    } catch (e) {
      console.log('[Auth] Failed to refresh user');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
