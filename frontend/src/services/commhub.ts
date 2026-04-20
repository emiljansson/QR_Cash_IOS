/**
 * CommHub Direct Integration - No Backend Required!
 * 
 * App → CommHub direkt (utan mellanliggande FastAPI-backend)
 * 
 * Auth Strategy: Uses qr_users collection for authentication (User Sync)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// CommHub Configuration
const COMMHUB_URL = 'https://commhub.cloud';
const APP_ID = 'fcd81e2d-d8b9-48c4-9eeb-84116442b3e0';
const API_KEY = 'KHue8NLldN3dkeQxHllN9hAWjkLQx17LFXRbW2UnUCs';

// Token storage key
const TOKEN_KEY = 'commhub_token';
const USER_KEY = 'commhub_user';
const OFFLINE_LOGIN_KEY = 'commhub_offline_login'; // Cache for offline code login

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
  login_code?: string;
  email_verified?: boolean;
  subscription_active?: boolean;
  subscription_start?: string;
  subscription_end?: string;
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

// Module-level initialization promise
let initPromise: Promise<void> | null = null;

class CommHubService {
  private token: string | null = null;
  private userId: string | null = null;
  private tokenLoaded: boolean = false;

  constructor() {
    // Start token loading immediately and store promise at module level
    if (typeof window !== 'undefined' && !initPromise) {
      initPromise = this.loadToken();
    }
  }

  private async loadToken() {
    try {
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const userData = await AsyncStorage.getItem(USER_KEY);
      
      this.token = storedToken;
      
      if (userData) {
        const user = JSON.parse(userData);
        this.userId = user.user_id;
      }
      console.log('[CommHub] Token loaded from storage:', this.token ? 'yes' : 'no');
    } catch (e) {
      console.log('[CommHub] Error loading token from storage:', e);
    } finally {
      this.tokenLoaded = true;
    }
  }

  /**
   * Ensure token is loaded from storage before accessing it
   */
  async ensureTokenLoaded(): Promise<void> {
    if (this.tokenLoaded) return;
    
    // If init promise exists, wait for it
    if (initPromise) {
      await initPromise;
      return;
    }
    
    // Fallback: load token directly if no promise exists
    await this.loadToken();
  }

  private async saveToken(token: string, user: UserProfile) {
    this.token = token;
    this.userId = user.user_id;
    this.tokenLoaded = true;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    console.log('[CommHub] Token saved to storage');
  }

  private async clearToken() {
    this.token = null;
    this.userId = null;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    await AsyncStorage.removeItem(OFFLINE_LOGIN_KEY);
    console.log('[CommHub] Token cleared from storage');
  }

  getToken(): string | null {
    return this.token;
  }

  /**
   * Get token after ensuring it's loaded from storage
   */
  async getTokenAsync(): Promise<string | null> {
    await this.ensureTokenLoaded();
    return this.token;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getUserId(): string | null {
    return this.userId;
  }

  /**
   * Ensure userId is loaded from storage - useful for initial API calls
   */
  async ensureUserId(): Promise<string | null> {
    if (this.userId) {
      return this.userId;
    }
    
    try {
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (userData) {
        const user = JSON.parse(userData);
        this.userId = user.user_id;
        return this.userId;
      }
    } catch (e) {
      console.warn('[CommHub] Could not load userId from storage');
    }
    
    return null;
  }

  /**
   * Get userId, loading from storage if needed (synchronous check, then async fallback)
   */
  private async getUserIdAsync(): Promise<string | null> {
    if (this.userId) {
      return this.userId;
    }
    return this.ensureUserId();
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  // ==================== Auth using CommHub Public API ====================

  /**
   * Login using CommHub's native Public Auth (users imported to their system)
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${COMMHUB_URL}/api/public/${APP_ID}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase(), password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      const errorMessage = typeof error.detail === 'string' 
        ? error.detail 
        : (error.detail?.message || error.message || 'Fel e-post eller lösenord');
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Fetch the original user data from qr_users (for RLS compatibility and org mapping)
    let originalUserId = data.user_id;
    let organizationName = data.organization_name || '';
    let orgId = data.org_id || '';
    let userName = data.name || '';
    let userPhone = '';
    let userRole = 'admin';
    let subscriptionActive = true;
    let subscriptionEnd = '';
    let subscriptionStart = '';
    let emailVerified = true;
    
    try {
      const userLookup = await fetch(
        `${COMMHUB_URL}/api/data/qr_users/query?app_id=${APP_ID}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          body: JSON.stringify({
            filter: { email: email.toLowerCase() },
            limit: 1,
          }),
        }
      );
      if (userLookup.ok) {
        const userData = await userLookup.json();
        if (userData.documents?.[0]) {
          const legacyUser = userData.documents[0].data;
          // Use the original user_id from qr_users for data queries
          originalUserId = legacyUser.user_id || userData.documents[0].id;
          // Extract organization data
          organizationName = legacyUser.organization_name || organizationName;
          orgId = legacyUser.org_id || legacyUser.user_id || originalUserId;
          userName = legacyUser.name || userName;
          userPhone = legacyUser.phone || '';
          userRole = legacyUser.role || 'admin';
          subscriptionActive = legacyUser.subscription_active !== false;
          subscriptionEnd = legacyUser.subscription_end || '';
          subscriptionStart = legacyUser.subscription_start || '';
          emailVerified = legacyUser.email_verified !== false;
          
          console.log('[CommHub] Legacy user mapping:', {
            originalUserId,
            orgId,
            organizationName,
          });
          
          // Cache the user's login code for offline use (if they have one)
          if (legacyUser.login_code) {
            await this.cacheOfflineLogin(legacyUser.login_code, {
              token: data.token,
              user_id: originalUserId,
              email: legacyUser.email || email.toLowerCase(),
              org_id: orgId,
              expires_at: data.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              user: {
                user_id: originalUserId,
                email: legacyUser.email || email.toLowerCase(),
                name: userName,
                organization_name: organizationName,
                phone: userPhone,
                role: userRole,
                org_id: orgId,
              },
            });
            console.log('[CommHub] Cached login code for offline use');
          }
        }
      }
    } catch (e) {
      // If lookup fails, continue with Public Auth user_id
      console.warn('[CommHub] Could not fetch original user data, using Public Auth data');
    }
    
    // Build user profile from response with legacy data
    const user: UserProfile = {
      user_id: originalUserId,
      email: data.email || email.toLowerCase(),
      org_id: orgId,
      name: userName,
      organization_name: organizationName,
      phone: userPhone,
      role: userRole,
      subscription_active: subscriptionActive,
      subscription_start: subscriptionStart,
      subscription_end: subscriptionEnd,
      email_verified: emailVerified,
    };

    await this.saveToken(data.token, user);

    return {
      token: data.token,
      user_id: originalUserId,
      email: user.email,
      org_id: orgId,
      expires_at: data.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      user,
    };
  }

  /**
   * Login with code (for sub-users) - with offline support
   */
  async loginWithCode(code: string): Promise<AuthResponse> {
    // First, try to login online
    try {
      const result = await this.loginWithCodeOnline(code);
      
      // Cache the successful login for offline use
      await this.cacheOfflineLogin(code, result);
      
      return result;
    } catch (e: any) {
      // If network error, try offline login
      if (e.message?.includes('Network') || e.message?.includes('fetch') || e.message?.includes('ansluta')) {
        console.log('[CommHub] Network error, trying offline login...');
        return this.loginWithCodeOffline(code);
      }
      throw e;
    }
  }

  /**
   * Cache login credentials for offline use
   */
  private async cacheOfflineLogin(code: string, authResult: AuthResponse): Promise<void> {
    try {
      const cacheData = {
        code: code.toUpperCase(),
        token: authResult.token,
        user: authResult.user,
        user_id: authResult.user_id,
        email: authResult.email,
        org_id: authResult.org_id,
        expires_at: authResult.expires_at,
        cached_at: new Date().toISOString(),
      };
      await AsyncStorage.setItem(OFFLINE_LOGIN_KEY, JSON.stringify(cacheData));
      console.log('[CommHub] Offline login cached for code:', code.substring(0, 2) + '***');
    } catch (e) {
      console.error('[CommHub] Failed to cache offline login:', e);
    }
  }

  /**
   * Try to login offline using cached credentials
   */
  private async loginWithCodeOffline(code: string): Promise<AuthResponse> {
    const cached = await AsyncStorage.getItem(OFFLINE_LOGIN_KEY);
    
    if (!cached) {
      throw new Error('Ingen cachad inloggning. Anslut till internet för första inloggningen.');
    }
    
    const cacheData = JSON.parse(cached);
    
    // Verify the code matches
    if (cacheData.code !== code.toUpperCase()) {
      throw new Error('Ogiltig inloggningskod');
    }
    
    console.log('[CommHub] Offline login successful for:', cacheData.email);
    
    // Restore the session from cache
    if (cacheData.user) {
      await this.saveToken(cacheData.token, cacheData.user);
    }
    
    return {
      token: cacheData.token,
      user_id: cacheData.user_id,
      email: cacheData.email,
      org_id: cacheData.org_id,
      expires_at: cacheData.expires_at,
      user: cacheData.user,
    };
  }

  /**
   * Online login with code
   */
  private async loginWithCodeOnline(code: string): Promise<AuthResponse> {
    // First, try qr_org_users (sub-users)
    let response = await fetch(
      `${COMMHUB_URL}/api/data/qr_org_users/query?app_id=${APP_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({
          filter: { login_code: code.toUpperCase() },
          limit: 1,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Kunde inte ansluta till servern');
    }

    let data = await response.json();
    let users = data.documents || [];

    // If not found in qr_org_users, try qr_users (main users)
    if (users.length === 0) {
      console.log('[CommHub] Code not found in qr_org_users, trying qr_users...');
      response = await fetch(
        `${COMMHUB_URL}/api/data/qr_users/query?app_id=${APP_ID}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          body: JSON.stringify({
            filter: { login_code: code.toUpperCase() },
            limit: 1,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Kunde inte ansluta till servern');
      }

      data = await response.json();
      users = data.documents || [];

      if (users.length === 0) {
        throw new Error('Ogiltig inloggningskod');
      }

      // Found in qr_users - this is a main user
      const mainUser = users[0].data || users[0];
      const userId = mainUser.user_id || users[0].id;
      
      console.log('[CommHub] Main user login with code:', mainUser.email);

      // Create session token
      const sessionToken = this.generateSessionToken(mainUser);

      // Build user profile
      const userProfile: UserProfile = {
        user_id: userId,
        email: mainUser.email,
        name: mainUser.name || '',
        organization_name: mainUser.organization_name || '',
        phone: mainUser.phone || '',
        role: mainUser.role || 'admin',
        org_id: mainUser.org_id || userId,
      };

      await this.saveToken(sessionToken, userProfile);

      return {
        token: sessionToken,
        user_id: userProfile.user_id,
        email: userProfile.email,
        org_id: userProfile.org_id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        user: userProfile,
      };
    }

    // Found in qr_org_users - this is a sub-user
    const orgUser = users[0].data || users[0];

    // Get the parent user for org info
    const parentResponse = await fetch(
      `${COMMHUB_URL}/api/data/qr_users/${orgUser.parent_user_id}?app_id=${APP_ID}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
      }
    );

    let parentUser = null;
    if (parentResponse.ok) {
      parentUser = await parentResponse.json();
    }

    // Create session token
    const sessionToken = this.generateSessionToken({
      ...orgUser,
      parent_user: parentUser,
    });

    // Build user profile for sub-user
    const userProfile: UserProfile = {
      user_id: orgUser.parent_user_id, // Use parent's user_id for data access
      email: orgUser.email || `${code}@org.local`,
      name: orgUser.name,
      organization_name: parentUser?.organization_name || '',
      phone: orgUser.phone,
      role: orgUser.role || 'staff',
      org_id: orgUser.parent_user_id,
    };

    await this.saveToken(sessionToken, userProfile);

    return {
      token: sessionToken,
      user_id: userProfile.user_id,
      email: userProfile.email,
      org_id: userProfile.org_id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      user: userProfile,
    };
  }

  /**
   * Simple password verification using backend API
   */
  private async verifyPassword(inputPassword: string, storedHash: string): Promise<boolean> {
    // If no hash stored, check plain text (legacy)
    if (!storedHash) return false;
    
    // Check if it's a bcrypt hash
    if (storedHash.startsWith('$2')) {
      // Use the backend API for password verification
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://github-import-56.preview.emergentagent.com';
      
      try {
        const verifyResponse = await fetch(`${backendUrl}/api/auth/verify-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: inputPassword, hash: storedHash }),
        });
        if (verifyResponse.ok) {
          const result = await verifyResponse.json();
          return result.valid === true;
        }
      } catch (e) {
        console.error('[CommHub] Password verification failed:', e);
      }
      
      return false;
    }
    
    // Plain text comparison (legacy/development only)
    return inputPassword === storedHash;
  }

  /**
   * Generate a simple session token
   */
  private generateSessionToken(user: any): string {
    const payload = {
      user_id: user.id || user._id || user.user_id,
      email: user.email,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      iat: Date.now(),
    };
    // Simple base64 encoding (not secure JWT, but works for session management)
    return btoa(JSON.stringify(payload));
  }

  async register(
    email: string,
    password: string,
    organizationName: string,
    phone?: string,
    name?: string
  ): Promise<AuthResponse> {
    // Check if user already exists
    const checkResponse = await fetch(
      `${COMMHUB_URL}/api/data/qr_users/query?app_id=${APP_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({
          filter: { email: email.toLowerCase() },
          limit: 1,
        }),
      }
    );

    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      if (existing.documents && existing.documents.length > 0) {
        throw new Error('E-postadressen är redan registrerad');
      }
    }

    // Create new user in qr_users collection
    // Note: Password should be hashed server-side in production
    const loginCode = this.generateLoginCode(); // Generate login code for new user
    
    const createResponse = await fetch(
      `${COMMHUB_URL}/api/data/qr_users?app_id=${APP_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({
          data: {
            email: email.toLowerCase(),
            password_hash: password, // Should be hashed!
            organization_name: organizationName,
            phone: phone || '',
            name: name || '',
            login_code: loginCode, // Save login code
            email_verified: true, // Auto-verified since no backend for verification
            subscription_active: true,
            created_at: new Date().toISOString(),
          },
        }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.json().catch(() => ({}));
      throw new Error(error.detail || 'Registrering misslyckades');
    }

    const newUser = await createResponse.json();

    // Auto-login after registration
    const userProfile: UserProfile = {
      user_id: newUser.id || newUser._id,
      email: email.toLowerCase(),
      name: name || organizationName,
      organization_name: organizationName,
      phone: phone || '',
      login_code: loginCode,
      email_verified: true,
      subscription_active: true,
    };

    const sessionToken = this.generateSessionToken(newUser);
    await this.saveToken(sessionToken, userProfile);

    // Send welcome email to new user with all registration details
    try {
      await this.sendWelcomeEmail(
        email, 
        name || organizationName, 
        loginCode, 
        organizationName, 
        undefined, // swishNumber - not set during registration
        phone
      );
      console.log('[CommHub] Welcome email sent to:', email);
    } catch (e) {
      console.log('[CommHub] Failed to send welcome email:', e);
      // Don't fail registration if email fails
    }

    return {
      token: sessionToken,
      user_id: userProfile.user_id,
      email: userProfile.email,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      user: userProfile,
    };
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
    // First, check if we have a locally stored user profile
    // This is used for local session tokens (generated from login code)
    const storedUser = await AsyncStorage.getItem(USER_KEY);
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        // Verify the stored user has required fields
        if (user.user_id && user.email) {
          console.log('[CommHub] Using cached user profile:', user.email);
          this.userId = user.user_id;
          return user;
        }
      } catch (e) {
        // Invalid stored user, continue to API call
      }
    }

    // No valid cached user, try the CommHub API
    // This will work for CommHub-issued tokens (email/password login)
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

  /**
   * Get current user (alias for getMe)
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      return await this.getMe();
    } catch (e) {
      return null;
    }
  }

  /**
   * Update current user's subscription status in database
   */
  async updateCurrentUser(data: {
    subscription_active?: boolean;
    subscription_start?: string;
    subscription_end?: string;
    subscription_product?: string;
  }): Promise<void> {
    const userId = await this.getUserIdAsync();
    if (!userId) {
      console.warn('[CommHub] Cannot update user: no user_id');
      return;
    }

    try {
      // First get the current user document
      const response = await fetch(
        `${COMMHUB_URL}/api/data/qr_users/query?app_id=${APP_ID}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          body: JSON.stringify({
            filter: { $or: [{ id: userId }, { _id: userId }] },
            limit: 1,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }

      const result = await response.json();
      const users = result.documents || result;
      
      if (!users || users.length === 0) {
        console.warn('[CommHub] User not found for update');
        return;
      }

      const existingUser = users[0];
      const docId = existingUser.id || existingUser._id;
      const existingData = existingUser.data || existingUser;

      // Update the user document
      const updateResponse = await fetch(
        `${COMMHUB_URL}/api/data/qr_users/${docId}?app_id=${APP_ID}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          body: JSON.stringify({
            data: {
              ...existingData,
              ...data,
              updated_at: new Date().toISOString(),
            },
          }),
        }
      );

      if (!updateResponse.ok) {
        throw new Error('Failed to update user');
      }

      // Update local cache too
      const storedUser = await AsyncStorage.getItem(USER_KEY);
      if (storedUser) {
        const user = JSON.parse(storedUser);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify({ ...user, ...data }));
      }

      console.log('[CommHub] User subscription updated:', data);
    } catch (e) {
      console.error('[CommHub] Failed to update user:', e);
      throw e;
    }
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
    // Use X-API-Key for data operations (more reliable than Bearer token)
    const response = await fetch(`${COMMHUB_URL}${path}`, {
      ...options,
      headers: {
        'X-API-Key': API_KEY,
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

    const data = await this.request<{ documents: any[] }>(
      `/api/data/${collection}?${params.toString()}`
    );
    // CommHub returns documents with nested 'data' field - extract it
    // IMPORTANT: Use doc.id as the primary ID (not data.id which may be legacy)
    return (data.documents || []).map(doc => {
      const { id: legacyId, ...restData } = doc.data || {};
      return {
        ...restData,
        id: doc.id,  // Use CommHub's document ID
        legacy_id: legacyId,  // Keep legacy ID if needed
      };
    }) as T[];
  }

  async get<T>(collection: string, id: string): Promise<T> {
    const doc = await this.request<any>(`/api/data/${collection}/${id}?app_id=${APP_ID}`);
    // Extract data from nested structure
    return { id: doc.id, ...doc.data } as T;
  }

  async create<T>(collection: string, data: Partial<T>): Promise<T> {
    const doc = await this.request<any>(`/api/data/${collection}?app_id=${APP_ID}`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
    return { id: doc.id, ...doc.data } as T;
  }

  async update<T>(collection: string, id: string, data: Partial<T>): Promise<T> {
    const doc = await this.request<any>(`/api/data/${collection}/${id}?app_id=${APP_ID}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
    return { id: doc.id, ...doc.data } as T;
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
    const data = await this.request<{ documents: any[] }>(
      `/api/data/${collection}/query?app_id=${APP_ID}`,
      {
        method: 'POST',
        body: JSON.stringify({ filter, ...options }),
      }
    );
    // CommHub returns documents with nested 'data' field - extract it
    // IMPORTANT: Use doc.id as the primary ID (not data.id which may be legacy)
    return (data.documents || []).map(doc => {
      const { id: legacyId, ...restData } = doc.data || {};
      return {
        ...restData,
        id: doc.id,  // Use CommHub's document ID
        legacy_id: legacyId,  // Keep legacy ID if needed
      };
    }) as T[];
  }

  // ==================== Products ====================

  async getProducts(activeOnly = false): Promise<Product[]> {
    // CRITICAL: Filter by user_id to only show user's own products
    const userId = await this.getUserIdAsync();
    if (!userId) {
      console.warn('[CommHub] No user_id available for product filtering');
      return [];
    }
    
    if (activeOnly) {
      return this.query<Product>('qr_products', { 
        user_id: userId,
        active: { $ne: false } 
      }, { sort: { sort_order: 1 } });
    }
    
    const products = await this.query<Product>('qr_products', { 
      user_id: userId 
    });
    return products.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  async createProduct(data: Omit<Product, 'id'>): Promise<Product> {
    // Include user_id when creating products
    const userId = await this.getUserIdAsync();
    return this.create<Product>('qr_products', { 
      ...data, 
      active: true,
      user_id: userId,
    });
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

  async getOrders(status?: string, limit?: number, skip?: number): Promise<Order[]> {
    // CRITICAL: Filter by user_id to only show user's own orders
    const userId = await this.getUserIdAsync();
    if (!userId) {
      console.warn('[CommHub] No user_id available for order filtering');
      return [];
    }
    
    const queryOptions: { sort?: any; limit?: number; skip?: number } = { 
      sort: { created_at: -1 } 
    };
    if (limit) queryOptions.limit = limit;
    if (skip) queryOptions.skip = skip;
    
    const filter: any = { user_id: userId };
    if (status) {
      filter.status = status;  // Use string status: 'paid', 'pending', 'cancelled'
    }
    
    return this.query<Order>('qr_orders', filter, queryOptions);
  }

  /**
   * Get total order count for pagination
   */
  async getOrderCount(status?: string): Promise<number> {
    const userId = await this.getUserIdAsync();
    if (!userId) return 0;
    
    const filter: any = { user_id: userId };
    if (status) filter.status = status;  // Use string status
    
    // Fetch with limit 1 just to get the total count
    const response = await fetch(
      `${COMMHUB_URL}/api/data/qr_orders/query?app_id=${APP_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({
          filter,
          limit: 1,
        }),
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.total || 0;
    }
    return 0;
  }

  async createOrder(data: Omit<Order, 'id' | 'created_at' | 'user_id'>): Promise<Order> {
    const userId = await this.getUserIdAsync();
    return this.create<Order>('qr_orders', {
      ...data,
      user_id: userId,
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
    const userId = await this.getUserIdAsync();
    if (!userId) {
      console.warn('[CommHub] No user_id available for daily stats');
      return { total: 0, count: 0, average: 0, orders: [] };
    }
    
    const now = new Date();
    const startDate = new Date();
    
    if (period === 'day') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(now.getMonth() - 1);
    }

    // Fetch all paid orders and filter by date on client side
    // (CommHub may not support $gte/$lte on dates)
    const allOrders = await this.query<Order>('qr_orders', {
      user_id: userId,
      $or: [{ status: 200 }, { status: 'paid' }],
    }, { limit: 1000 });
    
    const startTime = startDate.getTime();
    const orders = allOrders.filter(order => {
      const orderTime = new Date(order.created_at).getTime();
      return orderTime >= startTime;
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

  /**
   * Get user sales statistics for admin panel
   */
  async getUserSalesStats(
    period: 'day' | 'week' | 'month' | 'year' | 'custom' = 'day',
    startDateStr?: string,
    endDateStr?: string
  ): Promise<{
    period_label: string;
    total_sales: number;
    total_orders: number;
    average_order: number;
    users: Array<{
      user_id: string;
      name: string;
      email: string;
      total_sales: number;
      order_count: number;
      average_order: number;
    }>;
    products: Array<{
      product_id: string;
      name: string;
      quantity_sold: number;
      total_revenue: number;
      average_price: number;
    }>;
  }> {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    let periodLabel = '';

    // Parse start date if provided
    if (startDateStr) {
      startDate = new Date(startDateStr);
    }
    if (endDateStr) {
      endDate = new Date(endDateStr);
    }

    // Calculate date range based on period
    if (period === 'day') {
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = startDate.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
    } else if (period === 'week') {
      const dayOfWeek = startDate.getDay();
      const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = `Vecka ${Math.ceil((startDate.getDate() + 6 - startDate.getDay()) / 7)}, ${startDate.getFullYear()}`;
    } else if (period === 'month') {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = startDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
    } else if (period === 'year') {
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = startDate.getFullYear().toString();
    } else if (period === 'custom') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = `${startDate.toLocaleDateString('sv-SE')} - ${endDate.toLocaleDateString('sv-SE')}`;
    }

    // CRITICAL: Filter by user_id for RLS
    const userId = await this.getUserIdAsync();
    if (!userId) {
      console.warn('[CommHub] No user_id available for sales stats');
      return {
        period_label: periodLabel,
        total_sales: 0,
        total_orders: 0,
        average_order: 0,
        users: [],
      };
    }

    // Fetch all paid orders for this user (CommHub may not support $gte/$lte on dates)
    // Then filter by date on the client side
    const allOrders = await this.query<Order>('qr_orders', {
      user_id: userId,
      $or: [{ status: 200 }, { status: 'paid' }],
    }, { limit: 1000 });
    
    // Filter orders by date range on client side
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    const orders = allOrders.filter(order => {
      const orderTime = new Date(order.created_at).getTime();
      return orderTime >= startTime && orderTime <= endTime;
    });

    // Calculate totals
    const totalSales = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalOrders = orders.length;
    const averageOrder = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Group by user (for org sub-users if applicable)
    const userStats = new Map<string, { 
      name: string; 
      email: string; 
      total_sales: number; 
      order_count: number;
    }>();

    // Group by product for product statistics
    const productStats = new Map<string, {
      name: string;
      quantity_sold: number;
      total_revenue: number;
    }>();

    for (const order of orders) {
      const oderId = order.user_id || 'unknown';
      const existing = userStats.get(oderId) || {
        name: 'Användare',
        email: '',
        total_sales: 0,
        order_count: 0,
      };
      existing.total_sales += order.total || 0;
      existing.order_count += 1;
      userStats.set(oderId, existing);

      // Process items for product statistics
      const items = (order as any).items || [];
      for (const item of items) {
        const productId = item.product_id || item.id || 'unknown';
        const existingProduct = productStats.get(productId) || {
          name: item.name || 'Okänd produkt',
          quantity_sold: 0,
          total_revenue: 0,
        };
        existingProduct.quantity_sold += item.quantity || 1;
        existingProduct.total_revenue += (item.price || 0) * (item.quantity || 1);
        // Update name if we have a better one
        if (item.name && existingProduct.name === 'Okänd produkt') {
          existingProduct.name = item.name;
        }
        productStats.set(productId, existingProduct);
      }
    }

    // Convert user map to array
    const users = Array.from(userStats.entries()).map(([user_id, stats]) => ({
      user_id,
      name: stats.name,
      email: stats.email,
      total_sales: stats.total_sales,
      order_count: stats.order_count,
      average_order: stats.order_count > 0 ? stats.total_sales / stats.order_count : 0,
    }));

    // Sort users by total sales descending
    users.sort((a, b) => b.total_sales - a.total_sales);

    // Convert product map to array
    const products = Array.from(productStats.entries()).map(([product_id, stats]) => ({
      product_id,
      name: stats.name,
      quantity_sold: stats.quantity_sold,
      total_revenue: stats.total_revenue,
      average_price: stats.quantity_sold > 0 ? stats.total_revenue / stats.quantity_sold : 0,
    }));

    // Sort products by quantity sold descending
    products.sort((a, b) => b.quantity_sold - a.quantity_sold);

    return {
      period_label: periodLabel,
      total_sales: totalSales,
      total_orders: totalOrders,
      average_order: averageOrder,
      users,
      products,
    };
  }

  // ==================== Settings ====================

  async getSettings(): Promise<Settings> {
    // CRITICAL: Filter by user_id to get user's own settings
    const userId = await this.getUserIdAsync();
    if (!userId) {
      console.warn('[CommHub] No user_id available for settings');
      return {};
    }
    
    const settings = await this.query<Settings>('qr_settings', { user_id: userId }, { limit: 1 });
    return settings[0] || {};
  }

  /**
   * Get system-wide settings (from qr_system_settings collection)
   * Used for subscription payment phone number etc.
   */
  async getSystemSettings(): Promise<{ contact_phone?: string; contact_email?: string; app_name?: string; swish_number?: string } | null> {
    try {
      const settings = await this.query<any>('qr_system_settings', {}, { limit: 1 });
      return settings[0] || null;
    } catch (e) {
      console.warn('[CommHub] Failed to get system settings:', e);
      return null;
    }
  }

  async updateSettings(data: Partial<Settings>): Promise<Settings> {
    const userId = await this.getUserIdAsync();
    const existing = await this.getSettings();
    if (existing.id) {
      return this.update<Settings>('qr_settings', existing.id, data);
    } else {
      return this.create<Settings>('qr_settings', { ...data, user_id: userId });
    }
  }

  async verifyPin(pin: string): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.admin_pin === pin;
  }

  // ==================== Parked Carts ====================

  async getParkedCarts(): Promise<ParkedCart[]> {
    // CRITICAL: Filter by user_id to get user's own parked carts
    const userId = await this.getUserIdAsync();
    if (!userId) {
      console.warn('[CommHub] No user_id available for parked carts');
      return [];
    }
    
    return this.query<ParkedCart>('qr_parked_carts', { user_id: userId });
  }

  async createParkedCart(data: Omit<ParkedCart, 'id' | 'created_at' | 'user_id'>): Promise<ParkedCart> {
    const userId = await this.getUserIdAsync();
    return this.create<ParkedCart>('qr_parked_carts', {
      ...data,
      user_id: userId,
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

  // ==================== Legacy Backend Fetch (DISABLED - Backend removed) ====================

  /**
   * Legacy fetch method - returns error since backend is removed
   * Features like pair-display need to be migrated to CommHub
   */
  async fetch(path: string, options: RequestInit = {}): Promise<any> {
    throw new Error('Denna funktion är inte tillgänglig. Backend har tagits bort.');
  }

  // ==================== EMAIL ====================

  /**
   * Send email via CommHub
   */
  async sendEmail(params: {
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ success: boolean; message_id?: string }> {
    const response = await fetch(`${COMMHUB_URL}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        app_id: APP_ID,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html_content: params.html,
        text_content: params.text,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Kunde inte skicka e-post');
    }

    return response.json();
  }

  /**
   * Send receipt email to customer
   */
  async sendReceipt(order: Order, customerEmail: string): Promise<void> {
    const items = order.items || [];
    const itemsHtml = items.map((item: any) => 
      `<tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${(item.price * item.quantity).toFixed(2)} kr</td>
      </tr>`
    ).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: #22c55e; color: white; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 24px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th { text-align: left; padding: 8px; border-bottom: 2px solid #22c55e; }
          .total { font-size: 24px; font-weight: bold; color: #22c55e; text-align: right; margin-top: 16px; }
          .footer { text-align: center; padding: 16px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Tack för ditt köp!</h1>
          </div>
          <div class="content">
            <p>Här är ditt kvitto:</p>
            <table>
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th style="text-align: center;">Antal</th>
                  <th style="text-align: right;">Pris</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            <div class="total">Totalt: ${(order.total || 0).toFixed(2)} kr</div>
            <p style="color: #666; font-size: 14px; margin-top: 24px;">
              Ordernummer: ${order.id}<br>
              Datum: ${new Date(order.created_at).toLocaleString('sv-SE')}
            </p>
          </div>
          <div class="footer">
            Powered by QR-Kassan<br>
            <a href="mailto:support@frontproduction.se">Support</a> · <a href="https://support.frontproduction.se/support/69bf526cd5d2ae24bbbc28e9">Hjälpcenter</a>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: customerEmail,
      subject: `Kvitto - ${(order.total || 0).toFixed(2)} kr`,
      html,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetToken: string, appUrl: string): Promise<void> {
    const resetLink = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: #3b82f6; color: white; padding: 24px; text-align: center; }
          .content { padding: 24px; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0; }
          .footer { text-align: center; padding: 16px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Återställ lösenord</h1>
          </div>
          <div class="content">
            <p>Du har begärt att återställa ditt lösenord för QR-Kassan.</p>
            <p>Klicka på knappen nedan för att välja ett nytt lösenord:</p>
            <p style="text-align: center;">
              <a href="${resetLink}" class="button">Återställ lösenord</a>
            </p>
            <p style="color: #666; font-size: 14px;">
              Om du inte begärt detta kan du ignorera detta mail.<br>
              Länken är giltig i 1 timme.
            </p>
          </div>
          <div class="footer">
            Powered by QR-Kassan<br>
            <a href="mailto:support@frontproduction.se">Support</a> · <a href="https://support.frontproduction.se/support/69bf526cd5d2ae24bbbc28e9">Hjälpcenter</a>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Återställ lösenord - QR-Kassan',
      html,
    });
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(email: string, name: string, loginCode?: string, organizationName?: string, swishNumber?: string, phone?: string): Promise<void> {
    const manualUrl = 'https://d20xqn30bfw65x.cloudfront.net/fcd81e2d/documents/7d92485d/71866d44-b712-4f93-a19e-d58c4547d5a5.html';
    const createdDate = new Date().toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 40px 32px; text-align: center; }
          .header h1 { margin: 0 0 8px; font-size: 32px; }
          .header p { margin: 0; opacity: 0.9; font-size: 18px; }
          .content { padding: 32px; }
          .code { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 24px; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; color: #16a34a; }
          .info-box { background: #f9fafb; border-radius: 12px; padding: 24px; margin: 24px 0; }
          .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
          .info-row:last-child { border-bottom: none; }
          .info-label { color: #6b7280; font-size: 14px; }
          .info-value { font-weight: 600; color: #1f2937; }
          .button { display: inline-block; background: #22c55e; color: white; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
          .button-secondary { display: inline-block; background: #f3f4f6; color: #374151; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 8px; }
          .steps { margin: 24px 0; }
          .step { display: flex; gap: 16px; margin-bottom: 20px; align-items: flex-start; }
          .step-num { background: #22c55e; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; flex-shrink: 0; }
          .step-text { flex: 1; }
          .step-text strong { display: block; margin-bottom: 4px; color: #1f2937; }
          .step-text p { margin: 0; color: #6b7280; font-size: 14px; }
          .feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
          .feature { background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center; }
          .feature-icon { font-size: 28px; margin-bottom: 8px; }
          .feature-title { font-weight: 600; color: #1f2937; margin-bottom: 4px; }
          .feature-desc { font-size: 12px; color: #6b7280; }
          .highlight { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0; }
          .highlight strong { color: #16a34a; }
          .section-title { font-size: 20px; color: #1f2937; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
          .tips { background: #fef3c7; border-radius: 8px; padding: 16px; margin: 24px 0; }
          .tips-title { color: #92400e; font-weight: 600; margin-bottom: 8px; }
          .tips ul { margin: 0; padding-left: 20px; color: #92400e; }
          .tips li { margin-bottom: 4px; }
          .footer { text-align: center; padding: 24px; color: #6b7280; font-size: 13px; background: #f9fafb; }
          .footer a { color: #22c55e; text-decoration: none; }
          @media (max-width: 500px) {
            .feature-grid { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Välkommen till QR-Kassan!</h1>
            <p>Sveriges smartaste kassasystem för småföretagare</p>
          </div>
          <div class="content">
            <p style="font-size: 18px; margin-bottom: 24px;">Hej <strong>${name || 'där'}</strong>!</p>
            
            <p>Grattis till ditt nya QR-Kassan-konto! Du har nu tillgång till ett komplett kassasystem som gör det enkelt att ta betalt – var du än befinner dig.</p>

            <p>Med QR-Kassan kan du ta emot <strong>Swish-betalningar</strong> via QR-kod, hantera <strong>kontantbetalningar</strong>, hålla koll på din <strong>försäljningsstatistik</strong> och mycket mer. Appen fungerar på både mobil och webb, och det bästa av allt – <strong>den fungerar även offline!</strong></p>

            ${loginCode ? `
            <div class="section-title">🔐 Din inloggningskod</div>
            <div class="code">${loginCode}</div>
            <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: -8px;">
              Memorera eller spara denna kod säkert – du kan logga in med den även utan internet!
            </p>
            ` : ''}

            <div class="info-box">
              <h3 style="margin: 0 0 16px; font-size: 18px; color: #374151;">📋 Dina registrerade uppgifter</h3>
              <div class="info-row">
                <span class="info-label">Konto skapat</span>
                <span class="info-value">${createdDate}</span>
              </div>
              <div class="info-row">
                <span class="info-label">E-postadress</span>
                <span class="info-value">${email}</span>
              </div>
              ${name ? `
              <div class="info-row">
                <span class="info-label">Namn</span>
                <span class="info-value">${name}</span>
              </div>
              ` : ''}
              ${organizationName ? `
              <div class="info-row">
                <span class="info-label">Företag/Organisation</span>
                <span class="info-value">${organizationName}</span>
              </div>
              ` : ''}
              ${phone ? `
              <div class="info-row">
                <span class="info-label">Telefonnummer</span>
                <span class="info-value">${phone}</span>
              </div>
              ` : ''}
              ${swishNumber ? `
              <div class="info-row">
                <span class="info-label">Swish-nummer</span>
                <span class="info-value">${swishNumber}</span>
              </div>
              ` : ''}
              ${loginCode ? `
              <div class="info-row">
                <span class="info-label">Inloggningskod</span>
                <span class="info-value" style="font-family: monospace; letter-spacing: 2px;">${loginCode}</span>
              </div>
              ` : ''}
            </div>

            <div class="section-title">✨ Vad kan du göra med QR-Kassan?</div>
            <div class="feature-grid">
              <div class="feature">
                <div class="feature-icon">📱</div>
                <div class="feature-title">Swish QR-kod</div>
                <div class="feature-desc">Generera QR-koder för snabba Swish-betalningar</div>
              </div>
              <div class="feature">
                <div class="feature-icon">💵</div>
                <div class="feature-title">Kontanthantering</div>
                <div class="feature-desc">Registrera kontantbetalningar enkelt</div>
              </div>
              <div class="feature">
                <div class="feature-icon">📊</div>
                <div class="feature-title">Statistik</div>
                <div class="feature-desc">Se din försäljning per dag, vecka eller månad</div>
              </div>
              <div class="feature">
                <div class="feature-icon">👥</div>
                <div class="feature-title">Personalhantering</div>
                <div class="feature-desc">Bjud in medarbetare med egna inloggningar</div>
              </div>
              <div class="feature">
                <div class="feature-icon">🛒</div>
                <div class="feature-title">Parkera varukorg</div>
                <div class="feature-desc">Pausa en order och hjälp nästa kund</div>
              </div>
              <div class="feature">
                <div class="feature-icon">📧</div>
                <div class="feature-title">Digitala kvitton</div>
                <div class="feature-desc">Skicka kvitton direkt till kundens e-post</div>
              </div>
            </div>

            <div class="highlight">
              <strong>💡 Visste du?</strong> QR-Kassan fungerar även offline! Du kan logga in, ta emot betalningar och skapa ordrar utan internetuppkoppling. Allt synkas automatiskt när du kommer online igen.
            </div>

            <div class="section-title">🚀 Kom igång på 5 minuter</div>
            <div class="steps">
              <div class="step">
                <div class="step-num">1</div>
                <div class="step-text">
                  <strong>Ladda ner appen</strong>
                  <p>Sök efter "QR-Kassan" i App Store (iPhone) eller Google Play (Android). Du kan även använda webbversionen på din dator.</p>
                </div>
              </div>
              <div class="step">
                <div class="step-num">2</div>
                <div class="step-text">
                  <strong>Logga in med din kod</strong>
                  <p>Skriv in din 8-siffriga inloggningskod ${loginCode ? `<strong>${loginCode}</strong>` : ''} på startskärmen. Du kan också logga in med e-post och lösenord.</p>
                </div>
              </div>
              <div class="step">
                <div class="step-num">3</div>
                <div class="step-text">
                  <strong>Ställ in ditt Swish-nummer</strong>
                  <p>Gå till Profil-fliken och ange ditt Swish-nummer för att kunna ta emot betalningar.</p>
                </div>
              </div>
              <div class="step">
                <div class="step-num">4</div>
                <div class="step-text">
                  <strong>Lägg till dina produkter</strong>
                  <p>Under Admin-fliken kan du lägga till produkter med namn, pris och bild. Organisera dem i kategorier för snabbare kassaarbete.</p>
                </div>
              </div>
              <div class="step">
                <div class="step-num">5</div>
                <div class="step-text">
                  <strong>Börja sälja!</strong>
                  <p>Gå till Kassa-fliken, välj produkter och generera en Swish QR-kod. Kunden skannar och betalar – klart!</p>
                </div>
              </div>
            </div>

            <div class="tips">
              <div class="tips-title">💡 Tips för att få ut det mesta av QR-Kassan:</div>
              <ul>
                <li>Lägg till produktbilder – det gör kassan snabbare och snyggare</li>
                <li>Använd kategorier för att organisera din meny</li>
                <li>Bjud in din personal så de får egna inloggningskoder</li>
                <li>Kolla statistiken regelbundet för att se vad som säljer bäst</li>
              </ul>
            </div>

            <p style="text-align: center; margin-top: 32px;">
              <a href="${manualUrl}" class="button" style="color: white;">📖 Läs hela manualen</a>
            </p>
            <p style="text-align: center; margin-top: 8px;">
              <a href="https://apps.apple.com/app/qr-kassan" class="button-secondary">App Store</a>
              <a href="https://play.google.com/store/apps/details?id=com.qrkassan" class="button-secondary">Google Play</a>
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-top: 32px; text-align: center;">
              <strong>Behöver du hjälp?</strong><br>
              Vi finns här för dig! Kontakta oss på <a href="mailto:support@frontproduction.se">support@frontproduction.se</a><br>
              eller besök vårt <a href="https://support.frontproduction.se/support/69bf526cd5d2ae24bbbc28e9">hjälpcenter</a> för guider och vanliga frågor.
            </p>
          </div>
          <div class="footer">
            <p style="font-size: 14px; margin-bottom: 12px;">Tack för att du valde QR-Kassan! 💚</p>
            <p>© 2024 QR-Kassan. Alla rättigheter förbehållna.</p>
            <p><a href="${manualUrl}">Manual</a> · <a href="mailto:support@frontproduction.se">Support</a> · <a href="https://support.frontproduction.se/support/69bf526cd5d2ae24bbbc28e9">Hjälpcenter</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: '🎉 Välkommen till QR-Kassan! Ditt konto är redo',
      html,
    });
  }

  /**
   * Send invite email to sub-user
   */
  async sendInviteEmail(email: string, name: string, loginCode: string, organizationName: string): Promise<void> {
    const manualUrl = 'https://d20xqn30bfw65x.cloudfront.net/fcd81e2d/documents/7d92485d/71866d44-b712-4f93-a19e-d58c4547d5a5.html';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 32px; text-align: center; }
          .header h1 { margin: 0 0 8px; font-size: 28px; }
          .header p { margin: 0; opacity: 0.9; font-size: 16px; }
          .content { padding: 32px; }
          .code { background: #f5f3ff; border: 2px solid #8b5cf6; border-radius: 12px; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 24px 0; color: #7c3aed; }
          .info-box { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          .info-row:last-child { border-bottom: none; }
          .info-label { color: #6b7280; font-size: 14px; }
          .info-value { font-weight: 600; color: #1f2937; }
          .button { display: inline-block; background: #8b5cf6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0; }
          .steps { margin: 24px 0; }
          .step { display: flex; gap: 16px; margin-bottom: 16px; align-items: flex-start; }
          .step-num { background: #8b5cf6; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0; }
          .step-text { flex: 1; }
          .step-text strong { display: block; margin-bottom: 4px; }
          .highlight { background: #f5f3ff; border-left: 4px solid #8b5cf6; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
          .footer { text-align: center; padding: 24px; color: #6b7280; font-size: 13px; background: #f9fafb; }
          .footer a { color: #8b5cf6; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Du har bjudits in!</h1>
            <p>Bli en del av ${organizationName}</p>
          </div>
          <div class="content">
            <p style="font-size: 18px; margin-bottom: 24px;">Hej <strong>${name || 'där'}</strong>!</p>
            
            <p>Du har bjudits in att använda <strong>QR-Kassan</strong> för <strong>${organizationName}</strong>. Med QR-Kassan kan du enkelt ta emot Swish-betalningar via QR-kod.</p>

            <p style="margin-top: 24px;"><strong>Din personliga inloggningskod:</strong></p>
            <div class="code">${loginCode}</div>
            
            <div class="highlight">
              <strong>💡 Bra att veta:</strong> Din inloggningskod fungerar även när du är offline! Perfekt om du behöver ta betalt på platser med dålig uppkoppling.
            </div>

            <div class="info-box">
              <h3 style="margin: 0 0 16px; font-size: 16px; color: #374151;">Dina uppgifter</h3>
              <div class="info-row">
                <span class="info-label">E-post</span>
                <span class="info-value">${email}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Organisation</span>
                <span class="info-value">${organizationName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Inloggningskod</span>
                <span class="info-value">${loginCode}</span>
              </div>
            </div>

            <h3 style="margin: 32px 0 16px;">Så kommer du igång:</h3>
            <div class="steps">
              <div class="step">
                <div class="step-num">1</div>
                <div class="step-text">
                  <strong>Ladda ner appen</strong>
                  Sök efter "QR-Kassan" i App Store (iPhone) eller Google Play (Android).
                </div>
              </div>
              <div class="step">
                <div class="step-num">2</div>
                <div class="step-text">
                  <strong>Ange din kod</strong>
                  Skriv in koden <strong>${loginCode}</strong> på inloggningsskärmen.
                </div>
              </div>
              <div class="step">
                <div class="step-num">3</div>
                <div class="step-text">
                  <strong>Börja sälja!</strong>
                  Du är nu redo att ta emot betalningar för ${organizationName}.
                </div>
              </div>
            </div>

            <p style="text-align: center; margin-top: 32px;">
              <a href="${manualUrl}" class="button" style="color: white;">Läs hela manualen</a>
            </p>
          </div>
          <div class="footer">
            <p>Detta mail skickades från ${organizationName} via QR-Kassan.</p>
            <p><a href="${manualUrl}">Manual</a> · <a href="mailto:support@frontproduction.se">Support</a> · <a href="https://support.frontproduction.se/support/69bf526cd5d2ae24bbbc28e9">Hjälpcenter</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: `Du har bjudits in till ${organizationName} - Dina inloggningsuppgifter`,
      html,
    });
  }

  /**
   * Change password for current user
   */
  async changePassword(newPassword: string): Promise<void> {
    const userId = await this.getUserIdAsync();
    if (!userId) {
      throw new Error('Du måste vara inloggad för att ändra lösenord');
    }

    // Get current user data from qr_users
    const users = await this.query<any>('qr_users', { user_id: userId }, { limit: 1 });
    if (users.length === 0) {
      throw new Error('Användaren hittades inte');
    }

    const user = users[0];
    
    // Update password in qr_users - Note: In production, you should hash the password
    // CommHub handles this on their end for Public Auth, but for legacy data we store it
    await this.update('qr_users', user._doc_id || user.id, {
      password: newPassword,
      updated_at: new Date().toISOString(),
    });
  }

  // ==================== SUB-USER MANAGEMENT ====================

  /**
   * Generate a random login code
   */
  private generateLoginCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Generate a random password
   */
  private generatePassword(): string {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Get all sub-users for the current user's organization
   */
  async getSubUsers(): Promise<any[]> {
    const userId = await this.getUserIdAsync();
    if (!userId) return [];

    // Get org_id from current user
    const currentUser = await AsyncStorage.getItem(USER_KEY);
    let orgId = userId;
    if (currentUser) {
      const userData = JSON.parse(currentUser);
      orgId = userData.org_id || userId;
    }

    const users = await this.query<any>('qr_org_users', { org_id: orgId }, { limit: 100 });
    return users.map(u => ({
      user_id: u.user_id || u.id,
      email: u.email,
      name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      first_name: u.first_name,
      last_name: u.last_name,
      login_code: u.login_code,
      last_login: u.last_login,
      created_at: u.created_at,
      _doc_id: u._doc_id || u.id,
    }));
  }

  /**
   * Create a new sub-user
   */
  async createSubUser(data: { first_name: string; last_name: string; email: string }): Promise<{ user: any; login_code: string }> {
    const userId = await this.getUserIdAsync();
    if (!userId) {
      throw new Error('Du måste vara inloggad');
    }

    // Get org info from current user
    const currentUser = await AsyncStorage.getItem(USER_KEY);
    let orgId = userId;
    let orgName = '';
    if (currentUser) {
      const userData = JSON.parse(currentUser);
      orgId = userData.org_id || userId;
      orgName = userData.organization_name || '';
    }

    // Generate login code and password
    const loginCode = this.generateLoginCode();
    const password = this.generatePassword();
    const newUserId = `org_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newUser = {
      user_id: newUserId,
      org_id: orgId,
      email: data.email.toLowerCase(),
      first_name: data.first_name,
      last_name: data.last_name,
      name: `${data.first_name} ${data.last_name}`.trim(),
      login_code: loginCode,
      password: password,
      role: 'user',
      created_at: new Date().toISOString(),
    };

    await this.create('qr_org_users', newUser);

    // Send welcome/invite email
    await this.sendInviteEmail(data.email, newUser.name, loginCode, orgName);

    return { user: newUser, login_code: loginCode };
  }

  /**
   * Delete a sub-user
   */
  async deleteSubUser(subUserId: string): Promise<void> {
    // Find the user document
    const users = await this.query<any>('qr_org_users', { user_id: subUserId }, { limit: 1 });
    if (users.length === 0) {
      throw new Error('Användaren hittades inte');
    }
    
    await this.delete('qr_org_users', users[0]._doc_id || users[0].id);
  }

  /**
   * Regenerate login code for a sub-user
   */
  async regenerateSubUserCode(subUserId: string): Promise<string> {
    const users = await this.query<any>('qr_org_users', { user_id: subUserId }, { limit: 1 });
    if (users.length === 0) {
      throw new Error('Användaren hittades inte');
    }

    const newCode = this.generateLoginCode();
    await this.update('qr_org_users', users[0]._doc_id || users[0].id, {
      login_code: newCode,
      updated_at: new Date().toISOString(),
    });

    return newCode;
  }

  /**
   * Reset password for a sub-user
   */
  async resetSubUserPassword(subUserId: string): Promise<string> {
    const users = await this.query<any>('qr_org_users', { user_id: subUserId }, { limit: 1 });
    if (users.length === 0) {
      throw new Error('Användaren hittades inte');
    }

    const newPassword = this.generatePassword();
    await this.update('qr_org_users', users[0]._doc_id || users[0].id, {
      password: newPassword,
      updated_at: new Date().toISOString(),
    });

    return newPassword;
  }

  /**
   * Send credentials to a sub-user (regenerates both code and password)
   */
  async sendSubUserCredentials(subUserId: string): Promise<void> {
    const users = await this.query<any>('qr_org_users', { user_id: subUserId }, { limit: 1 });
    if (users.length === 0) {
      throw new Error('Användaren hittades inte');
    }

    const user = users[0];
    const newCode = this.generateLoginCode();
    const newPassword = this.generatePassword();

    // Update user with new credentials
    await this.update('qr_org_users', user._doc_id || user.id, {
      login_code: newCode,
      password: newPassword,
      updated_at: new Date().toISOString(),
    });

    // Get org name
    const currentUser = await AsyncStorage.getItem(USER_KEY);
    let orgName = '';
    if (currentUser) {
      const userData = JSON.parse(currentUser);
      orgName = userData.organization_name || '';
    }

    // Send invite email with new credentials
    await this.sendInviteEmail(
      user.email,
      user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      newCode,
      orgName
    );
  }
}

// ==================== Singleton Export ====================

export const commhub = new CommHubService();

// Legacy compatibility - export as api too
export const api = commhub;
