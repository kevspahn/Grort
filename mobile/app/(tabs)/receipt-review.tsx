import React, { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

interface ReviewItem {
  id: string;
  nameOnReceipt: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  productName: string | null;
  categoryName: string | null;
  matchConfidence: 'exact' | 'near' | 'new';
  isEditing?: boolean;
  editedName?: string;
  editedPrice?: string;
}

export default function ReceiptReviewScreen() {
  const params = useLocalSearchParams<{ receiptData: string }>();
  const receiptData = JSON.parse(params.receiptData || '{}');

  const [items, setItems] = useState<ReviewItem[]>(
    (receiptData.items || []).map((item: any) => ({
      ...item, isEditing: false, editedName: item.nameOnReceipt, editedPrice: String(item.totalPrice),
    }))
  );

  const receiptId = receiptData.id;
  const storeId = receiptData.storeId;
  const [storeName, setStoreName] = useState<string>(receiptData.storeName || '');
  const [isEditingStore, setIsEditingStore] = useState<boolean>(!!receiptData.needsStoreName);
  const total = receiptData.total;
  const receiptDate = receiptData.receiptDate;

  async function saveStoreName() {
    if (!storeName.trim()) return;
    try {
      await apiClient.put(`/stores/${storeId}`, { name: storeName.trim() });
      setIsEditingStore(false);
    } catch {
      if (Platform.OS === 'web') { window.alert('Failed to save store name'); }
      else { Alert.alert('Error', 'Failed to save store name'); }
    }
  }

  function toggleEdit(index: number) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, isEditing: !item.isEditing } : item));
  }

  function updateItem(index: number, field: string, value: string) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  async function saveEdits(index: number) {
    const item = items[index];
    try {
      await apiClient.put(`/receipts/${receiptId}/items/${item.id}`, {
        nameOnReceipt: item.editedName,
        totalPrice: parseFloat(item.editedPrice || '0'),
      });
      setItems((prev) => prev.map((it, i) => i === index ? { ...it, nameOnReceipt: it.editedName || it.nameOnReceipt, totalPrice: parseFloat(it.editedPrice || '0'), isEditing: false } : it));
    } catch {
      if (Platform.OS === 'web') { window.alert('Failed to save changes'); }
      else { Alert.alert('Error', 'Failed to save changes'); }
    }
  }

  function getConfidenceBadge(confidence: string) {
    switch (confidence) {
      case 'exact': return { text: 'Matched', color: colors.success };
      case 'near': return { text: 'Review', color: colors.secondary };
      case 'new': return { text: 'New', color: colors.primary };
      default: return { text: '', color: colors.textSecondary };
    }
  }

  function renderItem({ item, index }: { item: ReviewItem; index: number }) {
    const badge = getConfidenceBadge(item.matchConfidence);
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={[styles.badge, { backgroundColor: badge.color }]}>
            <Text style={styles.badgeText}>{badge.text}</Text>
          </View>
          <TouchableOpacity onPress={() => toggleEdit(index)}>
            <Text style={styles.editButton}>{item.isEditing ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
        {item.isEditing ? (
          <View style={styles.editForm}>
            <TextInput style={styles.editInput} value={item.editedName} onChangeText={(v) => updateItem(index, 'editedName', v)} placeholder="Item name" />
            <TextInput style={[styles.editInput, styles.priceInput]} value={item.editedPrice} onChangeText={(v) => updateItem(index, 'editedPrice', v)} placeholder="Price" keyboardType="decimal-pad" />
            <TouchableOpacity style={styles.saveButton} onPress={() => saveEdits(index)}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.itemName}>{item.nameOnReceipt}</Text>
            {item.productName && item.productName !== item.nameOnReceipt && <Text style={styles.productName}>{item.productName}</Text>}
            <View style={styles.itemFooter}>
              <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
              <Text style={styles.itemPrice}>${item.totalPrice.toFixed(2)}</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {isEditingStore ? (
          <View>
            <Text style={styles.storePrompt}>Store name couldn't be read from the receipt. Please enter it:</Text>
            <View style={styles.storeEditRow}>
              <TextInput
                style={styles.storeInput}
                value={storeName}
                onChangeText={setStoreName}
                placeholder="Enter store name"
                placeholderTextColor="rgba(255,255,255,0.5)"
                autoFocus
              />
              <TouchableOpacity style={styles.storeSaveButton} onPress={saveStoreName}>
                <Text style={styles.storeSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditingStore(true)}>
            <Text style={styles.storeName}>{storeName}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.date}>{receiptDate}</Text>
        <Text style={styles.total}>Total: ${total?.toFixed(2)}</Text>
      </View>
      <Text style={styles.sectionTitle}>{items.length} items extracted</Text>
      <FlatList data={items} renderItem={renderItem} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} />
      <TouchableOpacity style={styles.doneButton} onPress={() => router.replace('/(tabs)/receipts')}>
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, padding: spacing.lg, paddingTop: spacing.xl },
  storeName: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textOnPrimary, textDecorationLine: 'underline' },
  storePrompt: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.9)', marginBottom: spacing.sm },
  storeEditRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  storeInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: spacing.sm, fontSize: fontSize.lg, color: colors.textOnPrimary, fontWeight: 'bold' },
  storeSaveButton: { backgroundColor: 'rgba(255,255,255,0.3)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 6 },
  storeSaveText: { color: colors.textOnPrimary, fontWeight: 'bold' },
  date: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  total: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.textOnPrimary, marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, padding: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
  itemCard: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#FFF', fontSize: fontSize.xs, fontWeight: 'bold' },
  editButton: { color: colors.primary, fontSize: fontSize.sm },
  itemName: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  productName: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  itemQty: { color: colors.textSecondary, fontSize: fontSize.sm },
  itemPrice: { color: colors.text, fontSize: fontSize.md, fontWeight: 'bold' },
  editForm: { gap: spacing.sm },
  editInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm, fontSize: fontSize.sm },
  priceInput: { width: 120 },
  saveButton: { backgroundColor: colors.primary, padding: spacing.sm, borderRadius: 6, alignItems: 'center' },
  saveButtonText: { color: colors.textOnPrimary, fontWeight: 'bold' },
  doneButton: { backgroundColor: colors.primary, margin: spacing.md, padding: spacing.md, borderRadius: 8, alignItems: 'center' },
  doneButtonText: { color: colors.textOnPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
});
