import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image,
  ActivityIndicator, Alert, Modal, ScrollView, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/utils/colors';
import { api } from '../../src/utils/api';
import { useAuth } from '../../src/contexts/AuthContext';
import QRCode from 'react-native-qrcode-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';

interface Product {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  category?: string;
  active?: boolean;
}

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

export default function POSScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ restoreCart?: string; restoreTotal?: string; restoreCartId?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>({});
  const [showQR, setShowQR] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [parkedCount, setParkedCount] = useState(0);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.getProducts(true);
      setProducts(data);
    } catch (e) {
      // Silent fail - will show empty product list
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch {}
  }, []);

  const loadParkedCount = useCallback(async () => {
    try {
      const carts = await api.getParkedCarts();
      setParkedCount(Array.isArray(carts) ? carts.length : 0);
    } catch {
      setParkedCount(0);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadSettings();
    loadParkedCount();
  }, []);

  // Handle restoring parked cart
  useEffect(() => {
    if (params.restoreCart) {
      try {
        const items = JSON.parse(params.restoreCart);
        setCart(items);
        // Delete the parked cart after restore
        if (params.restoreCartId) {
          api.deleteParkedCart(params.restoreCartId).catch(() => {});
        }
      } catch {}
    }
  }, [params.restoreCart]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        image_url: product.image_url,
      }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.product_id === productId) {
          const newQty = i.quantity + delta;
          return newQty > 0 ? { ...i, quantity: newQty } : i;
        }
        return i;
      }).filter(i => i.quantity > 0);
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product_id !== productId));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    try {
      const order = await api.createOrder({
        items: cart.map(({ product_id, name, price, quantity }) => ({ product_id, name, price, quantity })),
        total: cartTotal,
        swish_phone: settings.swish_phone || '',
      });
      setCurrentOrder(order);
      setShowQR(true);
    } catch (e: any) {
      Alert.alert('Fel', e.message || 'Kunde inte skapa order');
    }
  };

  const handleConfirmPayment = async () => {
    if (!currentOrder) return;
    try {
      await api.confirmOrder(currentOrder.id);
      setPaymentConfirmed(true);
      setTimeout(() => {
        setShowQR(false);
        setPaymentConfirmed(false);
        setCurrentOrder(null);
        setCart([]);
        api.resetCustomerDisplay().catch(() => {});
      }, 2000);
    } catch (e: any) {
      Alert.alert('Fel', e.message);
    }
  };

  const handleCancelOrder = async () => {
    if (!currentOrder) return;
    try {
      await api.cancelOrder(currentOrder.id);
    } catch {}
    setShowQR(false);
    setCurrentOrder(null);
  };

  const handleCashPayment = async () => {
    if (cart.length === 0) return;
    try {
      const order = await api.createOrder({
        items: cart.map(({ product_id, name, price, quantity }) => ({ product_id, name, price, quantity })),
        total: cartTotal,
        swish_phone: settings.swish_phone || '',
      });
      await api.confirmOrder(order.id);
      setCart([]);
      Alert.alert('Betalning mottagen', `${cartTotal.toFixed(2)} kr kontant`);
      setTimeout(() => api.resetCustomerDisplay().catch(() => {}), 3000);
    } catch (e: any) {
      Alert.alert('Fel', e.message);
    }
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity
      testID={`product-card-${item.id}`}
      style={styles.productCard}
      onPress={() => addToCart(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.image_url || 'https://via.placeholder.com/200/27272a/ffffff?text=Produkt' }}
        style={styles.productImage}
        resizeMode={"cover" as any}
      />
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.productPrice}>{item.price.toFixed(0)} kr</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Laddar produkter...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {settings.logo_url ? (
            <Image source={{ uri: settings.logo_url }} style={styles.storeLogo} resizeMode="contain" />
          ) : null}
          <View>
            <Text style={styles.headerTitle}>{settings.store_name || 'Kassa'}</Text>
            <Text style={styles.headerSubtitle}>{products.length} produkter</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity testID="view-parked-carts-btn" onPress={() => router.push('/parked-carts')} style={styles.parkedBtn}>
            <Ionicons name="bookmark-outline" size={18} color={Colors.warning} />
            {parkedCount > 0 && (
              <View style={styles.parkedBadge}>
                <Text style={styles.parkedBadgeText}>{parkedCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity testID="pair-display-btn" onPress={() => router.push('/pair-display')} style={styles.displayBtn}>
            <Ionicons name="tv-outline" size={18} color={Colors.primary} />
            <Text style={styles.displayBtnText}>Skärm</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Product Grid */}
      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={item => item.id}
        numColumns={3}
        contentContainerStyle={styles.productGrid}
        columnWrapperStyle={styles.productRow}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Inga produkter</Text>
            <Text style={styles.emptySubtext}>Lägg till produkter i Admin-panelen</Text>
          </View>
        }
      />

      {/* Cart */}
      {cart.length > 0 && (
        <View style={styles.cartSection}>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>Varukorg ({cart.reduce((s, i) => s + i.quantity, 0)})</Text>
            <View style={styles.cartHeaderActions}>
              <TouchableOpacity
                testID="park-cart-btn"
                onPress={() => router.push({
                  pathname: '/parked-carts',
                  params: { cartItems: JSON.stringify(cart), cartTotal: String(cartTotal) },
                })}
                style={styles.parkBtn}
              >
                <Ionicons name="bookmark-outline" size={16} color={Colors.warning} />
                <Text style={styles.parkBtnText}>Parkera</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="clear-cart-btn" onPress={() => setCart([])}>
                <Text style={styles.clearCartText}>Rensa</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.cartItems} nestedScrollEnabled>
            {cart.map(item => (
              <View key={item.product_id} style={styles.cartItem}>
                <View style={styles.cartItemInfo}>
                  <Text style={styles.cartItemName}>{item.name}</Text>
                  <Text style={styles.cartItemPrice}>{(item.price * item.quantity).toFixed(0)} kr</Text>
                </View>
                <View style={styles.cartItemControls}>
                  <TouchableOpacity
                    testID={`cart-minus-${item.product_id}`}
                    onPress={() => updateQuantity(item.product_id, -1)}
                    style={styles.qtyBtn}
                  >
                    <Ionicons name="remove" size={16} color={Colors.textPrimary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    testID={`cart-plus-${item.product_id}`}
                    onPress={() => updateQuantity(item.product_id, 1)}
                    style={styles.qtyBtn}
                  >
                    <Ionicons name="add" size={16} color={Colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`cart-remove-${item.product_id}`}
                    onPress={() => removeFromCart(item.product_id)}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.cartTotal}>
            <Text style={styles.totalLabel}>Totalt</Text>
            <Text style={styles.totalAmount}>{cartTotal.toFixed(0)} kr</Text>
          </View>

          <View style={styles.paymentButtons}>
            <TouchableOpacity
              testID="swish-pay-btn"
              style={styles.swishButton}
              onPress={handleCheckout}
              activeOpacity={0.8}
            >
              <Ionicons name="qr-code" size={20} color={Colors.white} />
              <Text style={styles.swishButtonText}>Swish QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="cash-pay-btn"
              style={styles.cashButton}
              onPress={handleCashPayment}
              activeOpacity={0.8}
            >
              <Ionicons name="cash-outline" size={20} color={Colors.textPrimary} />
              <Text style={styles.cashButtonText}>Kontant</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* QR Payment Modal */}
      <Modal visible={showQR} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.qrModal}>
            {paymentConfirmed ? (
              <View style={styles.paymentSuccess}>
                <Ionicons name="checkmark-circle" size={80} color={Colors.primary} />
                <Text style={styles.successTitle}>Betalning mottagen!</Text>
                <Text style={styles.successAmount}>{cartTotal.toFixed(0)} kr</Text>
              </View>
            ) : (
              <>
                <Text style={styles.qrTitle}>Swish-betalning</Text>
                <Text style={styles.qrAmount}>{cartTotal.toFixed(0)} kr</Text>

                <View style={styles.qrContainer}>
                  {currentOrder?.qr_data ? (
                    <QRCode value={currentOrder.qr_data} size={200} backgroundColor="white" color="black" />
                  ) : (
                    <ActivityIndicator size="large" color={Colors.primary} />
                  )}
                </View>

                <Text style={styles.qrInstruction}>Skanna QR-koden med Swish-appen</Text>

                <TouchableOpacity
                  testID="confirm-payment-btn"
                  style={styles.confirmBtn}
                  onPress={handleConfirmPayment}
                >
                  <Ionicons name="checkmark" size={20} color={Colors.white} />
                  <Text style={styles.confirmBtnText}>Bekräfta betalning</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="cancel-order-btn"
                  style={styles.cancelBtn}
                  onPress={handleCancelOrder}
                >
                  <Text style={styles.cancelBtnText}>Avbryt</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.textSecondary, marginTop: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeLogo: { width: 40, height: 40, borderRadius: 8 },
  parkedBtn: {
    padding: 8, backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', position: 'relative',
  },
  parkedBadge: {
    position: 'absolute', top: -4, right: -4, backgroundColor: Colors.warning,
    borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: Colors.background,
  },
  parkedBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.white },
  displayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34,197,94,0.1)', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
  },
  displayBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '500' },
  productGrid: { padding: 8 },
  productRow: { gap: 8, paddingHorizontal: 8 },
  productCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 8, maxWidth: '32%',
  },
  productImage: { width: '100%', aspectRatio: 1, backgroundColor: Colors.surfaceHighlight },
  productInfo: { padding: 8 },
  productName: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  productPrice: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginTop: 12 },
  emptySubtext: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  cartSection: {
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, maxHeight: 320,
  },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cartTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  cartHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  parkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  parkBtnText: { color: Colors.warning, fontSize: 13, fontWeight: '500' },
  clearCartText: { fontSize: 14, color: Colors.destructive },
  cartItems: { maxHeight: 120 },
  cartItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 14, color: Colors.textPrimary },
  cartItemPrice: { fontSize: 13, color: Colors.textSecondary },
  cartItemControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 6, backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center', alignItems: 'center',
  },
  qtyText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, minWidth: 20, textAlign: 'center' },
  removeBtn: { padding: 4, marginLeft: 4 },
  cartTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8,
  },
  totalLabel: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  totalAmount: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  paymentButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  swishButton: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.swishBrand, height: 52, borderRadius: 12, gap: 8,
  },
  swishButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  cashButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceHighlight, height: 52, borderRadius: 12, gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  cashButtonText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '500' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center',
  },
  qrModal: {
    backgroundColor: Colors.surface, borderRadius: 24, padding: 32,
    width: '85%', maxWidth: 400, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  qrTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  qrAmount: { fontSize: 36, fontWeight: '700', color: Colors.primary, marginTop: 4 },
  qrContainer: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 24,
    marginVertical: 24, alignItems: 'center', justifyContent: 'center',
  },
  qrInstruction: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  confirmBtn: {
    flexDirection: 'row', backgroundColor: Colors.primary, height: 52, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', width: '100%', gap: 8,
  },
  confirmBtnText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  cancelBtn: { marginTop: 12, padding: 12 },
  cancelBtnText: { color: Colors.textMuted, fontSize: 15 },
  paymentSuccess: { alignItems: 'center', paddingVertical: 20 },
  successTitle: { fontSize: 24, fontWeight: '700', color: Colors.primary, marginTop: 16 },
  successAmount: { fontSize: 36, fontWeight: '700', color: Colors.textPrimary, marginTop: 8 },
});
