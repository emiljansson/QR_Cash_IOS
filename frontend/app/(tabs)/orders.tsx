import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, SafeAreaView, RefreshControl, Modal, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/utils/colors';
import { api } from '../../src/utils/api';

interface Order {
  id: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  status: string;
  created_at: string;
  customer_email?: string;
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [receiptModal, setReceiptModal] = useState<Order | null>(null);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api.getOrders(filter || undefined);
      setOrders(data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  const onRefresh = () => { setRefreshing(true); loadOrders(); };

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return Colors.primary;
      case 'pending': return '#f59e0b';
      case 'cancelled': return Colors.destructive;
      default: return Colors.textMuted;
    }
  };

  const statusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Betald';
      case 'pending': return 'Väntande';
      case 'cancelled': return 'Avbruten';
      default: return status;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  const handleSendReceipt = async () => {
    if (!receiptModal || !receiptEmail.trim()) return;
    setSendingReceipt(true);
    try {
      await api.sendReceipt(receiptModal.id, receiptEmail.trim());
      Alert.alert('Skickat!', `Kvitto skickat till ${receiptEmail.trim()}`);
      setReceiptModal(null);
      setReceiptEmail('');
      loadOrders();
    } catch (e: any) {
      Alert.alert('Fel', e.message || 'Kunde inte skicka kvitto');
    } finally { setSendingReceipt(false); }
  };

  const handleDeleteOrder = (order: Order) => {
    Alert.alert('Radera order', `Radera order #${order.id.substring(0, 8)}?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Radera', style: 'destructive', onPress: async () => {
          try { await api.deleteOrder(order.id); loadOrders(); }
          catch (e: any) { Alert.alert('Fel', e.message); }
        }
      }
    ]);
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const isExpanded = expandedId === item.id;
    return (
      <View testID={`order-row-${item.id}`} style={styles.orderCard}>
        <TouchableOpacity style={styles.orderHeader} onPress={() => setExpandedId(isExpanded ? null : item.id)}>
          <View style={styles.orderHeaderLeft}>
            <Text style={styles.orderId}>#{item.id.substring(0, 8)}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={styles.orderHeaderRight}>
            <Text style={styles.orderTotal}>{item.total.toFixed(0)} kr</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{statusText(item.status)}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.orderExpanded}>
            {item.items.map((oi, idx) => (
              <View key={idx} style={styles.orderItemRow}>
                <Text style={styles.orderItemName}>{oi.quantity}x {oi.name}</Text>
                <Text style={styles.orderItemPrice}>{(oi.price * oi.quantity).toFixed(0)} kr</Text>
              </View>
            ))}
            {item.customer_email && (
              <View style={styles.emailSent}>
                <Ionicons name="mail" size={14} color={Colors.primary} />
                <Text style={styles.emailSentText}>Kvitto skickat till {item.customer_email}</Text>
              </View>
            )}
            <View style={styles.orderActions}>
              <TouchableOpacity
                testID={`send-receipt-${item.id}`}
                style={styles.receiptBtn}
                onPress={() => { setReceiptModal(item); setReceiptEmail(item.customer_email || ''); }}
              >
                <Ionicons name="mail-outline" size={16} color={Colors.info} />
                <Text style={styles.receiptBtnText}>Kvitto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`delete-order-${item.id}`}
                style={styles.deleteOrderBtn}
                onPress={() => handleDeleteOrder(item)}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.destructive} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Orderhistorik</Text>
        <Text style={styles.subtitle}>{orders.length} ordrar</Text>
      </View>

      <View style={styles.filters}>
        {[
          { key: '', label: 'Alla' },
          { key: 'paid', label: 'Betalda' },
          { key: 'pending', label: 'Väntande' },
        ].map(f => (
          <TouchableOpacity
            key={f.key}
            testID={`order-filter-${f.key || 'all'}`}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Inga ordrar</Text>
            </View>
          }
        />
      )}

      {/* Email Receipt Modal */}
      <Modal visible={!!receiptModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Skicka kvitto</Text>
            {receiptModal && (
              <Text style={styles.modalSub}>Order #{receiptModal.id.substring(0, 8)} · {receiptModal.total.toFixed(0)} kr</Text>
            )}

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>E-postadress</Text>
              <View style={styles.modalInputRow}>
                <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
                <TextInput
                  testID="receipt-email-input"
                  style={styles.modalInput}
                  value={receiptEmail}
                  onChangeText={setReceiptEmail}
                  placeholder="kund@email.se"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setReceiptModal(null)}>
                <Text style={styles.modalCancelText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="send-receipt-submit-btn"
                style={[styles.modalSendBtn, (sendingReceipt || !receiptEmail.trim()) && { opacity: 0.5 }]}
                onPress={handleSendReceipt}
                disabled={sendingReceipt || !receiptEmail.trim()}
              >
                {sendingReceipt ? <ActivityIndicator color={Colors.white} /> : (
                  <>
                    <Ionicons name="send" size={16} color={Colors.white} />
                    <Text style={styles.modalSendText}>Skicka</Text>
                  </>
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
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  filters: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: Colors.white, fontWeight: '600' },
  list: { padding: 16 },
  orderCard: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12, overflow: 'hidden',
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  orderHeaderLeft: {},
  orderId: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  orderDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  orderHeaderRight: { alignItems: 'flex-end' },
  orderTotal: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, gap: 6, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '500' },
  orderExpanded: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  orderItemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  orderItemName: { fontSize: 14, color: Colors.textSecondary },
  orderItemPrice: { fontSize: 14, color: Colors.textMuted },
  emailSent: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    backgroundColor: 'rgba(34,197,94,0.08)', padding: 8, borderRadius: 6,
  },
  emailSentText: { fontSize: 12, color: Colors.primary },
  orderActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  receiptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(59,130,246,0.1)', paddingVertical: 10, borderRadius: 8,
  },
  receiptBtnText: { color: '#3b82f6', fontSize: 13, fontWeight: '500' },
  deleteOrderBtn: {
    width: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted, marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  modalSub: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  modalInputGroup: { marginTop: 20 },
  modalLabel: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 6 },
  modalInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
  },
  modalInput: { flex: 1, height: 48, color: Colors.textPrimary, fontSize: 16 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  modalCancelText: { color: Colors.textSecondary, fontSize: 15 },
  modalSendBtn: {
    flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#3b82f6', flexDirection: 'row', gap: 6,
  },
  modalSendText: { color: Colors.white, fontSize: 15, fontWeight: '600' },
});
