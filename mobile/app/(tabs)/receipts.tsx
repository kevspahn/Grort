import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';
import { GrortMascot } from '../../src/components/GrortMascot';

interface ReceiptSummary {
  id: string;
  store_name: string;
  receipt_date: string;
  total: number;
  item_count: number;
}

export default function ReceiptsScreen() {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useFocusEffect(useCallback(() => { loadReceipts(1); }, []));

  async function loadReceipts(pageNum: number, append = false) {
    try {
      const response = await apiClient.get(`/receipts?page=${pageNum}&limit=20`);
      if (append) { setReceipts((prev) => [...prev, ...response.data.items]); }
      else { setReceipts(response.data.items); }
      setPage(pageNum);
      setTotalPages(response.data.totalPages);
    } catch (err) {
      Alert.alert('Error', 'Failed to load receipts');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  function handleRefresh() { setIsRefreshing(true); loadReceipts(1); }
  function handleLoadMore() { if (page < totalPages) loadReceipts(page + 1, true); }
  function handlePress(receiptId: string) { router.push({ pathname: '/(tabs)/receipt-detail', params: { receiptId } }); }

  async function handleDelete(receiptId: string) {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete this receipt?')) return;
      try { await apiClient.delete(`/receipts/${receiptId}`); setReceipts((prev) => prev.filter((r) => r.id !== receiptId)); }
      catch { window.alert('Failed to delete receipt'); }
    } else {
      Alert.alert('Delete Receipt', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await apiClient.delete(`/receipts/${receiptId}`); setReceipts((prev) => prev.filter((r) => r.id !== receiptId)); }
          catch { Alert.alert('Error', 'Failed to delete receipt'); }
        }},
      ]);
    }
  }

  function renderReceipt({ item }: { item: ReceiptSummary }) {
    const date = new Date(item.receipt_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return (
      <TouchableOpacity style={styles.receiptCard} onPress={() => handlePress(item.id)} onLongPress={() => handleDelete(item.id)}>
        <View style={styles.receiptLeft}>
          <Text style={styles.storeName}>{item.store_name || 'Unknown Store'}</Text>
          <Text style={styles.date}>{date}</Text>
          <Text style={styles.itemCount}>{item.item_count} items</Text>
        </View>
        <Text style={styles.total}>${Number(item.total).toFixed(2)}</Text>
      </TouchableOpacity>
    );
  }

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (receipts.length === 0) return <View style={styles.centered}><GrortMascot receiptCount={0} size={100} /><Text style={styles.emptyText}>No receipts yet</Text><Text style={styles.emptySubtext}>Scan a receipt to get started!</Text></View>;

  return (
    <FlatList
      style={styles.container} data={receipts} renderItem={renderReceipt} keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      onEndReached={handleLoadMore} onEndReachedThreshold={0.5} contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  receiptCard: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  receiptLeft: { flex: 1 },
  storeName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  date: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  itemCount: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  total: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  emptyText: { fontSize: fontSize.lg, color: colors.textSecondary },
  emptySubtext: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
});
