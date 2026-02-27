import { getReceiptParser } from '../ai/parserFactory';
import { receiptRepository } from '../repositories/receiptRepository';
import { storeRepository } from '../repositories/storeRepository';
import { productRepository } from '../repositories/productRepository';
import { productMatchService, MatchResult } from './productMatchService';
import { categoryService } from './categoryService';
import { ReceiptExtractionResult } from '../shared/schemas';

export interface ProcessedReceiptItem {
  id: string;
  nameOnReceipt: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
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
  receiptDate: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  imageUrl: string;
  items: ProcessedReceiptItem[];
}

export const receiptProcessingService = {
  async processReceipt(
    imageUrl: string,
    userId: string,
    householdId: string | null
  ): Promise<ProcessedReceipt> {
    // Step 1: Parse receipt with AI
    const parser = getReceiptParser();
    const extraction = await parser.parse(imageUrl);

    // Step 2: Resolve store
    const store = await resolveStore(extraction, householdId);

    // Step 3: Create receipt record
    const receipt = await receiptRepository.create({
      userId,
      householdId,
      storeId: store.id,
      receiptDate: extraction.receiptDate,
      subtotal: extraction.subtotal,
      tax: extraction.tax,
      total: extraction.total,
      imageUrl,
      rawAiResponse: extraction,
    });

    // Step 4: Process each item
    const processedItems: ProcessedReceiptItem[] = [];

    for (const item of extraction.items) {
      // Resolve category
      const categoryId = await categoryService.resolveCategoryId(item.suggestedCategory);

      // Match product
      let matchResult: MatchResult = { product: null, confidence: 'new', score: 0 };
      if (householdId) {
        matchResult = await productMatchService.matchProduct(
          householdId,
          item.suggestedCanonicalName,
          item.nameOnReceipt
        );
      }

      let productId: string | null = null;
      let productName: string | null = null;

      if (matchResult.confidence === 'exact' && matchResult.product) {
        // Use existing product
        productId = matchResult.product.id;
        productName = matchResult.product.canonical_name;
      } else if (matchResult.confidence === 'near' && matchResult.product) {
        // Flag for review — use existing product but mark as near match
        productId = matchResult.product.id;
        productName = matchResult.product.canonical_name;
      } else if (householdId && item.suggestedCanonicalName) {
        // Create new product
        const newProduct = await productRepository.create({
          householdId,
          canonicalName: item.suggestedCanonicalName,
          categoryId,
        });
        productId = newProduct.id;
        productName = newProduct.canonical_name;
      }

      // Create receipt item
      const receiptItem = await receiptRepository.createItem({
        receiptId: receipt.id,
        productId,
        nameOnReceipt: item.nameOnReceipt,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        categoryId,
      });

      processedItems.push({
        id: receiptItem.id,
        nameOnReceipt: item.nameOnReceipt,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        productId,
        productName,
        categoryId,
        categoryName: item.suggestedCategory,
        matchConfidence: matchResult.confidence,
      });
    }

    return {
      id: receipt.id,
      storeId: store.id,
      storeName: store.name,
      receiptDate: extraction.receiptDate,
      subtotal: extraction.subtotal,
      tax: extraction.tax,
      total: extraction.total,
      imageUrl,
      items: processedItems,
    };
  },
};

async function resolveStore(
  extraction: ReceiptExtractionResult,
  householdId: string | null
) {
  if (!householdId) {
    // For users without a household, create a temporary store record
    return storeRepository.create({
      name: extraction.storeName,
      brand: extraction.storeBrand,
      address: extraction.storeAddress,
      householdId: householdId!,
    });
  }

  // Try to match existing store by brand+address
  let store = await storeRepository.findByBrandAndAddress(
    householdId,
    extraction.storeBrand,
    extraction.storeAddress
  );

  if (store) return store;

  // Try by name
  store = await storeRepository.findByNameFuzzy(householdId, extraction.storeName);

  if (store) return store;

  // Create new store
  return storeRepository.create({
    name: extraction.storeName,
    brand: extraction.storeBrand,
    address: extraction.storeAddress,
    householdId,
  });
}
