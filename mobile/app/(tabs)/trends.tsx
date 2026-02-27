import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BarChart, PieChart, LineChart } from 'react-native-chart-kit';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

const screenWidth = Dimensions.get('window').width - spacing.md * 2;

interface SpendingData {
  totalSpent: number;
  periodBreakdown: Array<{ period: string; total: number }>;
  categoryBreakdown: Array<{ categoryId: string | null; categoryName: string; total: number; percentage: number }>;
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

  useFocusEffect(useCallback(() => { loadData(); }, [period, scope]));

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
  if (!data) return <View style={styles.centered}><Text style={styles.emptyText}>No spending data yet</Text></View>;

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
          <BarChart data={barData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} yAxisLabel="$" yAxisSuffix="" fromZero style={styles.chart} />
        </View>
      )}

      {/* Pie chart */}
      {pieData.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Spending by Category</Text>
          <PieChart data={pieData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} accessor="amount" backgroundColor="transparent" paddingLeft="15" />
        </View>
      )}

      {/* Line chart */}
      {lineData.datasets[0].data.length > 1 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Spending Over Time</Text>
          <LineChart data={lineData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} yAxisLabel="$" bezier style={styles.chart} />
        </View>
      )}
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
});
