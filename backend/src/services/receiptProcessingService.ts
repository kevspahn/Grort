import pool from '../db/pool';
import { getReceiptParser } from '../ai/parserFactory';
import { receiptRepository } from '../repositories/receiptRepository';
import { storeRepository, StoreRow } from '../repositories/storeRepository';
import { productRepository, ProductRow } from '../repositories/productRepository';
import { matchAgainstProducts, normalizeName } from './productMatchService';
import { categoryService } from './categoryService';
import { ReceiptExtractionResult } from '../shared/schemas';
import { PoolClient } from 'pg';

const RECONCILE_TOLERANCE = 0.02;

export interface ProcessedReceiptItem {
  id: string;
  nameOnReceipt: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  unitOfMeasure: string | null;
  weight: number | null;
  isDiscount: boolean;
  needsReview: boolean;
  productId: string | null;
  productName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  matchConfidence: 'exact' | 'near' | 'new';
}

export interface ProcessedReceipt {
  id: string;
  storeId: string;
  storeName: string;
  needsStoreName: boolean;
  receiptDate: string;
  dateEstimated: boolean;
  subtotal: number | null;
  tax: number | null;
  discountTotal: number | null;
  total: number;
  totalEstimated: boolean;
  needsReview: boolean;
  imageUrl: string;
  items: ProcessedReceiptItem[];
}

/** Today's date as YYYY-MM-DD, used when the receipt date is not readable. */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

export const receiptProcessingService = {
  async processReceipt(
    imageUrl: string,
    userId: string,
    householdId: string
  ): Promise<ProcessedReceipt> {
    // Step 1: Parse receipt with AI
    const parser = getReceiptParser();
    const extraction = await parser.parse(imageUrl);

    const needsStoreName = !extraction.storeName;

    // Step 2: Derive totals and provenance. The model returns null (never a
    // fabricated value) when a date or total isn't visible; we fill and flag it.
    const itemsSum = extraction.items.reduce((sum, i) => sum + i.totalPrice, 0);
    const discountSum = extraction.items
      .filter((i) => i.isDiscount)
      .reduce((sum, i) => sum + i.totalPrice, 0);
    const discountTotal = discountSum < 0 ? Math.round(-discountSum * 100) / 100 : null;

    const dateEstimated = !extraction.receiptDate;
    const receiptDate = extraction.receiptDate ?? today();

    const totalEstimated = extraction.total == null;
    const total = extraction.total ?? Math.round(itemsSum * 100) / 100;

    // Reconciliation: items (including negative discount lines) should sum to
    // the subtotal. If they don't, flag the receipt for human review.
    const reconcileTarget = extraction.subtotal ?? total;
    const needsReview =
      reconcileTarget != null &&
      Math.abs(reconcileTarget - itemsSum) > RECONCILE_TOLERANCE;

    // Step 3: Persist store + receipt + items atomically.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const store = await resolveStore(extraction, householdId, client);
      const receipt = await receiptRepository.create(
        {
          userId,
          householdId,
          storeId: store.id,
          receiptDate,
          subtotal: extraction.subtotal,
          tax: extraction.tax,
          discountTotal,
          total,
          totalEstimated,
          dateEstimated,
          needsReview,
          imageUrl,
          rawAiResponse: extraction,
        },
        client
      );

      // Fetch products once; append new ones in-memory so later items in the
      // same receipt match them (fixes N+1 and intra-receipt duplication).
      const products = await productRepository.findAllByHousehold(householdId, client);

      const processedItems: ProcessedReceiptItem[] = [];
      for (const item of extraction.items) {
        const categoryId = await categoryService.resolveCategoryId(item.suggestedCategory);

        let productId: string | null = null;
        let productName: string | null = null;
        let matchConfidence: 'exact' | 'near' | 'new' = 'new';
        let itemNeedsReview = false;

        // Discount lines are not products.
        if (!item.isDiscount) {
          const match = matchAgainstProducts(products, item.suggestedCanonicalName, item.nameOnReceipt);
          matchConfidence = match.confidence;

          if (match.confidence === 'exact' && match.product) {
            productId = match.product.id;
            productName = match.product.canonical_name;
          } else if (match.confidence === 'near' && match.product) {
            // Use the match but flag the item — a real reviewable record, not a
            // silent auto-merge.
            productId = match.product.id;
            productName = match.product.canonical_name;
            itemNeedsReview = true;
          } else if (item.suggestedCanonicalName) {
            const newProduct = await productRepository.create(
              { householdId, canonicalName: item.suggestedCanonicalName, categoryId },
              client
            );
            products.push(newProduct);
            productId = newProduct.id;
            productName = newProduct.canonical_name;
          }
        }

        const receiptItem = await receiptRepository.createItem(
          {
            receiptId: receipt.id,
            productId,
            nameOnReceipt: item.nameOnReceipt,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            unitOfMeasure: item.unitOfMeasure,
            weight: item.weight,
            isDiscount: item.isDiscount,
            needsReview: itemNeedsReview,
            categoryId,
          },
          client
        );

        processedItems.push({
          id: receiptItem.id,
          nameOnReceipt: item.nameOnReceipt,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          unitOfMeasure: item.unitOfMeasure,
          weight: item.weight,
          isDiscount: item.isDiscount,
          needsReview: itemNeedsReview,
          productId,
          productName,
          categoryId,
          categoryName: item.suggestedCategory,
          matchConfidence,
        });
      }

      await client.query('COMMIT');

      return {
        id: receipt.id,
        storeId: store.id,
        storeName: store.name,
        needsStoreName,
        receiptDate,
        dateEstimated,
        subtotal: extraction.subtotal,
        tax: extraction.tax,
        discountTotal,
        total,
        totalEstimated,
        needsReview,
        imageUrl,
        items: processedItems,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

/**
 * Resolve the store for an extraction, matching existing household stores by
 * normalized brand+address or name so trivial variations ("LUNDS&BYERLYS" vs
 * "Lunds & Byerlys") don't fragment into separate stores.
 */
async function resolveStore(
  extraction: ReceiptExtractionResult,
  householdId: string,
  client: PoolClient
): Promise<StoreRow> {
  const storeName = extraction.storeName ?? 'Unknown Store';
  const brandKey = extraction.storeBrand ? normalizeName(extraction.storeBrand) : '';
  const addrKey = extraction.storeAddress ? normalizeName(extraction.storeAddress) : '';
  const nameKey = normalizeName(storeName);

  const existing = await storeRepository.findAllByHousehold(householdId, client);

  const match = existing.find((s) => {
    const sBrand = s.brand ? normalizeName(s.brand) : '';
    const sAddr = s.address ? normalizeName(s.address) : '';
    const sName = normalizeName(s.name);
    // Strong match: same brand and same address.
    if (brandKey && addrKey && sBrand === brandKey && sAddr === addrKey) return true;
    // Same brand, and at least one side has no address to contradict.
    if (brandKey && sBrand === brandKey && (!addrKey || !sAddr)) return true;
    // Same normalized display name.
    if (nameKey && sName === nameKey) return true;
    return false;
  });

  if (match) return match;

  return storeRepository.create(
    { name: storeName, brand: extraction.storeBrand, address: extraction.storeAddress, householdId },
    client
  );
}
