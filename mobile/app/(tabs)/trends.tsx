import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions, Platform,
  Modal, FlatList, Pressable,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { BarChart, PieChart, LineChart } from 'react-native-chart-kit';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';
import { GrortMascot } from '../../src/components/GrortMascot';

const screenWidth = Dimensions.get('window').width - spacing.md * 2;

interface SpendingData {
  totalSpent: number;
  periodBreakdown: Array<{ period: string; total: number }>;
  categoryBreakdown: Array<{ categoryId: string | null; categoryName: string; total: number; percentage: number }>;
}

interface CategoryItem {
  name: string;
  productId: string | null;
  productName: string | null;
  totalQuantity: number;
  totalCost: number;
  purchaseCount: number;
}

interface PeriodReceipt {
  id: string;
  store_name: string;
  receipt_date: string;
  total: number;
  item_count: number;
}

const PERIOD_COLORS = [
  '#2E7D32', '#FF6F00', '#1565C0', '#6A1B9A', '#C62828',
  '#00838F', '#4E342E', '#283593', '#558B2F', '#E65100',
];

export default function TrendsScreen() {
  const [data, setData] = useState<SpendingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [scope, setScope] = useState<'personal' | 'household'>('household');
  const [categoryModal, setCategoryModal] = useState<{ name: string; items: CategoryItem[] } | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [periodModal, setPeriodModal] = useState<{ label: string; receipts: PeriodReceipt[] } | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  useFocusEffect(useCallback(() => { loadData(); }, [period, scope]));

  async function loadCategoryItems(categoryId: string | null, categoryName: string) {
    setCategoryLoading(true);
    setCategoryModal({ name: categoryName, items: [] });
    try {
      const params = new URLSearchParams({ scope });
      if (categoryId) params.set('categoryId', categoryId);
      const response = await apiClient.get(`/analytics/category-items?${params}`);
      setCategoryModal({ name: categoryName, items: response.data });
    } catch {
      setCategoryModal(null);
    } finally {
      setCategoryLoading(false);
    }
  }

  async function loadPeriodReceipts(periodStart: string, label: string) {
    setPeriodLoading(true);
    setPeriodModal({ label, receipts: [] });
    try {
      const start = new Date(periodStart);
      let end: Date;
      if (period === 'month') {
        end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      } else {
        end = new Date(start);
        end.setDate(end.getDate() + 6);
      }
      const startDate = start.toISOString().split('T')[0];
      const endDate = end.toISOString().split('T')[0];
      const response = await apiClient.get(`/receipts?startDate=${startDate}&endDate=${endDate}&limit=100`);
      setPeriodModal({ label, receipts: response.data.items });
    } catch {
      setPeriodModal(null);
    } finally {
      setPeriodLoading(false);
    }
  }

  async function loadData() {
    setIsLoading(true);
    try {
      const response = await apiClient.get(`/analytics/spending?period=${period}&scope=${scope}`);
      setData(response.data);
    } catch (err) {
      // Silently fail -- show empty state
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!data) return <View style={styles.centered}><GrortMascot receiptCount={0} size={100} /><Text style={styles.emptyText}>No spending data yet</Text></View>;

  const barData = {
    labels: data.periodBreakdown.slice(-6).map((p) => {
      const d = new Date(p.period);
      return period === 'month' ? d.toLocaleString('default', { month: 'short' }) : `Wk ${d.getDate()}`;
    }),
    datasets: [{ data: data.periodBreakdown.slice(-6).map((p) => p.total) }],
  };

  const pieData = data.categoryBreakdown.slice(0, 8).map((cat, i) => ({
    name: cat.categoryName,
    amount: cat.total,
    color: PERIOD_COLORS[i % PERIOD_COLORS.length],
    legendFontColor: colors.text,
    legendFontSize: 12,
  }));

  const lineData = {
    labels: data.periodBreakdown.slice(-12).map((p) => {
      const d = new Date(p.period);
      return d.toLocaleString('default', { month: 'short' });
    }),
    datasets: [{ data: data.periodBreakdown.slice(-12).map((p) => p.total).length > 0 ? data.periodBreakdown.slice(-12).map((p) => p.total) : [0] }],
  };

  const chartConfig = {
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
    labelColor: () => colors.textSecondary,
    propsForLabels: { fontSize: 10 },
  };

  return (
    <ScrollView style={styles.container}>
      {/* Toggle controls */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleGroup}>
          <TouchableOpacity style={[styles.toggle, period === 'week' && styles.toggleActive]} onPress={() => setPeriod('week')}>
            <Text style={[styles.toggleText, period === 'week' && styles.toggleTextActive]}>Weekly</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggle, period === 'month' && styles.toggleActive]} onPress={() => setPeriod('month')}>
            <Text style={[styles.toggleText, period === 'month' && styles.toggleTextActive]}>Monthly</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toggleGroup}>
          <TouchableOpacity style={[styles.toggle, scope === 'personal' && styles.toggleActive]} onPress={() => setScope('personal')}>
            <Text style={[styles.toggleText, scope === 'personal' && styles.toggleTextActive]}>Personal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggle, scope === 'household' && styles.toggleActive]} onPress={() => setScope('household')}>
            <Text style={[styles.toggleText, scope === 'household' && styles.toggleTextActive]}>Household</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Total */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Spent</Text>
        <Text style={styles.totalAmount}>${data.totalSpent.toFixed(2)}</Text>
      </View>

      {/* Bar chart */}
      {barData.datasets[0].data.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Spending by {period === 'month' ? 'Month' : 'Week'}</Text>
          {Platform.OS === 'web' ? (
            <View style={styles.listBlock}>
              {data.periodBreakdown.slice(-6).map((entry) => (
                <TouchableOpacity key={entry.period} style={styles.row} onPress={() => loadPeriodReceipts(entry.period, entry.period)}>
                  <Text style={styles.rowLabel}>{entry.period}</Text>
                  <Text style={styles.rowValue}>${entry.total.toFixed(2)} ›</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View>
              <BarChart data={barData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} yAxisLabel="$" yAxisSuffix="" fromZero style={styles.chart} />
              <View style={styles.listBlock}>
                {data.periodBreakdown.slice(-6).map((entry) => (
                  <TouchableOpacity key={`bar-${entry.period}`} style={styles.row} onPress={() => loadPeriodReceipts(entry.period, entry.period)}>
                    <Text style={styles.rowLabel}>{entry.period}</Text>
                    <Text style={styles.rowValue}>${entry.total.toFixed(2)} ›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Pie chart / Category breakdown */}
      {pieData.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Spending by Category</Text>
          {Platform.OS === 'web' ? (
            <View style={styles.listBlock}>
              {data.categoryBreakdown.slice(0, 8).map((entry) => (
                <TouchableOpacity key={`${entry.categoryId ?? 'none'}-${entry.categoryName}`} style={styles.row} onPress={() => loadCategoryItems(entry.categoryId, entry.categoryName)}>
                  <Text style={styles.rowLabel}>{entry.categoryName}</Text>
                  <Text style={styles.rowValue}>${entry.total.toFixed(2)} ({entry.percentage.toFixed(0)}%) ›</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View>
              <PieChart data={pieData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} accessor="amount" backgroundColor="transparent" paddingLeft="15" />
              <View style={styles.listBlock}>
                {data.categoryBreakdown.slice(0, 8).map((entry) => (
                  <TouchableOpacity key={`${entry.categoryId ?? 'none'}-${entry.categoryName}-tap`} style={styles.row} onPress={() => loadCategoryItems(entry.categoryId, entry.categoryName)}>
                    <Text style={styles.rowLabel}>{entry.categoryName}</Text>
                    <Text style={styles.rowValue}>${entry.total.toFixed(2)} ›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Line chart */}
      {lineData.datasets[0].data.length > 1 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Spending Over Time</Text>
          {Platform.OS === 'web' ? (
            <View style={styles.listBlock}>
              {data.periodBreakdown.slice(-12).map((entry) => (
                <TouchableOpacity key={`timeline-${entry.period}`} style={styles.row} onPress={() => loadPeriodReceipts(entry.period, entry.period)}>
                  <Text style={styles.rowLabel}>{entry.period}</Text>
                  <Text style={styles.rowValue}>${entry.total.toFixed(2)} ›</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View>
              <LineChart data={lineData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} yAxisLabel="$" bezier style={styles.chart} />
              <View style={styles.listBlock}>
                {data.periodBreakdown.slice(-12).map((entry) => (
                  <TouchableOpacity key={`line-${entry.period}`} style={styles.row} onPress={() => loadPeriodReceipts(entry.period, entry.period)}>
                    <Text style={styles.rowLabel}>{entry.period}</Text>
                    <Text style={styles.rowValue}>${entry.total.toFixed(2)} ›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
      {/* Category detail modal */}
      <Modal visible={categoryModal !== null} transparent animationType="slide" onRequestClose={() => setCategoryModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryModal(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{categoryModal?.name}</Text>
              <TouchableOpacity onPress={() => setCategoryModal(null)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {categoryLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ padding: spacing.xl }} />
            ) : (
              <FlatList
                data={categoryModal?.items || []}
                keyExtractor={(item, i) => `${item.name}-${i}`}
                contentContainerStyle={styles.modalList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    disabled={!item.productId}
                    onPress={() => {
                      if (item.productId) {
                        setCategoryModal(null);
                        router.push({ pathname: '/(tabs)/product-detail', params: { productId: item.productId, productName: item.productName || item.name } });
                      }
                    }}
                  >
                    <View style={styles.modalItemLeft}>
                      <Text style={styles.modalItemName}>{item.name}</Text>
                      <Text style={styles.modalItemMeta}>
                        {item.totalQuantity > 1 ? `Qty: ${item.totalQuantity}` : ''}
                        {item.purchaseCount > 1 ? ` · ${item.purchaseCount} purchases` : ''}
                      </Text>
                    </View>
                    <View style={styles.modalItemRight}>
                      <Text style={styles.modalItemCost}>${item.totalCost.toFixed(2)}</Text>
                      {item.productId && <Text style={styles.modalChevron}>›</Text>}
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No items found</Text>}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Period receipts modal */}
      <Modal visible={periodModal !== null} transparent animationType="slide" onRequestClose={() => setPeriodModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPeriodModal(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{periodModal?.label}</Text>
              <TouchableOpacity onPress={() => setPeriodModal(null)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {periodLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ padding: spacing.xl }} />
            ) : (
              <FlatList
                data={periodModal?.receipts || []}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.modalList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setPeriodModal(null);
                      router.push({ pathname: '/(tabs)/receipt-detail', params: { receiptId: item.id } });
                    }}
                  >
                    <View style={styles.modalItemLeft}>
                      <Text style={styles.modalItemName}>{item.store_name || 'Unknown Store'}</Text>
                      <Text style={styles.modalItemMeta}>
                        {new Date(item.receipt_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {item.item_count ? ` · ${item.item_count} items` : ''}
                      </Text>
                    </View>
                    <View style={styles.modalItemRight}>
                      <Text style={styles.modalItemCost}>${Number(item.total).toFixed(2)}</Text>
                      <Text style={styles.modalChevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No receipts found</Text>}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  emptyText: { fontSize: fontSize.lg, color: colors.textSecondary },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, gap: spacing.sm },
  toggleGroup: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  toggle: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  toggleActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: fontSize.sm, color: colors.textSecondary },
  toggleTextActive: { color: colors.textOnPrimary, fontWeight: 'bold' },
  totalCard: { backgroundColor: colors.primary, margin: spacing.md, padding: spacing.lg, borderRadius: 12, alignItems: 'center' },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },
  totalAmount: { color: colors.textOnPrimary, fontSize: fontSize.xxl, fontWeight: 'bold', marginTop: spacing.xs },
  chartCard: { backgroundColor: colors.surface, margin: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  chartTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  chart: { borderRadius: 8 },
  listBlock: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { flex: 1, marginRight: spacing.md, color: colors.text, fontSize: fontSize.sm },
  rowValue: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.text },
  modalClose: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  modalList: { padding: spacing.md, gap: spacing.sm },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalItemLeft: { flex: 1, marginRight: spacing.md },
  modalItemName: { fontSize: fontSize.md, color: colors.text },
  modalItemMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  modalItemRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  modalItemCost: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  modalChevron: { fontSize: fontSize.lg, color: colors.textSecondary },
});
