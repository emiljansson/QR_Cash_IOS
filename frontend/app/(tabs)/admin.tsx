import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Alert, Modal, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/utils/colors';
import { api } from '../../src/utils/api';

interface Product {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  category?: string;
  active?: boolean;
}

export default function AdminScreen() {
  const [tab, setTab] = useState<'products' | 'stats' | 'settings'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ name: '', price: '', image_url: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [pinVerified, setPinVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const [s, daily] = await Promise.all([api.getAdminStats(), api.getDailyStats()]);
      setStats({ ...s, daily });
    } catch {}
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      setSettingsForm({
        store_name: data.store_name || '',
        swish_phone: data.swish_phone || '',
        swish_message: data.swish_message || '',
        admin_pin: '',
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (pinVerified) {
      loadProducts();
      loadStats();
      loadSettings();
    }
  }, [pinVerified]);

  const handleVerifyPin = async () => {
    try {
      await api.verifyPin(pin);
      setPinVerified(true);
      setPinError('');
    } catch (e: any) {
      setPinError('Fel PIN-kod');
    }
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
        {(['products', 'stats', 'settings'] as const).map(t => (
          <TouchableOpacity
            key={t}
            testID={`admin-tab-${t}`}
            style={[styles.tabItem, tab === t && styles.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <Ionicons
              name={t === 'products' ? 'cube-outline' : t === 'stats' ? 'bar-chart-outline' : 'cog-outline'}
              size={18}
              color={tab === t ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'products' ? 'Produkter' : t === 'stats' ? 'Statistik' : 'Inställningar'}
            </Text>
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
            <FlatList
              data={products}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.productRow}>
                  <View style={styles.productRowInfo}>
                    <Text style={styles.productRowName}>{item.name}</Text>
                    <Text style={styles.productRowPrice}>{item.price.toFixed(0)} kr</Text>
                    {item.category ? <Text style={styles.productRowCategory}>{item.category}</Text> : null}
                  </View>
                  <View style={styles.productRowActions}>
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
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Inga produkter ännu</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.statsContent}>
          <TouchableOpacity testID="refresh-stats-btn" style={styles.refreshStatsBtn} onPress={loadStats}>
            <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
            <Text style={styles.refreshStatsText}>Uppdatera</Text>
          </TouchableOpacity>

          <View style={styles.statsGrid}>
            {[
              { label: 'Totala ordrar', value: stats?.total_orders || 0, icon: 'receipt-outline' as const },
              { label: 'Betalda', value: stats?.paid_orders || 0, icon: 'checkmark-circle-outline' as const },
              { label: 'Produkter', value: stats?.total_products || 0, icon: 'cube-outline' as const },
              { label: 'Omsättning', value: `${(stats?.total_revenue || 0).toFixed(0)} kr`, icon: 'cash-outline' as const },
            ].map(s => (
              <View key={s.label} style={styles.statCard}>
                <Ionicons name={s.icon} size={24} color={Colors.primary} />
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {stats?.daily && (
            <View style={styles.dailyStatsCard}>
              <Text style={styles.dailyTitle}>Idag</Text>
              <Text style={styles.dailyAmount}>{(stats.daily.totalSales || 0).toFixed(0)} kr</Text>
              <Text style={styles.dailyOrders}>{stats.daily.orderCount || 0} ordrar</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.settingsContent}>
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
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editProduct ? 'Redigera produkt' : 'Ny produkt'}</Text>
              <TouchableOpacity testID="close-modal-btn" onPress={() => { setShowAddProduct(false); setEditProduct(null); }}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {[
              { key: 'name', label: 'Produktnamn *', placeholder: 'T.ex. Kaffe' },
              { key: 'price', label: 'Pris (kr) *', placeholder: '25', keyboard: 'numeric' as const },
              { key: 'category', label: 'Kategori', placeholder: 'T.ex. Dryck' },
              { key: 'image_url', label: 'Bild-URL', placeholder: 'https://...' },
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
              style={[styles.saveButton, saving && { opacity: 0.6 }]}
              onPress={handleSaveProduct}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={Colors.white} /> : (
                <Text style={styles.saveButtonText}>{editProduct ? 'Uppdatera' : 'Skapa produkt'}</Text>
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
  },
  productRowInfo: { flex: 1 },
  productRowName: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  productRowPrice: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  productRowCategory: { fontSize: 12, color: Colors.textMuted },
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
});
