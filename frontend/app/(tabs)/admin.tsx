import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Alert, Modal, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform,
  useWindowDimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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

export default function AdminScreen() {
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  
  const [tab, setTab] = useState<'products' | 'users' | 'stats' | 'settings'>('products');
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
  
  // Sub-users state
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ first_name: '', last_name: '', email: '' });
  const [savingUser, setSavingUser] = useState(false);
  
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);

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

  const loadSubUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await api.fetch('/org/users');
      setSubUsers(data.users || []);
    } catch (e) {
      console.error('Failed to load sub-users:', e);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (pinVerified) {
      loadProducts();
      loadStats();
      loadSettings();
      loadSubUsers();
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

  // Sub-user handlers
  const handleCreateUser = async () => {
    if (!userForm.first_name || !userForm.last_name || !userForm.email) {
      Alert.alert('Fel', 'Fyll i alla fält');
      return;
    }
    setSavingUser(true);
    try {
      await api.fetch('/org/users', {
        method: 'POST',
        body: JSON.stringify(userForm),
      });
      Alert.alert('Klart', 'Användare skapad och välkomstmail skickat!');
      setShowAddUser(false);
      setUserForm({ first_name: '', last_name: '', email: '' });
      loadSubUsers();
    } catch (e: any) {
      Alert.alert('Fel', e.message || 'Kunde inte skapa användare');
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = (user: SubUser) => {
    Alert.alert(
      'Ta bort användare',
      `Vill du ta bort ${user.name || user.email}?`,
      [
        { text: 'Avbryt' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.fetch(`/org/users/${user.user_id}`, { method: 'DELETE' });
              loadSubUsers();
            } catch (e: any) {
              Alert.alert('Fel', e.message);
            }
          },
        },
      ]
    );
  };

  const handleResetPassword = async (user: SubUser) => {
    Alert.alert(
      'Återställ lösenord',
      `Återställ lösenord för ${user.name || user.email}?`,
      [
        { text: 'Avbryt' },
        {
          text: 'Återställ',
          onPress: async () => {
            try {
              const result = await api.fetch(`/org/users/${user.user_id}/reset-password`, { method: 'POST' });
              Alert.alert('Klart', `Nytt lösenord: ${result.temp_password}\n\nSpara detta lösenord!`);
            } catch (e: any) {
              Alert.alert('Fel', e.message);
            }
          },
        },
      ]
    );
  };

  const handleResendInvite = async (user: SubUser) => {
    try {
      await api.fetch(`/org/users/${user.user_id}/resend-invite`, { method: 'POST' });
      Alert.alert('Klart', 'Välkomstmail skickat!');
    } catch (e: any) {
      Alert.alert('Fel', e.message);
    }
  };

  const handleRegenerateCode = async (user: SubUser) => {
    Alert.alert(
      'Ny inloggningskod',
      'Skapa en ny inloggningskod? Den gamla slutar fungera.',
      [
        { text: 'Avbryt' },
        {
          text: 'Skapa ny',
          onPress: async () => {
            try {
              const result = await api.fetch(`/org/users/${user.user_id}/regenerate-code`, { method: 'POST' });
              Alert.alert('Klart', `Ny kod: ${result.login_code}`);
              loadSubUsers();
            } catch (e: any) {
              Alert.alert('Fel', e.message);
            }
          },
        },
      ]
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
                      onPress={() => handleResendInvite(item)}
                    >
                      <Ionicons name="mail-outline" size={18} color={Colors.info} />
                      {isWide && <Text style={[styles.userActionText, { color: Colors.info }]}>Skicka mail</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.userActionBtn, isWide && styles.userActionBtnWide]}
                      onPress={() => handleRegenerateCode(item)}
                    >
                      <Ionicons name="key-outline" size={18} color={Colors.warning} />
                      {isWide && <Text style={[styles.userActionText, { color: Colors.warning }]}>Ny kod</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.userActionBtn, isWide && styles.userActionBtnWide]}
                      onPress={() => handleResetPassword(item)}
                    >
                      <Ionicons name="lock-closed-outline" size={18} color={Colors.primary} />
                      {isWide && <Text style={[styles.userActionText, { color: Colors.primary }]}>Lösenord</Text>}
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
});
