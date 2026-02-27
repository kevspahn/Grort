import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

interface ReceiptDetail {
  id: string;
  store_name: string;
  receipt_date: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  items: Array<{
    id: string; name_on_receipt: string; product_name: string | null;
    quantity: number; unit_price: number | null; total_price: number; category_name: string | null;
  }>;
}

export default function ReceiptDetailScreen() {
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadReceipt(); }, [receiptId]);

  async function loadReceipt() {
    try { const response = await apiClient.get(`/receipts/${receiptId}`); setReceipt(response.data); }
    catch { Alert.alert('Error', 'Failed to load receipt'); }
    finally { setIsLoading(false); }
  }

  async function handleDelete() {
    Alert.alert('Delete Receipt', 'This will permanently delete this receipt and all items.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`/receipts/${receiptId}`); router.back(); }
        catch { Alert.alert('Error', 'Failed to delete receipt'); }
      }},
    ]);
  }

  if (isLoading || !receipt) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const date = new Date(receipt.receipt_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>Back</Text></TouchableOpacity>
        <Text style={styles.storeName}>{receipt.store_name || 'Unknown Store'}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
      <FlatList data={receipt.items} keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name_on_receipt}</Text>
              {item.product_name && <Text style={styles.productName}>{item.product_name}</Text>}
              {item.category_name && <Text style={styles.category}>{item.category_name}</Text>}
            </View>
            <View style={styles.itemPricing}>
              {item.quantity !== 1 && <Text style={styles.qty}>{item.quantity}x</Text>}
              <Text style={styles.price}>${Number(item.total_price).toFixed(2)}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.totals}>
            {receipt.subtotal != null && <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>${Number(receipt.subtotal).toFixed(2)}</Text></View>}
            {receipt.tax != null && <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax</Text><Text style={styles.totalValue}>${Number(receipt.tax).toFixed(2)}</Text></View>}
            <View style={[styles.totalRow, styles.grandTotal]}><Text style={styles.grandTotalLabel}>Total</Text><Text style={styles.grandTotalValue}>${Number(receipt.total).toFixed(2)}</Text></View>
          </View>
        }
        contentContainerStyle={styles.list}
      />
      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Text style={styles.deleteButtonText}>Delete Receipt</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: colors.primary, padding: spacing.lg, paddingTop: spacing.xl },
  backButton: { marginBottom: spacing.sm },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },
  storeName: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textOnPrimary },
  date: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  list: { padding: spacing.md },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemInfo: { flex: 1, marginRight: spacing.md },
  itemName: { fontSize: fontSize.md, color: colors.text },
  productName: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  category: { fontSize: fontSize.xs, color: colors.primary, marginTop: 2 },
  itemPricing: { alignItems: 'flex-end' },
  qty: { fontSize: fontSize.xs, color: colors.textSecondary },
  price: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  totals: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 2, borderTopColor: colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  totalLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  totalValue: { fontSize: fontSize.md, color: colors.text },
  grandTotal: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  grandTotalLabel: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.text },
  grandTotalValue: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  deleteButton: { margin: spacing.md, padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.error, alignItems: 'center' },
  deleteButtonText: { color: colors.error, fontSize: fontSize.md, fontWeight: '600' },
});
