import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

const screenWidth = Dimensions.get('window').width - spacing.md * 2;

const STORE_COLORS = ['#2E7D32', '#1565C0', '#FF6F00', '#6A1B9A', '#C62828', '#00838F'];

interface PriceDataPoint {
  date: string;
  price: number;
  storeId: string;
  storeName: string;
}

interface StoreComparison {
  storeId: string;
  storeName: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  dataPoints: number;
}

export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const [priceHistory, setPriceHistory] = useState<{ productName: string; dataPoints: PriceDataPoint[] } | null>(null);
  const [comparison, setComparison] = useState<StoreComparison[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cheapestStoreId, setCheapestStoreId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [productId]);

  async function loadData() {
    try {
      const [historyRes, compRes] = await Promise.all([
        apiClient.get(`/analytics/price-history/${productId}`),
        apiClient.get(`/analytics/store-comparison?productIds=${productId}`),
      ]);
      setPriceHistory(historyRes.data);
      if (compRes.data.comparisons?.[0]) {
        setComparison(compRes.data.comparisons[0].stores);
        setCheapestStoreId(compRes.data.comparisons[0].cheapestStoreId);
      }
    } catch {
      // empty
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!priceHistory) return <View style={styles.centered}><Text>No price data</Text></View>;

  // Build chart data -- group by store
  const storeMap = new Map<string, { name: string; prices: number[]; dates: string[] }>();
  priceHistory.dataPoints.forEach((dp) => {
    if (!storeMap.has(dp.storeId)) {
      storeMap.set(dp.storeId, { name: dp.storeName, prices: [], dates: [] });
    }
    const store = storeMap.get(dp.storeId)!;
    store.prices.push(dp.price);
    store.dates.push(dp.date);
  });

  const allDates = priceHistory.dataPoints.map((dp) => {
    const d = new Date(dp.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = Array.from(storeMap.entries()).map(([, store], i) => ({
    data: store.prices,
    color: () => STORE_COLORS[i % STORE_COLORS.length],
    strokeWidth: 2,
  }));

  const chartData = {
    labels: allDates.length > 6 ? allDates.filter((_, i) => i % Math.ceil(allDates.length / 6) === 0) : allDates,
    datasets: datasets.length > 0 ? datasets : [{ data: [0] }],
    legend: Array.from(storeMap.values()).map((s) => s.name),
  };

  const chartConfig = {
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
    labelColor: () => colors.textSecondary,
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.productName}>{priceHistory.productName}</Text>
        <Text style={styles.dataPointCount}>{priceHistory.dataPoints.length} price records</Text>
      </View>

      {/* Price History Chart */}
      {priceHistory.dataPoints.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Price History</Text>
          <LineChart data={chartData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} yAxisLabel="$" bezier style={styles.chart} />
        </View>
      )}

      {/* Store Comparison */}
      {comparison.length > 0 && (
        <View style={styles.comparisonCard}>
          <Text style={styles.chartTitle}>Store Comparison</Text>
          {comparison.map((store, i) => (
            <View key={store.storeId} style={[styles.storeRow, store.storeId === cheapestStoreId && styles.cheapestRow]}>
              <View style={[styles.storeColorDot, { backgroundColor: STORE_COLORS[i % STORE_COLORS.length] }]} />
              <View style={styles.storeInfo}>
                <Text style={styles.storeName}>
                  {store.storeName}
                  {store.storeId === cheapestStoreId && ' (Cheapest)'}
                </Text>
                <Text style={styles.storeStats}>
                  {store.dataPoints} purchases | Range: ${store.minPrice.toFixed(2)} - ${store.maxPrice.toFixed(2)}
                </Text>
              </View>
              <Text style={[styles.avgPrice, store.storeId === cheapestStoreId && styles.cheapestPrice]}>
                ${store.avgPrice.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: colors.primary, padding: spacing.lg },
  productName: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textOnPrimary },
  dataPointCount: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  chartCard: { backgroundColor: colors.surface, margin: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  chartTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  chart: { borderRadius: 8 },
  comparisonCard: { backgroundColor: colors.surface, margin: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  storeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  cheapestRow: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: spacing.sm },
  storeColorDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.sm },
  storeInfo: { flex: 1 },
  storeName: { fontSize: fontSize.md, fontWeight: '500', color: colors.text },
  storeStats: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  avgPrice: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.text },
  cheapestPrice: { color: colors.primary },
});
