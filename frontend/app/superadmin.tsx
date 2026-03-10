import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, FlatList, Modal, KeyboardAvoidingView, Platform,
  SafeAreaView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;
const C = {
  bg: '#09090b', surface: '#18181b', surfaceHi: '#27272a', border: '#3f3f46',
  text: '#f4f4f5', textSec: '#a1a1aa', textMut: '#71717a',
  green: '#22c55e', red: '#ef4444', blue: '#3b82f6', yellow: '#f59e0b', white: '#fff',
};

async function adminFetch(path: string, opts: RequestInit = {}) {
  const token = await AsyncStorage.getItem('admin_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any || {}) };
  if (token) headers['Cookie'] = `admin_session_token=${token}`;
  const res = await fetch(`${BACKEND}/api/superadmin${path}`, { ...opts, headers, credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Fel' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// =================== LOGIN ===================
function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError('Fyll i alla fält'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BACKEND}/api/superadmin/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }), credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Inloggningen misslyckades');
      await AsyncStorage.setItem('admin_token', data.session_token);
      onLogin();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <View style={s.loginContainer}>
      <View style={s.loginCard}>
        <Ionicons name="shield-checkmark" size={48} color={C.blue} />
        <Text style={s.loginTitle}>Superadmin</Text>
        <Text style={s.loginSub}>QR-Kassan Administrering</Text>
        {error ? <Text style={s.errorText}>{error}</Text> : null}
        <TextInput testID="admin-email" style={s.loginInput} value={email} onChangeText={setEmail}
          placeholder="E-post" placeholderTextColor={C.textMut} autoCapitalize="none" keyboardType="email-address" />
        <TextInput testID="admin-password" style={s.loginInput} value={password} onChangeText={setPassword}
          placeholder="Lösenord" placeholderTextColor={C.textMut} secureTextEntry />
        <TouchableOpacity testID="admin-login-btn" style={[s.loginBtn, loading && { opacity: 0.5 }]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={C.white} /> : <Text style={s.loginBtnText}>Logga in</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// =================== USERS TAB ===================
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [subModal, setSubModal] = useState<any>(null);
  const [subActive, setSubActive] = useState(true);
  const [subEnd, setSubEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [guest1Status, setGuest1Status] = useState<any>(null);

  const loadUsers = useCallback(async () => {
    try {
      const data = await adminFetch('/users');
      setUsers(data.users || []);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadGuest1 = useCallback(async () => {
    try { const data = await adminFetch('/guest1-status'); setGuest1Status(data); } catch {}
  }, []);

  useEffect(() => { loadUsers(); loadGuest1(); }, []);

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
    Alert.alert('Radera användare', `Radera ${user.organization_name} och all data?`, [
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
      Alert.alert('Klart', data.enabled ? 'Guest1 aktiverat' : 'Guest1 inaktiverat');
    } catch (e: any) { Alert.alert('Fel', e.message); }
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
              ? (guest1Status.enabled ? 'Aktivt' : 'Inaktivt')
              : 'Finns inte ännu'}
          </Text>
        </View>
        <TouchableOpacity testID="toggle-guest-btn" style={[s.guestBtn, guest1Status?.enabled && s.guestBtnActive]} onPress={handleToggleGuest}>
          <Text style={s.guestBtnText}>{guest1Status?.enabled ? 'Inaktivera' : 'Aktivera'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.sectionTitle}>Användare ({users.length})</Text>
      {users.map(user => (
        <View key={user.user_id} testID={`user-row-${user.user_id}`} style={s.userCard}>
          <View style={s.userHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.userName}>{user.organization_name || user.email}</Text>
              <Text style={s.userEmail}>{user.email}</Text>
            </View>
            <View style={[s.subBadge, user.subscription_active ? s.subOn : s.subOff]}>
              <Text style={[s.subBadgeText, { color: user.subscription_active ? C.green : C.red }]}>
                {user.subscription_active ? 'Aktiv' : 'Inaktiv'}
              </Text>
            </View>
          </View>
          <View style={s.userMeta}>
            <Text style={s.metaText}>Tel: {user.phone || '-'}</Text>
            <Text style={s.metaText}>Verifierad: {user.email_verified ? 'Ja' : 'Nej'}</Text>
          </View>
          <View style={s.userActions}>
            <TouchableOpacity style={s.actionChip} onPress={() => {
              setSubModal(user);
              setSubActive(user.subscription_active);
              setSubEnd(user.subscription_end || '');
            }}>
              <Ionicons name="diamond-outline" size={14} color={C.blue} />
              <Text style={[s.actionChipText, { color: C.blue }]}>Abonnemang</Text>
            </TouchableOpacity>
            {!user.email_verified && (
              <TouchableOpacity style={s.actionChip} onPress={() => handleVerifyEmail(user.user_id)}>
                <Ionicons name="checkmark-circle-outline" size={14} color={C.green} />
                <Text style={[s.actionChipText, { color: C.green }]}>Verifiera</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.actionChip} onPress={() => handleResetPin(user.user_id)}>
              <Ionicons name="key-outline" size={14} color={C.yellow} />
              <Text style={[s.actionChipText, { color: C.yellow }]}>Återställ PIN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionChip} onPress={() => handleDeleteUser(user)}>
              <Ionicons name="trash-outline" size={14} color={C.red} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Subscription Modal */}
      <Modal visible={!!subModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Uppdatera abonnemang</Text>
            {subModal && <Text style={s.modalSub}>{subModal.organization_name || subModal.email}</Text>}
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Abonnemang aktivt</Text>
              <TouchableOpacity testID="toggle-sub-btn" style={[s.toggleBtn, subActive && s.toggleOn]} onPress={() => setSubActive(!subActive)}>
                <Text style={s.toggleText}>{subActive ? 'JA' : 'NEJ'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 12 }}>
              <Text style={s.fieldLabel}>Slutdatum (ÅÅÅÅ-MM-DD)</Text>
              <TextInput testID="sub-end-input" style={s.fieldInput} value={subEnd}
                onChangeText={setSubEnd} placeholder="2026-12-31" placeholderTextColor={C.textMut} />
            </View>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSubModal(null)}>
                <Text style={s.cancelText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="save-sub-btn" style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSubscription} disabled={saving}>
                {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveBtnText}>Spara</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// =================== STATS TAB ===================
function StatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [st, ov] = await Promise.all([adminFetch('/stats'), adminFetch('/economic-overview')]);
        setStats(st);
        setOverview(ov);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <ActivityIndicator size="large" color={C.blue} style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabPadding}>
      <Text style={s.sectionTitle}>Systemstatistik</Text>
      <View style={s.statsGrid}>
        {[
          { label: 'Användare', value: stats?.total_users || 0, icon: 'people' as const, color: C.blue },
          { label: 'Verifierade', value: stats?.verified_users || 0, icon: 'checkmark-circle' as const, color: C.green },
          { label: 'Aktiva abb.', value: stats?.active_subscriptions || 0, icon: 'diamond' as const, color: C.yellow },
          { label: 'Ordrar', value: stats?.total_orders || 0, icon: 'receipt' as const, color: C.blue },
          { label: 'Produkter', value: stats?.total_products || 0, icon: 'cube' as const, color: C.green },
          { label: 'Delade bilder', value: stats?.shared_images || 0, icon: 'images' as const, color: C.yellow },
        ].map(st => (
          <View key={st.label} style={s.statBox}>
            <Ionicons name={st.icon} size={24} color={st.color} />
            <Text style={s.statVal}>{st.value}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      {overview && (
        <>
          <Text style={[s.sectionTitle, { marginTop: 24 }]}>Ekonomisk översikt</Text>
          <View style={s.overviewCard}>
            <View style={s.overviewRow}>
              <Text style={s.overviewLabel}>Total omsättning</Text>
              <Text style={s.overviewVal}>{overview.totals?.total_revenue?.toFixed(0) || 0} kr</Text>
            </View>
            <View style={s.overviewRow}>
              <Text style={s.overviewLabel}>Totala ordrar</Text>
              <Text style={s.overviewVal}>{overview.totals?.total_orders || 0}</Text>
            </View>
            <View style={s.overviewRow}>
              <Text style={s.overviewLabel}>Aktiva handlare</Text>
              <Text style={s.overviewVal}>{overview.totals?.active_users || 0}</Text>
            </View>
          </View>

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
    </ScrollView>
  );
}

// =================== SETTINGS TAB ===================
function SettingsTab() {
  const [settings, setSettings] = useState<any>({});
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminFetch('/settings');
        setSettings(data);
        setForm({
          resend_api_key: data.resend_api_key || '',
          sender_email: data.sender_email || '',
          app_name: data.app_name || '',
          grace_period_days: String(data.grace_period_days || 7),
          contact_email: data.contact_email || '',
          contact_phone: data.contact_phone || '',
        });
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: any = {};
      if (form.resend_api_key) data.resend_api_key = form.resend_api_key;
      if (form.sender_email) data.sender_email = form.sender_email;
      if (form.app_name) data.app_name = form.app_name;
      if (form.grace_period_days) data.grace_period_days = parseInt(form.grace_period_days);
      if (form.contact_email) data.contact_email = form.contact_email;
      if (form.contact_phone) data.contact_phone = form.contact_phone;
      await adminFetch('/settings', { method: 'PUT', body: JSON.stringify(data) });
      Alert.alert('Sparat', 'Systeminställningar uppdaterade');
    } catch (e: any) { Alert.alert('Fel', e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <ActivityIndicator size="large" color={C.blue} style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.tabPadding}>
      <Text style={s.sectionTitle}>Systeminställningar</Text>
      {[
        { key: 'app_name', label: 'Appnamn', placeholder: 'QR-Kassan', icon: 'apps-outline' as const },
        { key: 'resend_api_key', label: 'Resend API-nyckel', placeholder: 're_...', icon: 'key-outline' as const, secure: true },
        { key: 'sender_email', label: 'Avsändar e-post', placeholder: 'noreply@example.com', icon: 'mail-outline' as const },
        { key: 'grace_period_days', label: 'Grace period (dagar)', placeholder: '7', icon: 'time-outline' as const, num: true },
        { key: 'contact_email', label: 'Kontakt e-post', placeholder: 'support@example.com', icon: 'help-circle-outline' as const },
        { key: 'contact_phone', label: 'Kontakt telefon', placeholder: '070-1234567', icon: 'call-outline' as const },
      ].map(f => (
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
              keyboardType={f.num ? 'number-pad' : 'default'}
            />
          </View>
        </View>
      ))}
      <TouchableOpacity testID="save-system-settings-btn" style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveBtnText}>Spara inställningar</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// =================== MAIN SCREEN ===================
export default function SuperAdminScreen() {
  const router = useRouter();
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

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity testID="sa-back-btn" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Ionicons name="shield-checkmark" size={20} color={C.blue} />
          <Text style={s.headerTitle}>Superadmin</Text>
        </View>
        <TouchableOpacity testID="sa-logout-btn" onPress={handleLogout} style={s.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={C.red} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['users', 'stats', 'settings'] as const).map(t => (
          <TouchableOpacity key={t} testID={`sa-tab-${t}`} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Ionicons
              name={t === 'users' ? 'people-outline' : t === 'stats' ? 'bar-chart-outline' : 'cog-outline'}
              size={18} color={tab === t ? C.blue : C.textMut}
            />
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'users' ? 'Användare' : t === 'stats' ? 'Statistik' : 'Inställningar'}
            </Text>
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
  loginContainer: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loginCard: { backgroundColor: C.surface, borderRadius: 20, padding: 32, width: '100%', maxWidth: 400, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  loginTitle: { fontSize: 28, fontWeight: '700', color: C.text, marginTop: 16 },
  loginSub: { fontSize: 14, color: C.textSec, marginTop: 4, marginBottom: 24 },
  errorText: { color: C.red, fontSize: 14, marginBottom: 12 },
  loginInput: { width: '100%', height: 48, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, color: C.text, fontSize: 16, marginBottom: 12 },
  loginBtn: { width: '100%', height: 48, backgroundColor: C.blue, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  loginBtnText: { color: C.white, fontSize: 16, fontWeight: '600' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 36 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: C.text },
  logoutBtn: { padding: 4 },

  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.blue },
  tabText: { fontSize: 13, color: C.textMut },
  tabTextActive: { color: C.blue, fontWeight: '600' },
  tabPadding: { padding: 16 },

  // Users
  sectionTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 12 },
  guestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  guestTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  guestSub: { fontSize: 13, color: C.textMut, marginTop: 2 },
  guestBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.border },
  guestBtnActive: { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: C.green },
  guestBtnText: { fontSize: 13, color: C.text, fontWeight: '500' },
  userCard: { backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '600', color: C.text },
  userEmail: { fontSize: 13, color: C.textMut },
  subBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  subOn: { backgroundColor: 'rgba(34,197,94,0.15)' },
  subOff: { backgroundColor: 'rgba(239,68,68,0.15)' },
  subBadgeText: { fontSize: 12, fontWeight: '600' },
  userMeta: { flexDirection: 'row', gap: 16, marginTop: 8 },
  metaText: { fontSize: 12, color: C.textMut },
  userActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.surfaceHi },
  actionChipText: { fontSize: 12, fontWeight: '500' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: { width: '31%', backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 6 },
  statLabel: { fontSize: 11, color: C.textMut, marginTop: 2 },
  overviewCard: { backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  overviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  overviewLabel: { fontSize: 14, color: C.textSec },
  overviewVal: { fontSize: 16, fontWeight: '700', color: C.text },
  merchantRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  merchantName: { fontSize: 14, fontWeight: '500', color: C.text },
  merchantEmail: { fontSize: 12, color: C.textMut },
  merchantRev: { fontSize: 15, fontWeight: '700', color: C.green },
  merchantOrders: { fontSize: 12, color: C.textMut },

  // Settings
  settingField: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: C.textSec, marginBottom: 6 },
  fieldInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  fieldInput2: { flex: 1, height: 48, color: C.text, fontSize: 15 },
  fieldInput: { height: 48, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, color: C.text, fontSize: 15, marginTop: 6 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal: { backgroundColor: C.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: C.text },
  modalSub: { fontSize: 14, color: C.textMut, marginTop: 2 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  switchLabel: { fontSize: 15, color: C.text },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.15)' },
  toggleOn: { backgroundColor: 'rgba(34,197,94,0.15)' },
  toggleText: { fontSize: 14, fontWeight: '700', color: C.text },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelText: { color: C.textSec, fontSize: 15 },
  saveBtn: { flex: 1, height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: C.blue, marginTop: 12 },
  saveBtnText: { color: C.white, fontSize: 15, fontWeight: '600' },
});
