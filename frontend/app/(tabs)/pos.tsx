import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image,
  ActivityIndicator, Alert, Modal, ScrollView, SafeAreaView, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/utils/colors';
import { api } from '../../src/utils/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useRealtimeSync } from '../../src/hooks/useRealtimeSync';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { commHubWS } from '../../src/services/commHubWebSocket';
import { localStore } from '../../src/utils/localFirstStore';
import { generateOrderQR } from '../../src/utils/swishQR';
import QRCode from 'react-native-qrcode-svg';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';

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
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768; // iPad/tablet breakpoint
  const isDesktop = width >= 1024; // Desktop breakpoint
  const numColumns = isDesktop ? 4 : (isTablet ? 2 : 3); // 4 cols desktop, 2 cols tablet, 3 cols mobile
  const cartMaxHeight = isTablet ? undefined : height * 0.5; // 50% av höjden på mobil
  const params = useLocalSearchParams<{ restoreCart?: string; restoreTotal?: string; restoreCartId?: string; clearCart?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [settings, setSettings] = useState<any>({});
  const [showQR, setShowQR] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [parkedCount, setParkedCount] = useState(0);
  
  // Real-time sync - connect to CommHub WebSocket
  const { isConnected: wsConnected, connectionStatus } = useRealtimeSync();
  // Network status - actual internet connectivity
  const { isConnected: networkConnected } = useNetworkStatus();
  
  // Ref to track retry attempts without causing re-renders
  const retryAttemptsRef = React.useRef(0);

  const loadProducts = useCallback(async () => {
    if (!user?.user_id) {
      console.log('[POS] No user_id, skipping product load');
      setLoading(false);
      return;
    }
    
    const currentAttempt = retryAttemptsRef.current;
    if (currentAttempt > 0) {
      setRetrying(true);
    }
    
    try {
      console.log('[POS] Loading products for user:', user.user_id, currentAttempt > 0 ? `(attempt #${currentAttempt})` : '');
      // Use local-first store - returns cached data instantly, syncs in background
      const data = await localStore.getProducts(user.user_id, true);
      const productList = data || [];
      console.log('[POS] Loaded', productList.length, 'products');
      setProducts(productList);
      
      if (productList.length > 0) {
        // Success! Reset retry counter
        retryAttemptsRef.current = 0;
        setRetryCount(0);
        setRetrying(false);
      } else if (networkConnected && retryAttemptsRef.current < 5) {
        // No products found, schedule retry
        retryAttemptsRef.current += 1;
        setRetryCount(retryAttemptsRef.current);
        const delay = Math.min(3000 * retryAttemptsRef.current, 15000);
        console.log(`[POS] No products, retrying in ${delay/1000}s (attempt ${retryAttemptsRef.current}/5)`);
        setTimeout(() => {
          loadProducts();
        }, delay);
      } else {
        // Max retries reached or no network
        setRetrying(false);
      }
    } catch (e: any) {
      console.error('[POS] Failed to load products:', e.message);
      setProducts([]);
      
      if (networkConnected && retryAttemptsRef.current < 5) {
        retryAttemptsRef.current += 1;
        setRetryCount(retryAttemptsRef.current);
        const delay = Math.min(3000 * retryAttemptsRef.current, 15000);
        console.log(`[POS] Error, retrying in ${delay/1000}s (attempt ${retryAttemptsRef.current}/5)`);
        setTimeout(() => {
          loadProducts();
        }, delay);
      } else {
        setRetrying(false);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.user_id, networkConnected]);

  // Manual retry function
  const handleManualRetry = useCallback(() => {
    retryAttemptsRef.current = 1;
    setRetryCount(1);
    setRetrying(true);
    loadProducts();
  }, [loadProducts]);

  const loadSettings = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      // Use local-first store for settings too
      const data = await localStore.getSettings(user.user_id);
      setSettings(data);
    } catch {}
  }, [user?.user_id]);

  const loadParkedCount = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      // Use local-first store for parked carts
      const carts = await localStore.getParkedCarts(user.user_id);
      setParkedCount(Array.isArray(carts) ? carts.length : 0);
    } catch {
      setParkedCount(0);
    }
  }, [user?.user_id]);

  // Initial load and auto-sync setup
  useEffect(() => {
    if (user?.user_id) {
      loadProducts();
      loadSettings();
      // Start auto-sync every 5 minutes
      localStore.startAutoSync(user.user_id);
    }
    
    return () => {
      localStore.stopAutoSync();
    };
  }, [user?.user_id, loadProducts, loadSettings]);
  
  // Listen for real-time product updates via WebSocket
  useEffect(() => {
    const unsubscribe = commHubWS.onMessage((message) => {
      if (message.type === 'document_changed' && message.collection === 'qr_products') {
        console.log('[POS] Real-time product update:', message.operation, message.document_id);
        // Invalidate cache and reload
        if (user?.user_id) {
          localStore.invalidateCache('products_active', user.user_id);
          loadProducts();
        }
      }
    });
    
    return unsubscribe;
  }, [loadProducts, user?.user_id]);

  // Reload parked count when screen gets focus
  useFocusEffect(
    useCallback(() => {
      loadParkedCount();
    }, [loadParkedCount])
  );

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

  // Handle clearing cart after parking
  useEffect(() => {
    if (params.clearCart === 'true') {
      setCart([]);
    }
  }, [params.clearCart]);

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
    
    // Generate QR data locally (works offline)
    const qrData = generateOrderQR(
      settings.swish_phone || '',
      cartTotal,
      `Order ${Date.now()}`
    );
    
    try {
      const order = await api.createOrder({
        items: cart.map(({ product_id, name, price, quantity }) => ({ product_id, name, price, quantity })),
        total: cartTotal,
        swish_phone: settings.swish_phone || '',
        qr_data: qrData,  // Include QR data in order
      });
      setCurrentOrder({ ...order, qr_data: qrData });
      setShowQR(true);
    } catch (e: any) {
      // Offline mode - create local order with QR code
      const offlineOrder = {
        id: `offline_${Date.now()}`,
        items: cart.map(({ product_id, name, price, quantity }) => ({ product_id, name, price, quantity })),
        total: cartTotal,
        swish_phone: settings.swish_phone || '',
        qr_data: qrData,
        status: 'pending',
        created_at: new Date().toISOString(),
        offline: true,
      };
      setCurrentOrder(offlineOrder);
      setShowQR(true);
      console.log('[POS] Created offline order with QR code');
    }
  };

  const handleConfirmPayment = async () => {
    if (!currentOrder) return;
    
    // Check if this is an offline order
    const isOfflineOrder = currentOrder.offline || currentOrder.id?.startsWith('offline_');
    
    try {
      if (!isOfflineOrder) {
        // Online order - confirm via API
        await api.confirmOrder(currentOrder.id);
      } else {
        // Offline order - save confirmation to sync queue
        console.log('[POS] Confirming offline order:', currentOrder.id);
        await localStore.queueOfflineConfirmation(user?.user_id || '', currentOrder);
      }
      
      setPaymentConfirmed(true);
      setTimeout(() => {
        setShowQR(false);
        setPaymentConfirmed(false);
        setCurrentOrder(null);
        setCart([]);
      }, 2000);
    } catch (e: any) {
      // Even if API fails, treat as offline confirmation
      console.log('[POS] API failed, saving offline confirmation');
      await localStore.queueOfflineConfirmation(user?.user_id || '', currentOrder);
      setPaymentConfirmed(true);
      setTimeout(() => {
        setShowQR(false);
        setPaymentConfirmed(false);
        setCurrentOrder(null);
        setCart([]);
      }, 2000);
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
    
    const orderData = {
      items: cart.map(({ product_id, name, price, quantity }) => ({ product_id, name, price, quantity })),
      total: cartTotal,
      swish_phone: settings.swish_phone || '',
      payment_method: 'cash',
    };
    
    try {
      const order = await api.createOrder(orderData);
      await api.confirmOrder(order.id);
      setCart([]);
      Alert.alert('Betalning mottagen', `${cartTotal.toFixed(0)} kr kontant`);
    } catch (e: any) {
      // Offline mode - create local cash order
      console.log('[POS] Creating offline cash order');
      const offlineOrder = {
        ...orderData,
        id: `offline_cash_${Date.now()}`,
        status: 'paid', // Cash is immediately paid
        created_at: new Date().toISOString(),
        offline: true,
      };
      
      // Queue for sync when online
      await localStore.queueOfflineOrder(user?.user_id || '', offlineOrder);
      
      setCart([]);
      Alert.alert('Betalning mottagen', `${cartTotal.toFixed(0)} kr kontant\n\n(Sparad offline - synkas automatiskt)`);
    }
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity
      testID={`product-card-${item.id}`}
      style={[styles.productCard, { maxWidth: `${100 / numColumns - 2}%` }]}
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
        <Text style={styles.productPrice}>{(item.price || 0).toFixed(0)} kr</Text>
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
            <View style={styles.headerSubtitleRow}>
              <Text style={styles.headerSubtitle}>{products.length} produkter</Text>
              {/* Network status indicator - shows actual internet connectivity */}
              <View style={[styles.syncIndicator, { backgroundColor: networkConnected ? '#22c55e' : '#ef4444' }]}>
                <Ionicons 
                  name={networkConnected ? 'wifi' : 'cloud-offline'} 
                  size={10} 
                  color="#fff" 
                />
              </View>
            </View>
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

      {/* Main Content - Split layout for tablet, stacked for mobile */}
      <View style={[styles.mainContent, isTablet && styles.mainContentTablet]}>
        {/* Product Grid */}
        <View style={[styles.productSection, isTablet && styles.productSectionTablet]}>
          <FlatList
            data={products}
            renderItem={renderProduct}
            keyExtractor={item => item.id}
            numColumns={numColumns}
            key={`grid-${numColumns}`}
            contentContainerStyle={styles.productGrid}
            columnWrapperStyle={styles.productRow}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {retrying || (retryCount > 0 && retryCount <= 5) ? (
                  <>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.emptyText}>Hämtar produkter...</Text>
                    <Text style={styles.emptySubtext}>Försök {retryCount} av 5</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Inga produkter</Text>
                    <Text style={styles.emptySubtext}>Lägg till produkter i Admin-panelen</Text>
                    {networkConnected && (
                      <TouchableOpacity 
                        style={styles.retryBtn} 
                        onPress={handleManualRetry}
                      >
                        <Ionicons name="refresh" size={16} color={Colors.primary} />
                        <Text style={styles.retryBtnText}>Försök igen</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            }
          />
        </View>

        {/* Cart Panel - Shows at bottom on mobile, grows upward as items added */}
        {(isTablet || cart.length > 0) && (
          <View style={[styles.cartSection, isTablet && styles.cartSectionTablet, !isTablet && { maxHeight: cartMaxHeight }]}>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>Kundkorg</Text>
              <View style={styles.cartHeaderActions}>
                {cart.length > 0 && (
                  <>
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
                  </>
                )}
              </View>
            </View>

            {cart.length > 0 ? (
              <>
                <View style={isTablet ? { flex: 1 } : { minHeight: Math.min(cart.length * 44, 130), maxHeight: 130 }}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                    {[...cart].reverse().map(item => (
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
                </View>

                <View style={styles.cartFooter}>
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
                      <Text style={styles.cashButtonText}>Kontant</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyCartText}>Varukorgen är tom</Text>
                <Text style={styles.emptyCartSubtext}>Tryck för att lägga till</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* QR Payment Modal */}
      <Modal visible={showQR} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.qrModal}>
            {paymentConfirmed ? (
              <View style={styles.paymentSuccess}>
                <Ionicons name="checkmark-circle" size={80} color={Colors.primary} />
                <Text style={styles.successTitle}>Betalningen är{'\n'}mottagen!</Text>
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
  headerSubtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  syncIndicator: { 
    width: 18, 
    height: 18, 
    borderRadius: 9, 
    alignItems: 'center', 
    justifyContent: 'center',
  },
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
  // Main content layout
  mainContent: { flex: 1 },
  mainContentTablet: { flexDirection: 'row' },
  productSection: { flex: 1 },
  productSectionTablet: { flex: 2 }, // 60% av bredden
  productGrid: { padding: 8 },
  productRow: { gap: 8, paddingHorizontal: 8 },
  productCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 8,
  },
  productImage: { width: '100%', aspectRatio: 1, backgroundColor: Colors.surfaceHighlight },
  productInfo: { padding: 8 },
  productName: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  productPrice: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginTop: 12 },
  emptySubtext: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
    backgroundColor: 'rgba(34,197,94,0.1)', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
  },
  retryBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '500' },
  // Cart section
  cartSection: {
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
  },
  cartSectionTablet: {
    flex: 1, maxHeight: 'auto', height: '100%',
    borderTopWidth: 0, borderLeftWidth: 1, borderLeftColor: Colors.border,
    paddingHorizontal: 24, paddingTop: 20,
  },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cartTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  cartHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  parkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  parkBtnText: { color: Colors.warning, fontSize: 13, fontWeight: '500' },
  clearCartText: { fontSize: 14, color: Colors.destructive },
  cartItems: { flex: 1 },
  cartItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  cartItemPrice: { fontSize: 13, color: Colors.textSecondary },
  cartItemControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center', alignItems: 'center',
  },
  qtyText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, minWidth: 20, textAlign: 'center' },
  removeBtn: { padding: 4, marginLeft: 2 },
  cartFooter: { marginTop: 'auto' },
  cartTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, borderTopWidth: 2, borderTopColor: Colors.border, marginTop: 12,
  },
  totalLabel: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  totalAmount: { fontSize: 32, fontWeight: '700', color: Colors.primary },
  paymentButtons: { flexDirection: 'row', gap: 12, marginTop: 12 },
  swishButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.swishBrand, height: 56, borderRadius: 12, gap: 8,
  },
  swishButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  cashButton: {
    paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceHighlight, height: 56, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  cashButtonText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  // Empty cart state
  emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyCartText: { fontSize: 16, color: Colors.textMuted, marginTop: 12 },
  emptyCartSubtext: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
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
  successTitle: { fontSize: 24, fontWeight: '700', color: Colors.primary, marginTop: 16, textAlign: 'center' },
  successAmount: { fontSize: 36, fontWeight: '700', color: Colors.textPrimary, marginTop: 8 },
});
