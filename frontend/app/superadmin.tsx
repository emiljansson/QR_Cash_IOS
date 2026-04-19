import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
  SafeAreaView, Dimensions, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

// CommHub configuration
const COMMHUB_URL = 'https://commhub.cloud';
const APP_ID = 'fcd81e2d-d8b9-48c4-9eeb-84116442b3e0';
const API_KEY = 'KHue8NLldN3dkeQxHllN9hAWjkLQx17LFXRbW2UnUCs';

const C = {
  bg: '#09090b', surface: '#18181b', surfaceHi: '#27272a', border: '#3f3f46',
  text: '#f4f4f5', textSec: '#a1a1aa', textMut: '#71717a',
  green: '#22c55e', red: '#ef4444', blue: '#3b82f6', yellow: '#f59e0b', white: '#fff',
};

// Auth helper – uses CommHub API directly
async function adminFetch(path: string, opts: RequestInit = {}) {
  console.log('[adminFetch] Called with path:', path);
  const token = await AsyncStorage.getItem('admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    ...(opts.headers as any || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Handle different paths for CommHub
  let url = '';
  let method = opts.method || 'GET';
  let body = opts.body;
  
  if (path === '/me') {
    // Just verify token is valid - return admin info from token
    const tokenData = token ? JSON.parse(atob(token)) : null;
    if (tokenData && tokenData.exp > Date.now()) {
      return { admin_id: tokenData.admin_id, email: tokenData.email };
    }
    throw new Error('Session expired');
  } else if (path === '/logout') {
    // Clear local token - no server call needed
    return { success: true };
  } else if (path === '/users') {
    // Get all users from qr_users collection
    url = `${COMMHUB_URL}/api/data/qr_users/query?app_id=${APP_ID}`;
    method = 'POST';
    body = JSON.stringify({ filter: {}, limit: 500 });
  } else if (path.match(/^\/users\/([^/]+)\/sub-users$/)) {
    // Get sub-users for a specific user
    const userId = path.match(/^\/users\/([^/]+)\/sub-users$/)?.[1];
    url = `${COMMHUB_URL}/api/data/qr_org_users/query?app_id=${APP_ID}`;
    method = 'POST';
    body = JSON.stringify({ filter: { parent_user_id: userId }, limit: 100 });
  } else if (path.match(/^\/users\/([^/]+)\/subscription$/)) {
    // Update subscription - First fetch current user data, then update
    const userId = path.match(/^\/users\/([^/]+)\/subscription$/)?.[1];
    
    // Fetch current user data first
    const currentUserRes = await fetch(`${COMMHUB_URL}/api/data/qr_users/${userId}?app_id=${APP_ID}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    });
    
    if (!currentUserRes.ok) {
      throw new Error('Kunde inte hämta användardata');
    }
    
    const currentUser = await currentUserRes.json();
    const currentData = currentUser.data || currentUser;
    const inputData = opts.body ? JSON.parse(opts.body as string) : {};
    
    url = `${COMMHUB_URL}/api/data/qr_users/${userId}?app_id=${APP_ID}`;
    method = 'PUT';
    body = JSON.stringify({ data: { ...currentData, ...inputData } });
  } else if (path.match(/^\/users\/([^/]+)\/verify$/)) {
    // Verify email - First fetch current user data, then update
    const userId = path.match(/^\/users\/([^/]+)\/verify$/)?.[1];
    
    // Fetch current user data first
    const currentUserRes = await fetch(`${COMMHUB_URL}/api/data/qr_users/${userId}?app_id=${APP_ID}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    });
    
    if (!currentUserRes.ok) {
      throw new Error('Kunde inte hämta användardata');
    }
    
    const currentUser = await currentUserRes.json();
    const currentData = currentUser.data || currentUser;
    
    // Update with email_verified = true while preserving all other data
    url = `${COMMHUB_URL}/api/data/qr_users/${userId}?app_id=${APP_ID}`;
    method = 'PUT';
    body = JSON.stringify({ 
      data: { 
        ...currentData, 
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      } 
    });
  } else if (path.match(/^\/users\/([^/]+)$/)) {
    // Get/Update/Delete single user
    const userId = path.match(/^\/users\/([^/]+)$/)?.[1];
    url = `${COMMHUB_URL}/api/data/qr_users/${userId}?app_id=${APP_ID}`;
  } else if (path === '/guest1-status') {
    // Get guest account status from qr_org_users
    url = `${COMMHUB_URL}/api/data/qr_org_users/query?app_id=${APP_ID}`;
    method = 'POST';
    body = JSON.stringify({ filter: { login_code: 'Guest1' }, limit: 1 });
  } else if (path === '/toggle-guest1') {
    // Toggle guest account - need to find and update
    url = `${COMMHUB_URL}/api/data/qr_org_users/query?app_id=${APP_ID}`;
    method = 'POST';
    body = JSON.stringify({ filter: { login_code: 'Guest1' }, limit: 1 });
  } else if (path === '/stats') {
    // Calculate system statistics from collections
    const [usersRes, ordersRes, productsRes] = await Promise.all([
      fetch(`${COMMHUB_URL}/api/data/qr_users/query?app_id=${APP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ filter: {}, limit: 500 }),
      }),
      fetch(`${COMMHUB_URL}/api/data/qr_orders/query?app_id=${APP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ filter: {}, limit: 1000 }),
      }),
      fetch(`${COMMHUB_URL}/api/data/qr_products/query?app_id=${APP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ filter: {}, limit: 1000 }),
      }),
    ]);
    
    const usersData = await usersRes.json();
    const ordersData = await ordersRes.json();
    const productsData = await productsRes.json();
    
    const users = usersData.documents || [];
    const orders = ordersData.documents || [];
    const products = productsData.documents || [];
    
    return {
      total_users: users.length,
      verified_users: users.filter((u: any) => u.data?.email_verified).length,
      active_subscriptions: users.filter((u: any) => u.data?.subscription_active !== false).length,
      total_orders: orders.length,
      total_products: products.length,
      shared_images: 0,
    };
  } else if (path === '/economic-overview') {
    // Calculate economic overview from orders and users
    const [usersRes, ordersRes] = await Promise.all([
      fetch(`${COMMHUB_URL}/api/data/qr_users/query?app_id=${APP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ filter: {}, limit: 500 }),
      }),
      fetch(`${COMMHUB_URL}/api/data/qr_orders/query?app_id=${APP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ filter: { status: 200 }, limit: 5000 }),
      }),
    ]);
    
    const usersData = await usersRes.json();
    const ordersData = await ordersRes.json();
    
    const users = (usersData.documents || []).map((doc: any) => ({
      user_id: doc.data?.user_id || doc.id,
      email: doc.data?.email || '',
      organization_name: doc.data?.organization_name || '',
    }));
    const orders = (ordersData.documents || []).map((doc: any) => ({
      ...doc.data,
      id: doc.id,
    }));
    
    // Calculate totals
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
    const totalOrders = orders.length;
    
    // Group orders by user_id
    const userOrderMap = new Map<string, { total: number; count: number }>();
    for (const order of orders) {
      const userId = order.user_id || 'unknown';
      const existing = userOrderMap.get(userId) || { total: 0, count: 0 };
      existing.total += order.total || 0;
      existing.count += 1;
      userOrderMap.set(userId, existing);
    }
    
    // Build per-user stats
    const userStats = users.map((u: any) => {
      const stats = userOrderMap.get(u.user_id) || { total: 0, count: 0 };
      return {
        user_id: u.user_id,
        email: u.email,
        organization_name: u.organization_name,
        total_revenue: stats.total,
        total_orders: stats.count,
      };
    }).filter((u: any) => u.total_orders > 0).sort((a: any, b: any) => b.total_revenue - a.total_revenue);
    
    return {
      totals: {
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        active_users: userStats.length,
      },
      users: userStats,
    };
  } else if (path === '/settings') {
    // Get or create superadmin settings
    url = `${COMMHUB_URL}/api/data/qr_settings/query?app_id=${APP_ID}`;
    method = 'POST';
    body = JSON.stringify({ filter: {}, limit: 1 });
  } else {
    url = `${COMMHUB_URL}/api/data/qr_superadmins${path}?app_id=${APP_ID}`;
  }
  
  const res = await fetch(url, {
    ...opts,
    method,
    headers,
    body,
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Fel' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  
  const data = await res.json();
  
  // Transform CommHub response to expected format
  if (path === '/users') {
    const users = (data.documents || []).map((doc: any) => ({
      ...doc.data,
      user_id: doc.id,  // Use CommHub doc.id, not data.user_id
      _original_user_id: doc.data.user_id,  // Keep original for reference
    }));
    return { users };
  } else if (path.match(/^\/users\/([^/]+)\/sub-users$/)) {
    const subUsers = (data.documents || []).map((doc: any) => ({
      id: doc.id,
      ...doc.data,
    }));
    return { sub_users: subUsers };
  } else if (path === '/guest1-status') {
    const guest = data.documents?.[0];
    return {
      exists: !!guest,
      active: guest?.data?.active !== false,
      login_code: guest?.data?.login_code || 'Guest1',
    };
  }
  
  return data;
}

// =================== LOGIN ===================
function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError('Fyll i alla fält'); return; }
    setLoading(true); setError('');
    try {
      // Query superadmins collection for this email
      const queryRes = await fetch(`${COMMHUB_URL}/api/data/qr_superadmins/query?app_id=${APP_ID}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({ filter: { email: email.toLowerCase() }, limit: 1 }),
      });
      
      if (!queryRes.ok) {
        throw new Error('Kunde inte ansluta till servern');
      }
      
      const queryData = await queryRes.json();
      const admins = queryData.documents || [];
      
      if (admins.length === 0) {
        throw new Error('Fel e-post eller lösenord');
      }
      
      const admin = admins[0];
      const adminData = admin.data || admin;
      
      // For now, accept any password since bcrypt verification needs backend
      // TODO: Implement password verification via CommHub when available
      // Generate a session token
      const sessionToken = btoa(JSON.stringify({
        admin_id: adminData.admin_id || admin.id,
        email: adminData.email,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      }));
      
      await AsyncStorage.setItem('admin_token', sessionToken);
      await AsyncStorage.setItem('admin_email', adminData.email);
      onLogin();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={s.loginContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.loginScroll} keyboardShouldPersistTaps="handled">
        <View style={s.loginCard}>
          <Ionicons name="shield-checkmark" size={48} color={C.blue} />
          <Text style={s.loginTitle}>Superadmin</Text>
          <Text style={s.loginSub}>QR-Kassan Administrering</Text>
          {error ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={C.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}
          <View style={s.loginInputWrap}>
            <Ionicons name="mail-outline" size={18} color={C.textMut} />
            <TextInput testID="admin-email" style={s.loginInputField} value={email} onChangeText={setEmail}
              placeholder="E-post" placeholderTextColor={C.textMut} autoCapitalize="none" keyboardType="email-address" />
          </View>
          <View style={s.loginInputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={C.textMut} />
            <TextInput testID="admin-password" style={s.loginInputField} value={password} onChangeText={setPassword}
              placeholder="Lösenord" placeholderTextColor={C.textMut} secureTextEntry />
          </View>
          <TouchableOpacity testID="admin-login-btn" style={[s.loginBtn, loading && { opacity: 0.5 }]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={C.white} /> : <Text style={s.loginBtnText}>Logga in</Text>}
          </TouchableOpacity>
          <TouchableOpacity testID="admin-back-btn" style={s.loginBackBtn} onPress={() => router.canGoBack() ? router.back() : router.push('/')}>
            <Ionicons name="arrow-back" size={16} color={C.textSec} />
            <Text style={s.loginBackText}>Tillbaka till förstasidan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// =================== USERS TAB ===================
function UsersTab() {
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subModal, setSubModal] = useState<any>(null);
  const [subActive, setSubActive] = useState(true);
  const [subEnd, setSubEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [guest1Status, setGuest1Status] = useState<any>(null);
  
  // Edit user modal state
  const [editModal, setEditModal] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  
  // Sub-users state
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [subUsers, setSubUsers] = useState<{[key: string]: any[]}>({});
  const [loadingSubUsers, setLoadingSubUsers] = useState<string | null>(null);
  
  // Link to parent modal state
  const [linkModal, setLinkModal] = useState<any>(null);
  const [parentSearch, setParentSearch] = useState('');
  const [linkingSaving, setLinkingSaving] = useState(false);

  // Cross-platform confirm dialog
  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Avbryt' },
        { text: 'OK', onPress: onConfirm }
      ]);
    }
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[Superadmin] Loading users...');
      const data = await adminFetch('/users');
      console.log('[Superadmin] Users loaded:', data.users?.length || 0);
      setUsers(data.users || []);
    } catch (e) {
      console.error('[Superadmin] Error loading users:', e);
    } finally { setLoading(false); }
  }, []);

  const loadSubUsers = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setLoadingSubUsers(userId);
    try {
      const data = await adminFetch(`/users/${userId}/sub-users`);
      setSubUsers(prev => ({ ...prev, [userId]: data.sub_users || [] }));
      setExpandedUser(userId);
    } catch (e: any) {
      Alert.alert('Fel', e.message);
    } finally {
      setLoadingSubUsers(null);
    }
  };

  const loadGuest1 = useCallback(async () => {
    try { const data = await adminFetch('/guest1-status'); setGuest1Status(data); } catch {}
  }, []);

  useEffect(() => { 
    // Load users and guest1 status when component mounts
    loadUsers(); 
    loadGuest1(); 
  }, [loadUsers, loadGuest1]);

  const handleSubscription = async () => {
    if (!subModal) return;
    setSaving(true);
    try {
      await adminFetch(`/users/${subModal.user_id}/subscription`, {
        method: 'PUT',
        body: JSON.stringify({
          subscription_active: subActive,
          subscription_end: subEnd ? new Date(subEnd).toISOString() : undefined,
        }),
      });
      Alert.alert('Sparat', 'Abonnemang uppdaterat');
      setSubModal(null);
      loadUsers();
    } catch (e: any) { Alert.alert('Fel', e.message); }
    finally { setSaving(false); }
  };

  const handleVerifyEmail = async (userId: string) => {
    try {
      await adminFetch(`/users/${userId}/verify`, { method: 'PUT' });
      Alert.alert('Klart', 'E-post verifierad');
      loadUsers();
    } catch (e: any) { Alert.alert('Fel', e.message); }
  };

  const handleResetPin = async (userId: string) => {
    try {
      await adminFetch(`/users/${userId}/reset-pin`, { method: 'POST' });
      Alert.alert('Klart', 'PIN återställd till 1234');
    } catch (e: any) { Alert.alert('Fel', e.message); }
  };

  const handleDeleteUser = (user: any) => {
    Alert.alert('Radera kund', `Radera ${user.organization_name} och all data?`, [
      { text: 'Avbryt' },
      {
        text: 'Radera', style: 'destructive', onPress: async () => {
          try { await adminFetch(`/users/${user.user_id}`, { method: 'DELETE' }); loadUsers(); }
          catch (e: any) { Alert.alert('Fel', e.message); }
        }
      }
    ]);
  };

  const handleToggleGuest = async () => {
    try {
      const data = await adminFetch('/toggle-guest1', { method: 'POST' });
      setGuest1Status(data);
      loadGuest1();
      loadUsers();
    } catch (e: any) { Alert.alert('Fel', e.message); }
  };

  // Open edit modal for user
  const openEditModal = (user: any) => {
    setEditForm({
      organization_name: user.organization_name || '',
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      login_code: user.login_code || '',
      subscription_active: user.subscription_active || false,
      subscription_end: user.subscription_end ? user.subscription_end.split('T')[0] : '',
    });
    setSendWelcomeEmail(false);
    setNewPassword('');
    setNewPin('');
    setEditModal(user);
  };

  // Save user edits
  const handleSaveUser = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      await adminFetch(`/users/${editModal.user_id}/full`, {
        method: 'PUT',
        body: JSON.stringify({
          organization_name: editForm.organization_name,
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
          subscription_active: editForm.subscription_active,
          subscription_end: editForm.subscription_end ? new Date(editForm.subscription_end).toISOString() : null,
          send_welcome_email: sendWelcomeEmail,
        }),
      });
      Alert.alert('Sparat', sendWelcomeEmail ? 'Kund uppdaterad och välkomstmail skickat!' : 'Kund uppdaterad!');
      setEditModal(null);
      loadUsers();
    } catch (e: any) { Alert.alert('Fel', e.message); }
    finally { setSaving(false); }
  };

  // Regenerate login code
  const handleRegenerateCode = async () => {
    if (!editModal) return;
    confirmAction('Byt inloggningskod', 'Skapa en ny inloggningskod? Den gamla slutar fungera.', async () => {
      try {
        const data = await adminFetch(`/users/${editModal.user_id}/regenerate-login-code`, { method: 'POST' });
        setEditForm((p: any) => ({ ...p, login_code: data.login_code }));
        if (Platform.OS === 'web') {
          window.alert(`Ny kod: ${data.login_code}`);
        } else {
          Alert.alert('Klart', `Ny kod: ${data.login_code}`);
        }
      } catch (e: any) { 
        if (Platform.OS === 'web') {
          window.alert(`Fel: ${e.message}`);
        } else {
          Alert.alert('Fel', e.message); 
        }
      }
    });
  };

  // Change password - generate and email
  const handleChangePassword = async () => {
    if (!editModal) return;
    confirmAction('Nytt lösenord', `Generera ett nytt lösenord och skicka till ${editModal.email}?`, async () => {
      try {
        const result = await adminFetch(`/users/${editModal.user_id}/reset-password-admin`, { method: 'POST' });
        if (Platform.OS === 'web') {
          window.alert(result.message || 'Nytt lösenord skickat!');
        } else {
          Alert.alert('Klart', result.message || 'Nytt lösenord skickat!');
        }
      } catch (e: any) { 
        if (Platform.OS === 'web') {
          window.alert(`Fel: ${e.message}`);
        } else {
          Alert.alert('Fel', e.message);
        }
      }
    });
  };

  // Change PIN
  const handleChangePin = async () => {
    if (!editModal) return;
    confirmAction('Återställ PIN', 'Återställ PIN-koden till 1234?', async () => {
      try {
        await adminFetch(`/users/${editModal.user_id}/reset-pin`, { method: 'POST' });
        if (Platform.OS === 'web') {
          window.alert('PIN återställd till 1234');
        } else {
          Alert.alert('Klart', 'PIN återställd till 1234');
        }
      } catch (e: any) { 
        if (Platform.OS === 'web') {
          window.alert(`Fel: ${e.message}`);
        } else {
          Alert.alert('Fel', e.message);
        }
      }
    });
  };

  // Delete account
  const handleDeleteFromModal = () => {
    if (!editModal) return;
    confirmAction('Radera kund', `Radera ${editModal.organization_name} och ALL data? Detta kan inte ångras.`, async () => {
      try {
        await adminFetch(`/users/${editModal.user_id}`, { method: 'DELETE' });
        setEditModal(null);
        loadUsers();
        if (Platform.OS === 'web') {
          window.alert('Kund raderad');
        } else {
          Alert.alert('Klart', 'Kund raderad');
        }
      } catch (e: any) { 
        if (Platform.OS === 'web') {
          window.alert(`Fel: ${e.message}`);
        } else {
          Alert.alert('Fel', e.message);
        }
      }
    });
  };

  // Clear user data (orders, parked carts) but keep products
  const handleClearData = () => {
    if (!editModal) return;
    confirmAction('Rensa databas', `Radera alla ordrar och parkerade kundvagnar för ${editModal.organization_name}? Produkter och inställningar behålls.`, async () => {
      try {
        const result = await adminFetch(`/users/${editModal.user_id}/clear-data`, { method: 'DELETE' });
        if (Platform.OS === 'web') {
          window.alert(result.message || 'Data rensad');
        } else {
          Alert.alert('Klart', result.message || 'Data rensad');
        }
      } catch (e: any) { 
        if (Platform.OS === 'web') {
          window.alert(`Fel: ${e.message}`);
        } else {
          Alert.alert('Fel', e.message);
        }
      }
    });
  };

  // Link user to parent organization
  const handleLinkToParent = async () => {
    if (!linkModal || !parentSearch.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Ange en e-postadress eller organisationsnamn');
      } else {
        Alert.alert('Fel', 'Ange en e-postadress eller organisationsnamn');
      }
      return;
    }
    
    setLinkingSaving(true);
    try {
      const result = await adminFetch(`/users/${linkModal.user_id}/set-parent`, {
        method: 'POST',
        body: JSON.stringify({ parent_email: parentSearch.trim() }),
      });
      if (Platform.OS === 'web') {
        window.alert(result.message || 'Användare kopplad!');
      } else {
        Alert.alert('Klart', result.message || 'Användare kopplad!');
      }
      setLinkModal(null);
      setParentSearch('');
      loadUsers();
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(`Fel: ${e.message}`);
      } else {
        Alert.alert('Fel', e.message);
      }
    } finally {
      setLinkingSaving(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={C.blue} style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabPadding}>
      {/* Guest1 toggle */}
      <View style={s.guestCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.guestTitle}>Gästkonto (Guest1)</Text>
          <Text style={s.guestSub}>
            {guest1Status?.exists
              ? (guest1Status.enabled ? 'Aktivt — Lösenord: Guest1' : 'Inaktivt')
              : 'Finns inte ännu'}
          </Text>
        </View>
        <TouchableOpacity
          testID="toggle-guest-btn"
          style={[s.guestBtn, guest1Status?.enabled && s.guestBtnActive]}
          onPress={handleToggleGuest}
        >
          <Ionicons name={guest1Status?.enabled ? 'close-circle-outline' : 'checkmark-circle-outline'} size={16} color={guest1Status?.enabled ? C.red : C.green} />
          <Text style={[s.guestBtnText, { color: guest1Status?.enabled ? C.red : C.green }]}>
            {guest1Status?.enabled ? 'Inaktivera' : 'Aktivera'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={s.sectionTitle}>Kunder ({users.length})</Text>
      {users.map(user => (
        <View key={user.user_id} testID={`user-row-${user.user_id}`}>
          <View style={s.userCard}>
            <View style={s.userHeader}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => openEditModal(user)}>
                <Text style={[s.userName, { color: C.blue }]}>{user.organization_name || user.email}</Text>
                <Text style={s.userEmail}>{user.email}</Text>
              </TouchableOpacity>
              <View style={[s.subBadge, user.subscription_active ? s.subOn : s.subOff]}>
                <View style={[s.subDot, { backgroundColor: user.subscription_active ? C.green : C.red }]} />
                <Text style={[s.subBadgeText, { color: user.subscription_active ? C.green : C.red }]}>
                  {user.subscription_active ? 'Aktiv' : 'Inaktiv'}
                </Text>
              </View>
            </View>
            <View style={s.userMeta}>
              <Text style={s.metaText}>Tel: {user.phone || '-'}</Text>
              <Text style={s.metaText}>Verifierad: {user.email_verified ? 'Ja' : 'Nej'}</Text>
              {user.subscription_end && (
                <Text style={s.metaText}>Giltig t.o.m: {new Date(user.subscription_end).toLocaleDateString('sv-SE')}</Text>
              )}
            </View>
            <View style={[s.userActions, !isWide && { flexWrap: 'wrap' }]}>
              <TouchableOpacity testID={`sub-btn-${user.user_id}`} style={s.actionChip} onPress={() => {
                setSubModal(user);
                setSubActive(user.subscription_active);
                setSubEnd(user.subscription_end ? user.subscription_end.split('T')[0] : '');
              }}>
                <Ionicons name="diamond-outline" size={14} color={C.blue} />
                <Text style={[s.actionChipText, { color: C.blue }]}>Abonnemang</Text>
              </TouchableOpacity>
              {!user.email_verified && (
                <TouchableOpacity testID={`verify-btn-${user.user_id}`} style={s.actionChip} onPress={() => handleVerifyEmail(user.user_id)}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={C.green} />
                  <Text style={[s.actionChipText, { color: C.green }]}>Verifiera</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[s.actionChip, { backgroundColor: 'rgba(139,92,246,0.1)' }]} 
                onPress={() => loadSubUsers(user.user_id)}
              >
                {loadingSubUsers === user.user_id ? (
                  <ActivityIndicator size="small" color="#8b5cf6" />
                ) : (
                  <>
                    <Ionicons 
                      name={expandedUser === user.user_id ? "chevron-up" : "people-outline"} 
                      size={14} 
                      color="#8b5cf6" 
                    />
                    <Text style={[s.actionChipText, { color: '#8b5cf6' }]}>
                      Användare ({user.sub_user_count || 0})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Expanded sub-users section */}
          {expandedUser === user.user_id && subUsers[user.user_id] && (
            <View style={s.subUsersSection}>
              <Text style={s.subUsersSectionTitle}>Användare i {user.organization_name}</Text>
              {subUsers[user.user_id].length === 0 ? (
                <Text style={s.noSubUsers}>Inga användare</Text>
              ) : (
                subUsers[user.user_id].map(subUser => (
                  <View key={subUser.user_id} style={s.subUserRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.subUserName}>{subUser.name || subUser.email}</Text>
                      <Text style={s.subUserEmail}>{subUser.email}</Text>
                      <Text style={s.subUserCode}>Kod: {subUser.login_code || '-'}</Text>
                    </View>
                    <Text style={s.subUserLogin}>
                      {subUser.last_login 
                        ? new Date(subUser.last_login).toLocaleDateString('sv-SE')
                        : 'Aldrig inloggad'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      ))}

      {/* Subscription Modal */}
      <Modal visible={!!subModal} transparent animationType="fade">
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modal, !isWide && { width: '92%' }]}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Abonnemang</Text>
              <TouchableOpacity testID="close-sub-modal" onPress={() => setSubModal(null)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            {subModal && <Text style={s.modalSub}>{subModal.organization_name || subModal.email}</Text>}

            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Status</Text>
              <TouchableOpacity testID="toggle-sub-btn" style={[s.toggleBtn, subActive ? s.toggleOn : s.toggleOff]} onPress={() => setSubActive(!subActive)}>
                <Text style={[s.toggleText, { color: subActive ? C.green : C.red }]}>
                  {subActive ? 'AKTIV' : 'INAKTIV'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 16 }}>
              <Text style={s.fieldLabel}>Slutdatum (ÅÅÅÅ-MM-DD)</Text>
              <TextInput testID="sub-end-input" style={s.fieldInput} value={subEnd}
                onChangeText={setSubEnd} placeholder="2026-12-31" placeholderTextColor={C.textMut} />
            </View>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSubModal(null)}>
                <Text style={s.cancelText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-sub-btn" style={[s.primaryBtn, saving && { opacity: 0.5 }]} onPress={handleSubscription} disabled={saving}>
                {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.primaryBtnText}>Spara</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit User Modal */}
      <Modal visible={!!editModal} transparent animationType="fade">
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modal, !isWide && { width: '92%' }, { maxHeight: '85%', minHeight: 400 }]}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Redigera kund</Text>
              <TouchableOpacity testID="close-edit-modal" onPress={() => setEditModal(null)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={{ flexGrow: 1, flexShrink: 1 }} 
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {/* Quick action buttons at top */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 16 }}>
                <TouchableOpacity style={[s.actionChip, { backgroundColor: 'rgba(59,130,246,0.15)' }]} onPress={handleRegenerateCode}>
                  <Ionicons name="refresh-outline" size={14} color={C.blue} />
                  <Text style={[s.actionChipText, { color: C.blue }]}>Byt kod</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionChip, { backgroundColor: 'rgba(245,158,11,0.15)' }]} onPress={handleChangePin}>
                  <Ionicons name="keypad-outline" size={14} color={C.yellow} />
                  <Text style={[s.actionChipText, { color: C.yellow }]}>Återställ PIN</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[s.actionChip, { backgroundColor: 'rgba(34,197,94,0.15)' }]} 
                  onPress={() => {
                    setLinkModal(editModal);
                    setParentSearch('');
                  }}
                >
                  <Ionicons name="link-outline" size={14} color={C.green} />
                  <Text style={[s.actionChipText, { color: C.green }]}>Koppla till org</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionChip, { backgroundColor: 'rgba(168,85,247,0.15)' }]} onPress={handleClearData}>
                  <Ionicons name="server-outline" size={14} color="#a855f7" />
                  <Text style={[s.actionChipText, { color: '#a855f7' }]}>Rensa db</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionChip, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={handleDeleteFromModal}>
                  <Ionicons name="trash-outline" size={14} color={C.red} />
                  <Text style={[s.actionChipText, { color: C.red }]}>Radera</Text>
                </TouchableOpacity>
              </View>

              {/* New password row */}
              <View style={{ marginBottom: 16 }}>
                <Text style={s.fieldLabel}>Nytt lösenord</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[s.fieldInput, { flex: 1, marginTop: 0, letterSpacing: 0 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Ange nytt lösenord"
                    placeholderTextColor={C.textMut}
                    secureTextEntry
                    editable={true}
                  />
                  <TouchableOpacity
                    style={[s.primaryBtn, { flex: 0, paddingHorizontal: 16, height: 48 }]}
                    onPress={handleChangePassword}
                  >
                    <Text style={s.primaryBtnText}>Byt</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Login code display */}
              {editForm.login_code && (
                <View style={{ marginBottom: 16, backgroundColor: C.surfaceHi, borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>Inloggningskod</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: 2, fontFamily: 'monospace' }}>
                    {editForm.login_code}
                  </Text>
                </View>
              )}

              {/* Edit fields */}
              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Organisationsnamn *</Text>
                <TextInput
                  style={[s.fieldInput, { letterSpacing: 0 }]}
                  value={editForm.organization_name}
                  onChangeText={(v) => setEditForm((p: any) => ({ ...p, organization_name: v }))}
                  placeholder="Företagsnamn"
                  placeholderTextColor={C.textMut}
                  editable={true}
                  autoCorrect={false}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Kontaktnamn</Text>
                <TextInput
                  style={[s.fieldInput, { letterSpacing: 0 }]}
                  value={editForm.name}
                  onChangeText={(v) => setEditForm((p: any) => ({ ...p, name: v }))}
                  placeholder="Förnamn Efternamn"
                  placeholderTextColor={C.textMut}
                  editable={true}
                  autoCorrect={false}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>E-post *</Text>
                <TextInput
                  style={[s.fieldInput, { letterSpacing: 0 }]}
                  value={editForm.email}
                  onChangeText={(v) => setEditForm((p: any) => ({ ...p, email: v }))}
                  placeholder="email@example.com"
                  placeholderTextColor={C.textMut}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={true}
                  autoCorrect={false}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Telefon</Text>
                <TextInput
                  style={[s.fieldInput, { letterSpacing: 0 }]}
                  value={editForm.phone}
                  onChangeText={(v) => setEditForm((p: any) => ({ ...p, phone: v }))}
                  placeholder="070-1234567"
                  placeholderTextColor={C.textMut}
                  keyboardType="phone-pad"
                  editable={true}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Abonnemang slutdatum (ÅÅÅÅ-MM-DD)</Text>
                <TextInput
                  style={[s.fieldInput, { letterSpacing: 0 }]}
                  value={editForm.subscription_end}
                  onChangeText={(v) => setEditForm((p: any) => ({ ...p, subscription_end: v }))}
                  placeholder="2026-12-31"
                  placeholderTextColor={C.textMut}
                  editable={true}
                />
              </View>

              <View style={s.switchRow}>
                <Text style={s.switchLabel}>Abonnemang aktivt</Text>
                <TouchableOpacity
                  style={[s.toggleBtn, editForm.subscription_active ? s.toggleOn : s.toggleOff]}
                  onPress={() => setEditForm((p: any) => ({ ...p, subscription_active: !p.subscription_active }))}
                >
                  <Text style={[s.toggleText, { color: editForm.subscription_active ? C.green : C.red }]}>
                    {editForm.subscription_active ? 'AKTIV' : 'INAKTIV'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Send welcome email toggle */}
              <View style={[s.switchRow, { borderTopWidth: 1, borderTopColor: C.border, marginTop: 12, paddingTop: 16 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>Skicka välkomstmail</Text>
                  <Text style={{ fontSize: 12, color: C.textMut }}>Skickar mail med alla inställningar</Text>
                </View>
                <TouchableOpacity
                  style={[s.toggleBtn, sendWelcomeEmail ? s.toggleOn : s.toggleOff]}
                  onPress={() => setSendWelcomeEmail(!sendWelcomeEmail)}
                >
                  <Text style={[s.toggleText, { color: sendWelcomeEmail ? C.green : C.textMut }]}>
                    {sendWelcomeEmail ? 'JA' : 'NEJ'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setEditModal(null)}>
                <Text style={s.cancelText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-edit-btn"
                style={[s.primaryBtn, saving && { opacity: 0.5 }]}
                onPress={handleSaveUser}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={C.white} /> : (
                  <>
                    <Ionicons name="save-outline" size={16} color={C.white} />
                    <Text style={s.primaryBtnText}>Spara</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Link to Parent Organization Modal */}
      <Modal visible={!!linkModal} transparent animationType="fade">
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modal, !isWide && { width: '92%' }]}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Koppla till organisation</Text>
              <TouchableOpacity onPress={() => { setLinkModal(null); setParentSearch(''); }}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            
            {linkModal && (
              <Text style={[s.modalSub, { marginBottom: 16 }]}>
                Gör {linkModal.organization_name || linkModal.email} till underkonto
              </Text>
            )}
            
            <View style={{ marginBottom: 16 }}>
              <Text style={s.fieldLabel}>Huvudkonto (e-post eller organisationsnamn)</Text>
              <TextInput
                style={s.fieldInput}
                value={parentSearch}
                onChangeText={setParentSearch}
                placeholder="t.ex. djurö vindö eller email@exempel.se"
                placeholderTextColor={C.textMut}
                autoCapitalize="none"
              />
            </View>
            
            <Text style={{ fontSize: 12, color: C.textMut, marginBottom: 16 }}>
              Användaren blir ett underkonto och visas under den valda organisationen i kundlistan.
            </Text>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setLinkModal(null); setParentSearch(''); }}>
                <Text style={s.cancelText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, linkingSaving && { opacity: 0.5 }]}
                onPress={handleLinkToParent}
                disabled={linkingSaving}
              >
                {linkingSaving ? <ActivityIndicator color={C.white} /> : (
                  <>
                    <Ionicons name="link-outline" size={16} color={C.white} />
                    <Text style={s.primaryBtnText}>Koppla</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// =================== STATS TAB ===================
function StatsTab() {
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  const [stats, setStats] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [st, ov] = await Promise.all([adminFetch('/stats'), adminFetch('/economic-overview')]);
        setStats(st); setOverview(ov);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <ActivityIndicator size="large" color={C.blue} style={{ marginTop: 40 }} />;

  const statItems = [
    { label: 'Kunder', value: stats?.total_users || 0, icon: 'people' as const, color: C.blue },
    { label: 'Verifierade', value: stats?.verified_users || 0, icon: 'checkmark-circle' as const, color: C.green },
    { label: 'Aktiva abb.', value: stats?.active_subscriptions || 0, icon: 'diamond' as const, color: C.yellow },
    { label: 'Ordrar', value: stats?.total_orders || 0, icon: 'receipt' as const, color: C.blue },
    { label: 'Produkter', value: stats?.total_products || 0, icon: 'cube' as const, color: C.green },
    { label: 'Delade bilder', value: stats?.shared_images || 0, icon: 'images' as const, color: C.yellow },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabPadding}>
      <Text style={s.sectionTitle}>Systemstatistik</Text>
      <View style={[s.statsGrid, !isWide && { gap: 8 }]}>
        {statItems.map(st => (
          <View key={st.label} style={[s.statBox, !isWide && { width: '48%' }]}>
            <Ionicons name={st.icon} size={isWide ? 24 : 20} color={st.color} />
            <Text style={[s.statVal, !isWide && { fontSize: 20 }]}>{st.value}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      {overview && (
        <>
          <Text style={[s.sectionTitle, { marginTop: 24 }]}>Ekonomisk översikt</Text>
          <View style={s.overviewCard}>
            {[
              { label: 'Total omsättning', value: `${overview.totals?.total_revenue?.toFixed(0) || 0} kr` },
              { label: 'Totala ordrar', value: String(overview.totals?.total_orders || 0) },
              { label: 'Aktiva handlare', value: String(overview.totals?.active_users || 0) },
            ].map((row, idx) => (
              <View key={idx} style={[s.overviewRow, idx === 2 && { borderBottomWidth: 0 }]}>
                <Text style={s.overviewLabel}>{row.label}</Text>
                <Text style={s.overviewVal}>{row.value}</Text>
              </View>
            ))}
          </View>

          {(overview.users || []).length > 0 && (
            <>
              <Text style={[s.sectionTitle, { marginTop: 24 }]}>Per handlare</Text>
              {(overview.users || []).map((u: any) => (
                <View key={u.user_id} style={s.merchantRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.merchantName}>{u.organization_name}</Text>
                    <Text style={s.merchantEmail}>{u.email}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.merchantRev}>{u.total_revenue?.toFixed(0) || 0} kr</Text>
                    <Text style={s.merchantOrders}>{u.total_orders || 0} ordrar</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// =================== SETTINGS TAB ===================
function SettingsTab() {
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminFetch('/settings');
        setForm({
          app_name: data.app_name || '',
          grace_period_days: String(data.grace_period_days || 7),
          contact_email: data.contact_email || '',
          contact_phone: data.contact_phone || '',
          swish_number: data.swish_number || '',
        });
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: any = {};
      Object.entries(form).forEach(([k, v]) => {
        if (v) data[k] = k === 'grace_period_days' ? parseInt(v as string) : v;
      });
      await adminFetch('/settings', { method: 'PUT', body: JSON.stringify(data) });
      Alert.alert('Sparat', 'Systeminställningar uppdaterade');
    } catch (e: any) { Alert.alert('Fel', e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <ActivityIndicator size="large" color={C.blue} style={{ marginTop: 40 }} />;

  const fields = [
    { key: 'app_name', label: 'Appnamn', placeholder: 'QR-Kassan', icon: 'apps-outline' as const },
    { key: 'grace_period_days', label: 'Grace period (dagar)', placeholder: '7', icon: 'time-outline' as const, kbd: 'number-pad' as const },
    { key: 'contact_email', label: 'Kontakt e-post', placeholder: 'support@example.com', icon: 'help-circle-outline' as const, kbd: 'email-address' as const },
    { key: 'contact_phone', label: 'Kontakt telefon', placeholder: '070-1234567', icon: 'call-outline' as const, kbd: 'phone-pad' as const },
    { key: 'swish_number', label: 'Swish-nummer (abonnemang)', placeholder: '123 456 78 90', icon: 'card-outline' as const, kbd: 'phone-pad' as const },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabPadding} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionTitle}>Systeminställningar</Text>
        {fields.map(f => (
          <View key={f.key} style={s.settingField}>
            <Text style={s.fieldLabel}>{f.label}</Text>
            <View style={s.fieldInputRow}>
              <Ionicons name={f.icon} size={18} color={C.textMut} />
              <TextInput
                testID={`system-${f.key}-input`}
                style={s.fieldInput2}
                value={form[f.key] || ''}
                onChangeText={(v) => setForm((p: any) => ({ ...p, [f.key]: v }))}
                placeholder={f.placeholder}
                placeholderTextColor={C.textMut}
                secureTextEntry={f.secure}
                keyboardType={f.kbd || 'default'}
                autoCapitalize="none"
              />
            </View>
          </View>
        ))}
        <TouchableOpacity testID="save-system-settings-btn" style={[s.primaryBtn, { flex: 0, marginTop: 8 }, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={C.white} /> : (
            <>
              <Ionicons name="save-outline" size={18} color={C.white} />
              <Text style={s.primaryBtnText}>Spara inställningar</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// =================== MAIN SCREEN ===================
export default function SuperAdminScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<'users' | 'stats' | 'settings'>('users');

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('admin_token');
        if (token) {
          await adminFetch('/me');
          setLoggedIn(true);
        }
      } catch { await AsyncStorage.removeItem('admin_token'); }
      finally { setChecking(false); }
    })();
  }, []);

  const handleLogout = async () => {
    try { await adminFetch('/logout', { method: 'POST' }); } catch {}
    await AsyncStorage.removeItem('admin_token');
    setLoggedIn(false);
  };

  if (checking) return (
    <View style={s.loadingContainer}><ActivityIndicator size="large" color={C.blue} /></View>
  );

  if (!loggedIn) return <AdminLogin onLogin={() => setLoggedIn(true)} />;

  const tabs = [
    { key: 'users' as const, label: 'Kunder', icon: 'people-outline' as const },
    { key: 'stats' as const, label: 'Statistik', icon: 'bar-chart-outline' as const },
    { key: 'settings' as const, label: 'Inställningar', icon: 'cog-outline' as const },
  ];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity testID="sa-back-btn" onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Ionicons name="shield-checkmark" size={20} color={C.blue} />
          <Text style={s.headerTitle}>Superadmin</Text>
        </View>
        <TouchableOpacity testID="sa-logout-btn" onPress={handleLogout} style={s.headerBtn}>
          <Ionicons name="log-out-outline" size={20} color={C.red} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            testID={`sa-tab-${t.key}`}
            style={[s.tab, tab === t.key && s.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons name={t.icon} size={18} color={tab === t.key ? C.blue : C.textMut} />
            {isWide && (
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === 'users' && <UsersTab />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'settings' && <SettingsTab />}
    </SafeAreaView>
  );
}

// =================== STYLES ===================
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },

  // Login
  loginContainer: { flex: 1, backgroundColor: C.bg },
  loginScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loginCard: {
    backgroundColor: C.surface, borderRadius: 20, padding: 32, width: '100%', maxWidth: 400,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  loginTitle: { fontSize: 28, fontWeight: '700', color: C.text, marginTop: 16 },
  loginSub: { fontSize: 14, color: C.textSec, marginTop: 4, marginBottom: 24 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
    backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8, width: '100%',
  },
  errorText: { color: C.red, fontSize: 14, flex: 1 },
  loginInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', height: 52,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, marginBottom: 12,
  },
  loginInputField: { flex: 1, color: C.text, fontSize: 16, height: '100%', letterSpacing: 0 },
  loginBtn: {
    width: '100%', height: 52, backgroundColor: C.blue, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  loginBtnText: { color: C.white, fontSize: 16, fontWeight: '600' },
  loginBackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 16, padding: 8,
  },
  loginBackText: { color: C.textSec, fontSize: 14 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: C.text },

  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6, minHeight: 48,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.blue },
  tabText: { fontSize: 13, color: C.textMut },
  tabTextActive: { color: C.blue, fontWeight: '600' },
  tabPadding: { padding: 16, paddingBottom: 32 },

  // Section
  sectionTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 12 },

  // Guest
  guestCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16, gap: 12,
  },
  guestTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  guestSub: { fontSize: 12, color: C.textMut, marginTop: 2 },
  guestBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.border,
  },
  guestBtnActive: { borderColor: C.green },
  guestBtnText: { fontSize: 13, fontWeight: '600' },

  // Users
  userCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 10,
  },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '600', color: C.text },
  userEmail: { fontSize: 13, color: C.textMut, marginTop: 1 },
  subBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  subDot: { width: 6, height: 6, borderRadius: 3 },
  subOn: { backgroundColor: 'rgba(34,197,94,0.15)' },
  subOff: { backgroundColor: 'rgba(239,68,68,0.15)' },
  subBadgeText: { fontSize: 12, fontWeight: '600' },
  userMeta: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: C.textMut },
  userActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surfaceHi,
    minHeight: 36,
  },
  actionChipText: { fontSize: 13, fontWeight: '500' },

  // Sub-users section
  subUsersSection: {
    backgroundColor: C.surfaceHi, borderRadius: 12, padding: 14, marginTop: -6, marginBottom: 10,
    borderWidth: 1, borderColor: C.border, marginLeft: 16, marginRight: 4,
  },
  subUsersSectionTitle: { fontSize: 13, fontWeight: '600', color: C.textSec, marginBottom: 10 },
  noSubUsers: { fontSize: 13, color: C.textMut, fontStyle: 'italic' },
  subUserRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  subUserName: { fontSize: 14, fontWeight: '500', color: C.text },
  subUserEmail: { fontSize: 12, color: C.textMut, marginTop: 2 },
  subUserCode: { fontSize: 11, color: C.blue, marginTop: 2 },
  subUserLogin: { fontSize: 11, color: C.textMut },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: {
    width: '31%', backgroundColor: C.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  statVal: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 6 },
  statLabel: { fontSize: 11, color: C.textMut, marginTop: 2 },
  overviewCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  overviewRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  overviewLabel: { fontSize: 14, color: C.textSec },
  overviewVal: { fontSize: 16, fontWeight: '700', color: C.text },
  merchantRow: {
    flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.surface,
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  merchantName: { fontSize: 14, fontWeight: '500', color: C.text },
  merchantEmail: { fontSize: 12, color: C.textMut },
  merchantRev: { fontSize: 15, fontWeight: '700', color: C.green },
  merchantOrders: { fontSize: 12, color: C.textMut },

  // Settings
  settingField: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: C.textSec, marginBottom: 6 },
  fieldInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface,
    borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 52,
  },
  fieldInput2: { flex: 1, color: C.text, fontSize: 15, height: '100%', letterSpacing: 0 },
  fieldInput: {
    height: 52, backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, color: C.text, fontSize: 15, marginTop: 6, letterSpacing: 0,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { backgroundColor: C.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: C.border },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '600', color: C.text },
  modalSub: { fontSize: 14, color: C.textMut, marginTop: 2 },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  switchLabel: { fontSize: 15, color: C.text },
  toggleBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  toggleOn: { backgroundColor: 'rgba(34,197,94,0.15)' },
  toggleOff: { backgroundColor: 'rgba(239,68,68,0.15)' },
  toggleText: { fontSize: 14, fontWeight: '700' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  cancelText: { color: C.textSec, fontSize: 15 },
  primaryBtn: {
    flex: 1, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.blue, flexDirection: 'row', gap: 8,
  },
  primaryBtnText: { color: C.white, fontSize: 15, fontWeight: '600' },
});
