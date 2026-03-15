import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Alert, Modal, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/utils/colors';
import { api } from '../src/utils/api';
import { useRouter, useLocalSearchParams } from 'expo-router';

interface ParkedCart {
  id: string;
  name: string;
  items: { product_id: string; name: string; price: number; quantity: number }[];
  total: number;
  created_at: string;
}

export default function ParkedCartsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cartItems?: string; cartTotal?: string }>();
  const [carts, setCarts] = useState<ParkedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSave, setShowSave] = useState(false);
  const [cartName, setCartName] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const currentCartItems = params.cartItems ? JSON.parse(params.cartItems) : [];
  const currentCartTotal = params.cartTotal ? parseFloat(params.cartTotal) : 0;
  const hasCurrentCart = currentCartItems.length > 0;

  const loadCarts = useCallback(async () => {
    try {
      const data = await api.getParkedCarts();
      setCarts(data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCarts(); }, []);

  const handleSaveCart = async () => {
    if (!cartName.trim()) {
      Alert.alert('Fel', 'Ange ett namn för varukorgen');
      return;
    }
    setSaving(true);
    try {
      await api.createParkedCart({
        name: cartName.trim(),
        items: currentCartItems,
        total: currentCartTotal,
      });
      setShowSave(false);
      setCartName('');
      // Navigate back to POS and clear cart by passing empty cart
      router.replace({
        pathname: '/(tabs)/pos',
        params: { clearCart: 'true' },
      });
    } catch (e: any) {
      Alert.alert('Fel', e.message);
    } finally { setSaving(false); }
  };

  const handleDelete = (cart: ParkedCart) => {
    Alert.alert('Radera', `Radera "${cart.name}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Radera', style: 'destructive', onPress: async () => {
          try {
            await api.deleteParkedCart(cart.id);
            loadCarts();
          } catch (e: any) { Alert.alert('Fel', e.message); }
        }
      }
    ]);
  };

  const handleRestore = (cart: ParkedCart) => {
    // Navigate back to POS with these items
    router.replace({
      pathname: '/(tabs)/pos',
      params: { restoreCart: JSON.stringify(cart.items), restoreTotal: String(cart.total), restoreCartId: cart.id },
    });
  };

  const handleSendToDisplay = async (cart: ParkedCart) => {
    try {
      const result = await api.sendParkedCartToDisplay(cart.id);
      Alert.alert('Skickat', result.message || 'Skickad till kundskärm');
      loadCarts();
    } catch (e: any) {
      Alert.alert('Fel', e.message);
    }
  };

  const formatDate = (d: string) => {
    try {
      const date = new Date(d);
      return date.toLocaleDateString('sv-SE') + ' ' + date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Parkerade varukorgar</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Save current cart button */}
      {hasCurrentCart && (
        <TouchableOpacity
          testID="park-current-cart-btn"
          style={styles.saveCurrentBtn}
          onPress={() => setShowSave(true)}
        >
          <Ionicons name="bookmark-outline" size={20} color={Colors.primary} />
          <View style={styles.saveCurrentInfo}>
            <Text style={styles.saveCurrentTitle}>Parkera nuvarande varukorg</Text>
            <Text style={styles.saveCurrentSub}>{currentCartItems.length} artiklar · {currentCartTotal.toFixed(0)} kr</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={carts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="bookmark-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Inga parkerade varukorgar</Text>
              <Text style={styles.emptyText}>Parkera en varukorg från kassan för att spara den till senare</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View testID={`parked-cart-${item.id}`} style={styles.cartCard}>
              <TouchableOpacity
                style={styles.cartHeader}
                onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <View style={styles.cartHeaderLeft}>
                  <View style={styles.cartIcon}>
                    <Ionicons name="cart" size={18} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.cartName}>{item.name}</Text>
                    <Text style={styles.cartMeta}>{item.items.length} artiklar · {formatDate(item.created_at)}</Text>
                  </View>
                </View>
                <View style={styles.cartHeaderRight}>
                  <Text style={styles.cartTotal}>{item.total.toFixed(0)} kr</Text>
                  <Ionicons name={expandedId === item.id ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>

              {expandedId === item.id && (
                <View style={styles.cartExpanded}>
                  {item.items.map((ci, idx) => (
                    <View key={idx} style={styles.cartItemRow}>
                      <Text style={styles.cartItemName}>{ci.quantity}x {ci.name}</Text>
                      <Text style={styles.cartItemPrice}>{(ci.price * ci.quantity).toFixed(0)} kr</Text>
                    </View>
                  ))}

                  <View style={styles.cartActions}>
                    <TouchableOpacity testID={`restore-cart-${item.id}`} style={styles.restoreBtn} onPress={() => handleRestore(item)}>
                      <Ionicons name="arrow-undo" size={16} color={Colors.primary} />
                      <Text style={styles.restoreBtnText}>Återställ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID={`send-display-${item.id}`} style={styles.sendDisplayBtn} onPress={() => handleSendToDisplay(item)}>
                      <Ionicons name="tv-outline" size={16} color={Colors.info} />
                      <Text style={styles.sendDisplayBtnText}>Till skärm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID={`delete-cart-${item.id}`} style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                      <Ionicons name="trash-outline" size={16} color={Colors.destructive} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Save Cart Modal */}
      <Modal visible={showSave} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Parkera varukorg</Text>
            <Text style={styles.modalSub}>{currentCartItems.length} artiklar · {currentCartTotal.toFixed(0)} kr</Text>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Namn</Text>
              <TextInput
                testID="cart-name-input"
                style={styles.modalInput}
                value={cartName}
                onChangeText={setCartName}
                placeholder="T.ex. Bord 3, Kund Anna"
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity testID="cancel-save-btn" style={styles.modalCancelBtn} onPress={() => setShowSave(false)}>
                <Text style={styles.modalCancelText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-save-btn"
                style={[styles.modalSaveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveCart}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={Colors.white} /> : (
                  <Text style={styles.modalSaveText}>Parkera</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  saveCurrentBtn: {
    flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16,
    backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)', gap: 12,
  },
  saveCurrentInfo: { flex: 1 },
  saveCurrentTitle: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  saveCurrentSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  list: { padding: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 4, textAlign: 'center', maxWidth: 260 },
  cartCard: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.border, marginBottom: 12, overflow: 'hidden',
  },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  cartHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cartIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  cartName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  cartMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cartHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartTotal: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  cartExpanded: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  cartItemRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  cartItemName: { fontSize: 14, color: Colors.textSecondary },
  cartItemPrice: { fontSize: 14, color: Colors.textMuted },
  cartActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  restoreBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(34,197,94,0.1)', paddingVertical: 10, borderRadius: 8,
  },
  restoreBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '500' },
  sendDisplayBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(59,130,246,0.1)', paddingVertical: 10, borderRadius: 8,
  },
  sendDisplayBtnText: { color: Colors.info, fontSize: 13, fontWeight: '500' },
  deleteBtn: {
    width: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  modalSub: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  modalInputGroup: { marginTop: 20 },
  modalLabel: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 6 },
  modalInput: {
    height: 48, backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
    color: Colors.textPrimary, fontSize: 16, letterSpacing: 0,
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  modalCancelText: { color: Colors.textSecondary, fontSize: 15 },
  modalSaveBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  modalSaveText: { color: Colors.white, fontSize: 15, fontWeight: '600' },
});
