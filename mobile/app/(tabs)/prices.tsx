import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

interface ProductItem {
  id: string;
  canonicalName: string;
  categoryName: string | null;
  latestPrice: number | null;
  purchaseCount: number;
}

export default function PricesScreen() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [filtered, setFiltered] = useState<ProductItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(useCallback(() => { loadProducts(); }, []));

  async function loadProducts() {
    try {
      const response = await apiClient.get('/products');
      setProducts(response.data);
      setFiltered(response.data);
    } catch {
      // empty
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearch(text: string) {
    setSearch(text);
    if (!text.trim()) {
      setFiltered(products);
    } else {
      const lower = text.toLowerCase();
      setFiltered(products.filter((p) => p.canonicalName.toLowerCase().includes(lower)));
    }
  }

  function handlePress(productId: string) {
    router.push({ pathname: '/(tabs)/product-detail', params: { productId } });
  }

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          value={search}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{products.length === 0 ? 'No products tracked yet' : 'No matching products'}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.productCard} onPress={() => handlePress(item.id)}>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{item.canonicalName}</Text>
                {item.categoryName && <Text style={styles.category}>{item.categoryName}</Text>}
                <Text style={styles.purchaseCount}>Purchased {item.purchaseCount} times</Text>
              </View>
              {item.latestPrice != null && (
                <Text style={styles.price}>${item.latestPrice.toFixed(2)}</Text>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
  searchBar: { padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { backgroundColor: colors.background, borderRadius: 8, padding: spacing.sm, fontSize: fontSize.md, borderWidth: 1, borderColor: colors.border },
  list: { padding: spacing.md, gap: spacing.sm },
  productCard: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  productInfo: { flex: 1, marginRight: spacing.md },
  productName: { fontSize: fontSize.md, fontWeight: '500', color: colors.text },
  category: { fontSize: fontSize.xs, color: colors.primary, marginTop: 2 },
  purchaseCount: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  price: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
});
