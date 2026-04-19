import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Alert, Modal, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform,
  useWindowDimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../../src/utils/colors';
import { api } from '../../src/utils/api';
import { localStore } from '../../src/utils/localFirstStore';
import { commHubWS } from '../../src/services/commHubWebSocket';
import { useAuth } from '../../src/contexts/AuthContext';

interface Product {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  category?: string;
  active?: boolean;
  sort_order?: number;
}

interface SubUser {
  user_id: string;
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  login_code?: string;
  last_login?: string;
  created_at?: string;
}

interface UserStat {
  user_id: string;
  name: string;
  email: string;
  total_sales: number;
  order_count: number;
  average_order: number;
}

interface ProductStat {
  product_id: string;
  name: string;
  quantity_sold: number;
  total_revenue: number;
  average_price: number;
}

interface UserSalesStatsProps {
  isWide: boolean;
  showAlert: (title: string, message: string) => void;
}

// Separate component for User Sales Statistics
function UserSalesStats({ isWide, showAlert }: UserSalesStatsProps) {
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('day');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [statsView, setStatsView] = useState<'users' | 'products'>('users');
  const [stats, setStats] = useState<{
    period_label: string;
    total_sales: number;
    total_orders: number;
    average_order: number;
    users: UserStat[];
    products: ProductStat[];
  } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setIsOffline(false);
    try {
      const data = await api.getUserSalesStats(
        period,
        startDate,
        period === 'custom' ? endDate : undefined
      );
      setStats(data);
    } catch (e: any) {
      // Check if it's a network error
      if (e.message?.includes('Network') || e.message?.includes('fetch') || e.message?.includes('Failed to fetch')) {
        setIsOffline(true);
      } else {
        showAlert('Fel', e.message || 'Kunde inte hämta statistik');
      }
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, showAlert]);

  useEffect(() => {
    loadStats();
  }, [period, startDate, endDate]);

  const navigateDate = (direction: number) => {
    const date = new Date(startDate);
    if (period === 'day') {
      date.setDate(date.getDate() + direction);
    } else if (period === 'week') {
      date.setDate(date.getDate() + (7 * direction));
    } else if (period === 'month') {
      date.setMonth(date.getMonth() + direction);
    } else if (period === 'year') {
      date.setFullYear(date.getFullYear() + direction);
    }
    setStartDate(date.toISOString().split('T')[0]);
  };

  const periodButtons = [
    { key: 'day', label: 'Dag' },
    { key: 'week', label: 'Vecka' },
    { key: 'month', label: 'Månad' },
    { key: 'year', label: 'År' },
    { key: 'custom', label: 'Period' },
  ] as const;

  return (
    <View>
      {/* Period selector */}
      <View style={userStatsStyles.periodSelector}>
        {periodButtons.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[userStatsStyles.periodBtn, period === p.key && userStatsStyles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[userStatsStyles.periodBtnText, period === p.key && userStatsStyles.periodBtnTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date navigation */}
      {period !== 'custom' ? (
        <View style={userStatsStyles.dateNav}>
          <TouchableOpacity style={userStatsStyles.dateNavBtn} onPress={() => navigateDate(-1)}>
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={userStatsStyles.dateNavLabel}>{stats?.period_label || '...'}</Text>
          <TouchableOpacity style={userStatsStyles.dateNavBtn} onPress={() => navigateDate(1)}>
            <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={userStatsStyles.refreshBtn} onPress={loadStats}>
            <Ionicons name="refresh" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={userStatsStyles.customDateContainer}>
          <View style={userStatsStyles.dateInputRow}>
            <View style={userStatsStyles.dateInputWrapper}>
              <Text style={userStatsStyles.dateInputLabel}>Från</Text>
              <TextInput
                style={userStatsStyles.dateInput}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={userStatsStyles.dateInputWrapper}>
              <Text style={userStatsStyles.dateInputLabel}>Till</Text>
              <TextInput
                style={userStatsStyles.dateInput}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>
          <TouchableOpacity style={userStatsStyles.applyDateBtn} onPress={loadStats}>
            <Text style={userStatsStyles.applyDateBtnText}>Visa</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary cards */}
      <View style={userStatsStyles.summaryRow}>
        <View style={userStatsStyles.summaryCard}>
          <Ionicons name="cash-outline" size={20} color={Colors.primary} />
          <Text style={userStatsStyles.summaryValue}>{(stats?.total_sales || 0).toFixed(0)} kr</Text>
          <Text style={userStatsStyles.summaryLabel}>Total</Text>
        </View>
        <View style={userStatsStyles.summaryCard}>
          <Ionicons name="receipt-outline" size={20} color={Colors.info} />
          <Text style={userStatsStyles.summaryValue}>{stats?.total_orders || 0}</Text>
          <Text style={userStatsStyles.summaryLabel}>Ordrar</Text>
        </View>
        <View style={userStatsStyles.summaryCard}>
          <Ionicons name="analytics-outline" size={20} color={Colors.warning} />
          <Text style={userStatsStyles.summaryValue}>{(stats?.average_order || 0).toFixed(0)} kr</Text>
          <Text style={userStatsStyles.summaryLabel}>Snitt</Text>
        </View>
      </View>

      {/* User sales list */}
      <View style={userStatsStyles.viewToggle}>
        <TouchableOpacity 
          style={[userStatsStyles.viewToggleBtn, statsView === 'users' && userStatsStyles.viewToggleBtnActive]}
          onPress={() => setStatsView('users')}
        >
          <Ionicons name="people-outline" size={16} color={statsView === 'users' ? Colors.white : Colors.textMuted} />
          <Text style={[userStatsStyles.viewToggleText, statsView === 'users' && userStatsStyles.viewToggleTextActive]}>
            Per användare
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[userStatsStyles.viewToggleBtn, statsView === 'products' && userStatsStyles.viewToggleBtnActive]}
          onPress={() => setStatsView('products')}
        >
          <Ionicons name="pricetag-outline" size={16} color={statsView === 'products' ? Colors.white : Colors.textMuted} />
          <Text style={[userStatsStyles.viewToggleText, statsView === 'products' && userStatsStyles.viewToggleTextActive]}>
            Per produkt
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
      ) : isOffline ? (
        // Offline mode message
        <View style={userStatsStyles.offlineContainer}>
          <View style={userStatsStyles.offlineIconWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color={Colors.warning} />
          </View>
          <Text style={userStatsStyles.offlineTitle}>Du är offline</Text>
          <Text style={userStatsStyles.offlineText}>
            Försäljningsstatistik kräver internetanslutning för att visa aktuell data.
          </Text>
          <TouchableOpacity style={userStatsStyles.retryBtn} onPress={loadStats}>
            <Ionicons name="refresh-outline" size={18} color={Colors.white} />
            <Text style={userStatsStyles.retryBtnText}>Försök igen</Text>
          </TouchableOpacity>
        </View>
      ) : statsView === 'users' ? (
        // User statistics view
        stats?.users && stats.users.length > 0 ? (
          <View style={userStatsStyles.userList}>
            {stats.users.map((user, idx) => (
              <View key={user.user_id} style={userStatsStyles.userRow}>
                <View style={userStatsStyles.userRank}>
                  <Text style={userStatsStyles.userRankText}>{idx + 1}</Text>
                </View>
                <View style={userStatsStyles.userInfo}>
                  <Text style={userStatsStyles.userName}>{user.name}</Text>
                  <Text style={userStatsStyles.userEmail}>{user.email}</Text>
                </View>
                <View style={userStatsStyles.userStats}>
                  <Text style={userStatsStyles.userSales}>{user.total_sales.toFixed(0)} kr</Text>
                  <Text style={userStatsStyles.userOrders}>{user.order_count} ordrar</Text>
                  <Text style={userStatsStyles.userAvg}>~{user.average_order.toFixed(0)} kr/order</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={userStatsStyles.emptyState}>
            <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
            <Text style={userStatsStyles.emptyText}>Ingen försäljning under perioden</Text>
          </View>
        )
      ) : (
        // Product statistics view
        stats?.products && stats.products.length > 0 ? (
          <View style={userStatsStyles.userList}>
            {stats.products.map((product, idx) => (
              <View key={product.product_id} style={userStatsStyles.userRow}>
                <View style={[userStatsStyles.userRank, { backgroundColor: Colors.warning + '20' }]}>
                  <Text style={[userStatsStyles.userRankText, { color: Colors.warning }]}>{idx + 1}</Text>
                </View>
                <View style={userStatsStyles.userInfo}>
                  <Text style={userStatsStyles.userName}>{product.name}</Text>
                  <Text style={userStatsStyles.userEmail}>{product.quantity_sold} st såld</Text>
                </View>
                <View style={userStatsStyles.userStats}>
                  <Text style={userStatsStyles.userSales}>{product.total_revenue.toFixed(0)} kr</Text>
                  <Text style={userStatsStyles.userOrders}>{product.quantity_sold} st</Text>
                  <Text style={userStatsStyles.userAvg}>~{product.average_price.toFixed(0)} kr/st</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={userStatsStyles.emptyState}>
            <Ionicons name="pricetag-outline" size={48} color={Colors.textMuted} />
            <Text style={userStatsStyles.emptyText}>Inga produkter sålda under perioden</Text>
          </View>
        )
      )}
    </View>
  );
}

const userStatsStyles = StyleSheet.create({
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  periodBtnActive: {
    backgroundColor: Colors.primary,
  },
  periodBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  periodBtnTextActive: {
    color: Colors.white,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 12,
  },
  dateNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    minWidth: 150,
    textAlign: 'center',
  },
  refreshBtn: {
    padding: 8,
  },
  customDateContainer: {
    marginBottom: 16,
  },
  dateInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dateInputWrapper: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  dateInput: {
    height: 44,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  applyDateBtn: {
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyDateBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 6,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  viewToggleTextActive: {
    color: Colors.white,
  },
  userList: {
    gap: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  offlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  offlineIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.warning + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  offlineText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  retryBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  userRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userRankText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  userEmail: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  userStats: {
    alignItems: 'flex-end',
  },
  userSales: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  userOrders: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  userAvg: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 15,
    marginTop: 12,
  },
});

export default function AdminScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  
  const [tab, setTab] = useState<'products' | 'users' | 'stats' | 'settings'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ name: '', price: '', image_url: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [pinVerified, setPinVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  
  // Sub-users state
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ first_name: '', last_name: '', email: '' });
  const [savingUser, setSavingUser] = useState(false);
  
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);
  
  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  
  // Default QR-Kassan logo
  const DEFAULT_LOGO = 'https://res.cloudinary.com/demo/image/upload/v1/qrkassan/logos/default_logo.png';

  // Web-compatible alert helpers
  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'OK', onPress: onConfirm },
      ]);
    }
  };

  const loadProducts = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      // Use local-first store for products
      const data = await localStore.getProducts(user.user_id, false);
      // Sort by sort_order
      data.sort((a: Product, b: Product) => (a.sort_order || 0) - (b.sort_order || 0));
      setProducts(data);
    } catch {} finally { setLoading(false); }
  }, [user?.user_id]);

  const handleReorderProducts = useCallback(async (data: Product[]) => {
    setProducts(data);
    // Save new order to backend
    try {
      const productIds = data.map(p => p.id);
      await api.reorderProducts(productIds);
    } catch (e) {
      showAlert('Fel', 'Kunde inte spara ordningen');
      loadProducts(); // Reload original order on error
    }
  }, [loadProducts]);

  const loadSettings = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      // Use local-first store for settings
      const data = await localStore.getSettings(user.user_id);
      setSettings(data);
      setSettingsForm({
        store_name: data.store_name || '',
        swish_phone: data.swish_phone || '',
        swish_message: data.swish_message || '',
        admin_pin: '',
      });
      // Set logo preview from settings
      if (data.logo_url) {
        setLogoPreview(data.logo_url);
      }
    } catch {}
  }, [user?.user_id]);

  const loadSubUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await api.fetch('/org/users');
      setSubUsers(data.users || []);
    } catch (e) {
      // Silent fail - will show empty list
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (pinVerified && user?.user_id) {
      loadProducts();
      loadSettings();
      loadSubUsers();
      // Start auto-sync
      localStore.startAutoSync(user.user_id);
    }
    return () => { localStore.stopAutoSync(); };
  }, [pinVerified, user?.user_id, loadProducts, loadSettings, loadSubUsers]);
  
  // Listen for real-time product updates
  useEffect(() => {
    const unsubscribe = commHubWS.onMessage((message) => {
      if (message.type === 'document_changed' && message.collection === 'qr_products') {
        console.log('[Admin] Real-time product update:', message.operation);
        if (user?.user_id) {
          localStore.invalidateCache('products', user.user_id);
          loadProducts();
        }
      }
    });
    return unsubscribe;
  }, [loadProducts, user?.user_id]);

  const handleVerifyPin = async () => {
    try {
      await api.verifyPin(pin);
      setPinVerified(true);
      setPinError('');
    } catch (e: any) {
      setPinError('Fel PIN-kod');
    }
  };

  // Sub-user handlers
  const handleCreateUser = async () => {
    if (!userForm.first_name || !userForm.last_name || !userForm.email) {
      showAlert('Fel', 'Fyll i alla fält');
      return;
    }
    setSavingUser(true);
    try {
      await api.fetch('/org/users', {
        method: 'POST',
        body: JSON.stringify(userForm),
      });
      showAlert('Klart', 'Användare skapad och välkomstmail skickat!');
      setShowAddUser(false);
      setUserForm({ first_name: '', last_name: '', email: '' });
      loadSubUsers();
    } catch (e: any) {
      showAlert('Fel', e.message || 'Kunde inte skapa användare');
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = (user: SubUser) => {
    confirmAction(
      'Ta bort användare',
      `Vill du ta bort ${user.name || user.email}?`,
      async () => {
        try {
          await api.fetch(`/org/users/${user.user_id}`, { method: 'DELETE' });
          loadSubUsers();
        } catch (e: any) {
          showAlert('Fel', e.message);
        }
      }
    );
  };

  const handleResetPassword = (user: SubUser) => {
    confirmAction(
      'Återställ lösenord',
      `Återställ lösenord för ${user.name || user.email}?`,
      async () => {
        try {
          const result = await api.fetch(`/org/users/${user.user_id}/reset-password`, { method: 'POST' });
          showAlert('Klart', `Nytt lösenord: ${result.temp_password}\n\nSpara detta lösenord!`);
        } catch (e: any) {
          showAlert('Fel', e.message);
        }
      }
    );
  };

  const handleSendCredentials = async (user: SubUser) => {
    confirmAction(
      'Skicka inloggningsinfo',
      `Skicka ny inloggningskod och lösenord till ${user.email}? Tidigare inloggningsuppgifter kommer sluta fungera.`,
      async () => {
        try {
          await api.fetch(`/org/users/${user.user_id}/send-credentials`, { method: 'POST' });
          showAlert('Klart', 'Ny inloggningsinfo skickad till användaren!');
          loadSubUsers();
        } catch (e: any) {
          showAlert('Fel', e.message);
        }
      }
    );
  };

  const handleRegenerateCode = (user: SubUser) => {
    confirmAction(
      'Ny inloggningskod',
      'Skapa en ny inloggningskod? Den gamla slutar fungera.',
      async () => {
        try {
          const result = await api.fetch(`/org/users/${user.user_id}/regenerate-code`, { method: 'POST' });
          showAlert('Klart', `Ny kod: ${result.login_code}`);
          loadSubUsers();
        } catch (e: any) {
          showAlert('Fel', e.message);
        }
      }
    );
  };

  // Image picker functions
  const requestImagePermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
        Alert.alert('Behörighet krävs', 'Vi behöver tillgång till kamera och bildgalleri för att ladda upp produktbilder.');
        return false;
      }
    }
    return true;
  };

  const uploadImageToCloudinary = async (uri: string): Promise<string | null> => {
    try {
      setUploadingImage(true);
      
      // Read the image as base64
      const response = await fetch(uri);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result as string;
            
            // Upload to Cloudinary via backend
            const result = await api.fetch('/cloudinary/upload', {
              method: 'POST',
              body: JSON.stringify({
                image: base64,
                folder: 'products'
              })
            });
            
            if (result.success && result.url) {
              resolve(result.url);
            } else {
              reject(new Error('Upload failed'));
            }
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(blob);
      });
    } catch (e: any) {
      Alert.alert('Uppladdningsfel', e.message || 'Kunde inte ladda upp bilden');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const pickImageFromGallery = async () => {
    const hasPermission = await requestImagePermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProductImage(result.assets[0].uri);
        const cloudinaryUrl = await uploadImageToCloudinary(result.assets[0].uri);
        if (cloudinaryUrl) {
          setProductForm(prev => ({ ...prev, image_url: cloudinaryUrl }));
        }
      }
    } catch (e: any) {
      Alert.alert('Fel', 'Kunde inte välja bild');
    }
  };

  const takePhotoWithCamera = async () => {
    const hasPermission = await requestImagePermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProductImage(result.assets[0].uri);
        const cloudinaryUrl = await uploadImageToCloudinary(result.assets[0].uri);
        if (cloudinaryUrl) {
          setProductForm(prev => ({ ...prev, image_url: cloudinaryUrl }));
        }
      }
    } catch (e: any) {
      Alert.alert('Fel', 'Kunde inte ta foto');
    }
  };

  const showImagePicker = () => {
    if (Platform.OS === 'web') {
      // On web, directly open gallery
      pickImageFromGallery();
    } else {
      Alert.alert(
        'Välj bild',
        'Hur vill du lägga till en produktbild?',
        [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Ta foto', onPress: takePhotoWithCamera },
          { text: 'Välj från galleri', onPress: pickImageFromGallery },
        ]
      );
    }
  };

  // Logo upload functions
  const uploadLogoToCloudinary = async (uri: string): Promise<string | null> => {
    try {
      setUploadingLogo(true);
      
      const response = await fetch(uri);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result as string;
            
            // Upload to Cloudinary via backend with logos folder
            const result = await api.fetch('/cloudinary/upload', {
              method: 'POST',
              body: JSON.stringify({
                image: base64,
                folder: 'logos'
              })
            });
            
            if (result.success && result.url) {
              resolve(result.url);
            } else {
              reject(new Error('Upload failed'));
            }
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(blob);
      });
    } catch (e: any) {
      showAlert('Uppladdningsfel', e.message || 'Kunde inte ladda upp logotypen');
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleChooseLogo = async () => {
    const hasPermission = await requestImagePermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const localUri = result.assets[0].uri;
        setLogoPreview(localUri);
        
        // Upload to Cloudinary
        const cloudinaryUrl = await uploadLogoToCloudinary(localUri);
        if (cloudinaryUrl) {
          // Save to backend settings
          await api.fetch('/admin/logo', {
            method: 'PUT',
            body: JSON.stringify({ logo_url: cloudinaryUrl })
          });
          setLogoPreview(cloudinaryUrl);
          showAlert('Klart', 'Logotypen har sparats!');
        }
      }
    } catch (e: any) {
      showAlert('Fel', 'Kunde inte välja bild');
    }
  };

  const handleTakeLogoPhoto = async () => {
    const hasPermission = await requestImagePermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const localUri = result.assets[0].uri;
        setLogoPreview(localUri);
        
        // Upload to Cloudinary
        const cloudinaryUrl = await uploadLogoToCloudinary(localUri);
        if (cloudinaryUrl) {
          // Save to backend settings
          await api.fetch('/admin/logo', {
            method: 'PUT',
            body: JSON.stringify({ logo_url: cloudinaryUrl })
          });
          setLogoPreview(cloudinaryUrl);
          showAlert('Klart', 'Logotypen har sparats!');
        }
      }
    } catch (e: any) {
      showAlert('Fel', 'Kunde inte ta foto');
    }
  };

  const showLogoPicker = () => {
    if (Platform.OS === 'web') {
      handleChooseLogo();
    } else {
      Alert.alert(
        'Välj logotyp',
        'Hur vill du lägga till en logotyp?',
        [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Ta foto', onPress: handleTakeLogoPhoto },
          { text: 'Välj från galleri', onPress: handleChooseLogo },
        ]
      );
    }
  };

  const handleRemoveLogo = () => {
    confirmAction(
      'Ta bort logotyp',
      'Vill du ta bort din butikslogotyp?',
      async () => {
        try {
          await api.fetch('/admin/logo', { method: 'DELETE' });
          setLogoPreview(null);
          showAlert('Klart', 'Logotypen har tagits bort');
        } catch (e: any) {
          showAlert('Fel', e.message || 'Kunde inte ta bort logotypen');
        }
      }
    );
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.price) {
      Alert.alert('Fel', 'Namn och pris krävs');
      return;
    }
    setSaving(true);
    try {
      if (editProduct) {
        await api.updateProduct(editProduct.id, {
          name: productForm.name,
          price: parseFloat(productForm.price),
          image_url: productForm.image_url || undefined,
          category: productForm.category || undefined,
        });
      } else {
        await api.createProduct({
          name: productForm.name,
          price: parseFloat(productForm.price),
          image_url: productForm.image_url || undefined,
          category: productForm.category || undefined,
        });
      }
      setShowAddProduct(false);
      setEditProduct(null);
      setProductForm({ name: '', price: '', image_url: '', category: '' });
      loadProducts();
    } catch (e: any) {
      Alert.alert('Fel', e.message);
    } finally { setSaving(false); }
  };

  const handleDeleteProduct = (product: Product) => {
    Alert.alert('Radera produkt', `Vill du radera "${product.name}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Radera', style: 'destructive', onPress: async () => {
          try { await api.deleteProduct(product.id); loadProducts(); }
          catch (e: any) { Alert.alert('Fel', e.message); }
        },
      },
    ]);
  };

  const handleToggleProductVisibility = async (product: Product) => {
    try {
      const newActive = product.active === false ? true : false;
      await api.updateProduct(product.id, { active: newActive });
      loadProducts();
    } catch (e: any) {
      showAlert('Fel', e.message || 'Kunde inte ändra synlighet');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const data: any = {};
      if (settingsForm.store_name) data.store_name = settingsForm.store_name;
      if (settingsForm.swish_phone) data.swish_phone = settingsForm.swish_phone;
      if (settingsForm.swish_message) data.swish_message = settingsForm.swish_message;
      if (settingsForm.admin_pin) data.admin_pin = settingsForm.admin_pin;
      await api.updateSettings(data);
      Alert.alert('Sparat', 'Inställningar uppdaterade');
      loadSettings();
    } catch (e: any) {
      Alert.alert('Fel', e.message);
    } finally { setSaving(false); }
  };

  if (!pinVerified) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={styles.pinContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Ionicons name="lock-closed" size={48} color={Colors.primary} />
          <Text style={styles.pinTitle}>Admin</Text>
          <Text style={styles.pinSubtitle}>Ange PIN-kod</Text>
          {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
          <TextInput
            testID="admin-pin-input"
            style={styles.pinInput}
            value={pin}
            onChangeText={setPin}
            placeholder="1234"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
          <TouchableOpacity testID="verify-pin-btn" style={styles.pinButton} onPress={handleVerifyPin}>
            <Text style={styles.pinButtonText}>Logga in</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        {([
          { key: 'products', icon: 'cube-outline', label: 'Produkter' },
          { key: 'users', icon: 'people-outline', label: 'Användare' },
          { key: 'stats', icon: 'bar-chart-outline', label: 'Statistik' },
          { key: 'settings', icon: 'cog-outline', label: 'Inställningar' },
        ] as const).map(t => (
          <TouchableOpacity
            key={t.key}
            testID={`admin-tab-${t.key}`}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key as any)}
          >
            <Ionicons
              name={t.icon as any}
              size={isWide ? 18 : 22}
              color={tab === t.key ? Colors.primary : Colors.textMuted}
            />
            {isWide && (
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Products Tab */}
      {tab === 'products' && (
        <View style={styles.tabContent}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Produkter ({products.length})</Text>
            <TouchableOpacity
              testID="add-product-btn"
              style={styles.addButton}
              onPress={() => {
                setProductForm({ name: '', price: '', image_url: '', category: '' });
                setProductImage(null);
                setEditProduct(null);
                setShowAddProduct(true);
              }}
            >
              <Ionicons name="add" size={20} color={Colors.white} />
              <Text style={styles.addButtonText}>Lägg till</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <GestureHandlerRootView style={{ flex: 1 }}>
              <DraggableFlatList
                data={products}
                keyExtractor={item => item.id}
                onDragEnd={({ data }) => handleReorderProducts(data)}
                renderItem={({ item, drag, isActive }: RenderItemParams<Product>) => (
                  <ScaleDecorator>
                    <TouchableOpacity
                      onLongPress={drag}
                      disabled={isActive}
                      style={[
                        styles.productRow, 
                        isActive && styles.productRowDragging,
                        item.active === false && styles.productRowHidden
                      ]}
                    >
                      <View style={styles.dragHandle}>
                        <Ionicons name="menu" size={20} color={Colors.textMuted} />
                      </View>
                      <View style={styles.productRowInfo}>
                        <Text style={[styles.productRowName, item.active === false && styles.productRowNameHidden]}>
                          {item.name}
                        </Text>
                        <Text style={styles.productRowPrice}>{item.price.toFixed(0)} kr</Text>
                        {item.category ? <Text style={styles.productRowCategory}>{item.category}</Text> : null}
                        {item.active === false && (
                          <Text style={styles.hiddenBadge}>Dold i kassan</Text>
                        )}
                      </View>
                      <View style={styles.productRowActions}>
                        <TouchableOpacity
                          testID={`toggle-product-${item.id}`}
                          style={styles.actionBtn}
                          onPress={() => handleToggleProductVisibility(item)}
                        >
                          <Ionicons 
                            name={item.active === false ? "eye-off-outline" : "eye-outline"} 
                            size={18} 
                            color={item.active === false ? Colors.textMuted : Colors.primary} 
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`edit-product-${item.id}`}
                          style={styles.actionBtn}
                          onPress={() => {
                            setEditProduct(item);
                            setProductForm({
                              name: item.name,
                              price: String(item.price),
                              image_url: item.image_url || '',
                              category: item.category || '',
                            });
                            setProductImage(item.image_url || null);
                            setShowAddProduct(true);
                          }}
                        >
                          <Ionicons name="create-outline" size={18} color={Colors.info} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`delete-product-${item.id}`}
                          style={styles.actionBtn}
                          onPress={() => handleDeleteProduct(item)}
                        >
                          <Ionicons name="trash-outline" size={18} color={Colors.destructive} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  </ScaleDecorator>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>Inga produkter ännu</Text>
                  </View>
                }
              />
              <Text style={styles.dragHint}>Håll inne och dra för att ändra ordning</Text>
            </GestureHandlerRootView>
          )}
        </View>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <View style={styles.tabContent}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Användare ({subUsers.length})</Text>
            <TouchableOpacity
              testID="add-user-btn"
              style={styles.addButton}
              onPress={() => {
                setUserForm({ first_name: '', last_name: '', email: '' });
                setShowAddUser(true);
              }}
            >
              <Ionicons name="add" size={20} color={Colors.white} />
              {isWide && <Text style={styles.addButtonText}>Lägg till</Text>}
            </TouchableOpacity>
          </View>

          {loadingUsers ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={subUsers}
              keyExtractor={item => item.user_id}
              renderItem={({ item }) => (
                <View style={styles.userRow}>
                  <View style={styles.userRowInfo}>
                    <Text style={styles.userRowName}>{item.name || `${item.first_name} ${item.last_name}`}</Text>
                    <Text style={styles.userRowEmail}>{item.email}</Text>
                    <View style={styles.userRowMeta}>
                      <Text style={styles.userRowCode}>Kod: {item.login_code || '-'}</Text>
                      <Text style={styles.userRowLogin}>
                        {item.last_login 
                          ? `Senast: ${new Date(item.last_login).toLocaleDateString('sv-SE')}`
                          : 'Aldrig inloggad'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.userRowActions}>
                    <TouchableOpacity
                      style={[styles.userActionBtn, isWide && styles.userActionBtnWide]}
                      onPress={() => handleSendCredentials(item)}
                    >
                      <Ionicons name="send-outline" size={18} color={Colors.info} />
                      {isWide && <Text style={[styles.userActionText, { color: Colors.info }]}>Skicka info</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.userActionBtn, isWide && styles.userActionBtnWide]}
                      onPress={() => handleDeleteUser(item)}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.destructive} />
                      {isWide && <Text style={[styles.userActionText, { color: Colors.destructive }]}>Ta bort</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>Inga användare ännu</Text>
                  <Text style={styles.emptySubtext}>Lägg till användare för att dela kassan</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.statsContent}>
          <UserSalesStats 
            isWide={isWide}
            showAlert={showAlert}
          />
        </ScrollView>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.settingsContent}>
          {/* Logo upload section */}
          <View style={styles.logoSection}>
            <Text style={styles.settingLabel}>Butikslogotyp</Text>
            <View style={styles.logoContainer}>
              {logoPreview ? (
                <View style={styles.logoPreviewContainer}>
                  <Image 
                    source={{ uri: logoPreview }} 
                    style={styles.logoPreview}
                  />
                  <View style={styles.logoActions}>
                    <TouchableOpacity 
                      style={styles.logoChangeBtn}
                      onPress={showLogoPicker}
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                          <Text style={styles.logoChangeBtnText}>Byt</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.logoRemoveBtn}
                      onPress={handleRemoveLogo}
                      disabled={uploadingLogo}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.destructive} />
                      <Text style={styles.logoRemoveBtnText}>Ta bort</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.logoPickerBtn}
                  onPress={showLogoPicker}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
                      <Text style={styles.logoPickerText}>
                        {Platform.OS === 'web' ? 'Välj logotyp' : 'Ta foto eller välj från galleri'}
                      </Text>
                      <Text style={styles.logoPickerHint}>
                        Rekommenderad storlek: 200x200px
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Divider */}
          <View style={styles.settingsDivider} />

          {[
            { key: 'store_name', label: 'Butiksnamn', icon: 'storefront-outline' as const },
            { key: 'swish_phone', label: 'Swish-nummer', icon: 'call-outline' as const, keyboard: 'phone-pad' as const },
            { key: 'swish_message', label: 'Swish-meddelande', icon: 'chatbox-outline' as const },
            { key: 'admin_pin', label: 'Ny PIN-kod', icon: 'lock-closed-outline' as const, keyboard: 'number-pad' as const, secure: true },
          ].map(field => (
            <View key={field.key} style={styles.settingField}>
              <Text style={styles.settingLabel}>{field.label}</Text>
              <View style={styles.settingInputWrapper}>
                <Ionicons name={field.icon} size={18} color={Colors.textMuted} />
                <TextInput
                  testID={`setting-${field.key}-input`}
                  style={styles.settingInput}
                  value={settingsForm[field.key] || ''}
                  onChangeText={(v) => setSettingsForm((prev: any) => ({ ...prev, [field.key]: v }))}
                  placeholder={settings[field.key] || ''}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={field.keyboard || 'default'}
                  secureTextEntry={field.secure}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity
            testID="save-settings-btn"
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSaveSettings}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={Colors.white} /> : (
              <Text style={styles.saveButtonText}>Spara inställningar</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Add/Edit Product Modal */}
      <Modal visible={showAddProduct} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editProduct ? 'Redigera produkt' : 'Ny produkt'}</Text>
                <TouchableOpacity testID="close-modal-btn" onPress={() => { 
                  setShowAddProduct(false); 
                  setEditProduct(null); 
                  setProductImage(null);
                }}>
                  <Ionicons name="close" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Image picker section */}
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Produktbild</Text>
                <View style={styles.imagePickerContainer}>
                  {(productImage || productForm.image_url) ? (
                    <View style={styles.imagePreviewContainer}>
                      <Image 
                        source={{ uri: productImage || productForm.image_url }} 
                        style={styles.imagePreview}
                      />
                      <TouchableOpacity 
                        style={styles.removeImageBtn}
                        onPress={() => {
                          setProductImage(null);
                          setProductForm(prev => ({ ...prev, image_url: '' }));
                        }}
                      >
                        <Ionicons name="close-circle" size={24} color={Colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      style={styles.imagePickerBtn}
                      onPress={showImagePicker}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? (
                        <ActivityIndicator color={Colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={32} color={Colors.textMuted} />
                          <Text style={styles.imagePickerText}>
                            {Platform.OS === 'web' ? 'Välj bild' : 'Ta foto eller välj från galleri'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  
                  {/* Change image button when image exists */}
                  {(productImage || productForm.image_url) && !uploadingImage && (
                    <TouchableOpacity 
                      style={styles.changeImageBtn}
                      onPress={showImagePicker}
                    >
                      <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                      <Text style={styles.changeImageText}>Byt bild</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {[
                { key: 'name', label: 'Produktnamn *', placeholder: 'T.ex. Kaffe' },
                { key: 'price', label: 'Pris (kr) *', placeholder: '25', keyboard: 'numeric' as const },
                { key: 'category', label: 'Kategori', placeholder: 'T.ex. Dryck' },
              ].map(f => (
                <View key={f.key} style={styles.modalField}>
                  <Text style={styles.modalLabel}>{f.label}</Text>
                  <TextInput
                    testID={`product-form-${f.key}`}
                    style={styles.modalInput}
                    value={productForm[f.key as keyof typeof productForm]}
                    onChangeText={(v) => setProductForm(prev => ({ ...prev, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType={f.keyboard || 'default'}
                  />
                </View>
              ))}

              <TouchableOpacity
                testID="save-product-btn"
                style={[styles.saveButton, (saving || uploadingImage) && { opacity: 0.6 }]}
                onPress={handleSaveProduct}
                disabled={saving || uploadingImage}
              >
                {saving ? <ActivityIndicator color={Colors.white} /> : (
                  <Text style={styles.saveButtonText}>{editProduct ? 'Uppdatera' : 'Skapa produkt'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add User Modal */}
      <Modal visible={showAddUser} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ny användare</Text>
              <TouchableOpacity testID="close-user-modal-btn" onPress={() => setShowAddUser(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Förnamn *</Text>
              <TextInput
                testID="user-form-first-name"
                style={styles.modalInput}
                value={userForm.first_name}
                onChangeText={(v) => setUserForm(prev => ({ ...prev, first_name: v }))}
                placeholder="Förnamn"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Efternamn *</Text>
              <TextInput
                testID="user-form-last-name"
                style={styles.modalInput}
                value={userForm.last_name}
                onChangeText={(v) => setUserForm(prev => ({ ...prev, last_name: v }))}
                placeholder="Efternamn"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>E-postadress *</Text>
              <TextInput
                testID="user-form-email"
                style={styles.modalInput}
                value={userForm.email}
                onChangeText={(v) => setUserForm(prev => ({ ...prev, email: v }))}
                placeholder="namn@exempel.se"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.modalHint}>
              En inloggningskod genereras automatiskt och skickas via e-post.
            </Text>

            <TouchableOpacity
              testID="create-user-btn"
              style={[styles.saveButton, savingUser && { opacity: 0.6 }]}
              onPress={handleCreateUser}
              disabled={savingUser}
            >
              {savingUser ? <ActivityIndicator color={Colors.white} /> : (
                <Text style={styles.saveButtonText}>Skapa användare</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  pinContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  pinTitle: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary, marginTop: 16 },
  pinSubtitle: { fontSize: 16, color: Colors.textSecondary, marginTop: 4 },
  pinError: { color: Colors.destructive, marginTop: 12 },
  pinInput: {
    width: '100%', maxWidth: 200, height: 56, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 24, textAlign: 'center', marginTop: 24,
    letterSpacing: 8,
  },
  pinButton: {
    backgroundColor: Colors.primary, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', width: '100%', maxWidth: 200, marginTop: 16,
  },
  pinButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6,
  },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, color: Colors.textMuted },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },
  tabContent: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  addButton: {
    flexDirection: 'row', backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, alignItems: 'center', gap: 4,
  },
  addButtonText: { color: Colors.white, fontSize: 14, fontWeight: '500' },
  productRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  productRowDragging: {
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  dragHandle: {
    paddingRight: 12,
    paddingVertical: 8,
  },
  dragHint: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 12,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceHighlight,
  },
  productRowInfo: { flex: 1 },
  productRowName: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  productRowNameHidden: { color: Colors.textMuted },
  productRowPrice: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  productRowCategory: { fontSize: 12, color: Colors.textMuted },
  productRowHidden: { 
    backgroundColor: Colors.surfaceHighlight,
    opacity: 0.7,
  },
  hiddenBadge: { 
    fontSize: 11, 
    color: Colors.warning || '#f59e0b', 
    fontWeight: '500',
    marginTop: 2,
  },
  productRowActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 6 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.textMuted, fontSize: 16 },
  statsContent: { padding: 16 },
  refreshStatsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 12, padding: 4 },
  refreshStatsText: { color: Colors.textSecondary, fontSize: 13 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '48%', backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginTop: 8 },
  statLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  dailyStatsCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 20,
    borderWidth: 1, borderColor: Colors.border, marginTop: 16, alignItems: 'center',
  },
  dailyTitle: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  dailyAmount: { fontSize: 36, fontWeight: '700', color: Colors.primary, marginTop: 8 },
  dailyOrders: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  settingsContent: { padding: 16 },
  settingField: { marginBottom: 16 },
  settingLabel: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 6 },
  settingInputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, gap: 8,
  },
  settingInput: { flex: 1, height: 48, color: Colors.textPrimary, fontSize: 16 },
  saveButton: {
    backgroundColor: Colors.primary, height: 52, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  saveButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  modalField: { marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 6 },
  modalInput: {
    height: 48, backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
    color: Colors.textPrimary, fontSize: 16, letterSpacing: 0,
  },
  modalHint: {
    fontSize: 13, color: Colors.textMuted, marginBottom: 16, textAlign: 'center',
  },
  // User list styles
  userRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: Colors.surface,
    borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  userRowInfo: { flex: 1 },
  userRowName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  userRowEmail: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  userRowMeta: { flexDirection: 'row', gap: 16, marginTop: 6 },
  userRowCode: { fontSize: 12, color: Colors.info, fontWeight: '500' },
  userRowLogin: { fontSize: 12, color: Colors.textMuted },
  userRowActions: { flexDirection: 'row', gap: 8 },
  userActionBtn: { 
    padding: 8, backgroundColor: Colors.surfaceHighlight, borderRadius: 8,
  },
  userActionBtnWide: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12,
  },
  userActionText: { fontSize: 12, fontWeight: '500' },
  emptySubtext: { fontSize: 14, color: Colors.textMuted, marginTop: 8 },
  // Image picker styles
  imagePickerContainer: { alignItems: 'center' },
  imagePickerBtn: {
    width: 150, height: 150, borderRadius: 12, borderWidth: 2, borderColor: Colors.border,
    borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.background,
  },
  imagePickerText: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8, paddingHorizontal: 8 },
  imagePreviewContainer: { position: 'relative' },
  imagePreview: { width: 150, height: 150, borderRadius: 12 },
  removeImageBtn: { position: 'absolute', top: -8, right: -8 },
  changeImageBtn: { 
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, 
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.surfaceHighlight, borderRadius: 8,
  },
  changeImageText: { color: Colors.primary, fontSize: 13, fontWeight: '500' },
  // Logo upload styles
  logoSection: { marginBottom: 16 },
  logoContainer: { alignItems: 'center', marginTop: 8 },
  logoPreviewContainer: { alignItems: 'center' },
  logoPreview: { 
    width: 120, height: 120, borderRadius: 16, 
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  logoActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  logoChangeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: Colors.surfaceHighlight, borderRadius: 8,
  },
  logoChangeBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '500' },
  logoRemoveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: Colors.surfaceHighlight, borderRadius: 8,
  },
  logoRemoveBtnText: { color: Colors.destructive, fontSize: 14, fontWeight: '500' },
  logoPickerBtn: {
    width: 160, height: 160, borderRadius: 16, borderWidth: 2, borderColor: Colors.border,
    borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.background,
  },
  logoPickerText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
  logoPickerHint: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 4, opacity: 0.7 },
  settingsDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 16 },
});
