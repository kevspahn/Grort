import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import pool from '../db/pool';
import { householdRepository } from '../repositories/householdRepository';
import { userRepository } from '../repositories/userRepository';
import { receiptRepository } from '../repositories/receiptRepository';
import { setReceiptParser } from '../ai/parserFactory';
import { receiptProcessingService } from './receiptProcessingService';
import { ReceiptExtractionResult } from '../shared/schemas';

// Minimal complete extraction; override per test.
function extraction(over: Partial<ReceiptExtractionResult> = {}): ReceiptExtractionResult {
  return {
    storeName: 'Test Store',
    storeAddress: null,
    storeBrand: 'Test Store',
    receiptDate: '2026-05-01',
    subtotal: null,
    tax: null,
    discountTotal: null,
    total: null,
    items: [],
    ...over,
  } as ReceiptExtractionResult;
}

function stubParser(result: ReceiptExtractionResult) {
  setReceiptParser({ providerName: 'stub', parse: async () => result });
}

describe('receiptProcessingService.processReceipt', () => {
  let householdId: string;
  let userId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email = 'rp@holdout-rp.com'");
    await pool.query("DELETE FROM households WHERE name = 'RP Household'");
    const hh = await householdRepository.create('RP Household');
    householdId = hh.id;
    const user = await userRepository.create({ email: 'rp@holdout-rp.com', passwordHash: 'x', name: 'RP' });
    userId = user.id;
    await userRepository.updateHousehold(userId, householdId, 'owner');
  });

  afterEach(() => setReceiptParser(null));

  afterAll(async () => {
    await pool.query('DELETE FROM receipt_items WHERE receipt_id IN (SELECT id FROM receipts WHERE household_id = $1)', [householdId]);
    await pool.query('DELETE FROM receipts WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM products WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM stores WHERE household_id = $1', [householdId]);
    await pool.query("DELETE FROM users WHERE email = 'rp@holdout-rp.com'");
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.end();
  });

  it('flags a receipt whose items do not reconcile to the subtotal (#2)', async () => {
    stubParser(extraction({
      subtotal: 30.0, total: 33.0, receiptDate: '2026-05-02',
      items: [
        { nameOnReceipt: 'Milk', quantity: 1, unitPrice: 3, totalPrice: 3, unitOfMeasure: null, weight: null, isDiscount: false, suggestedCategory: 'Dairy', suggestedCanonicalName: 'Milk' },
        // sums to 3, subtotal 30 -> mismatch
      ],
    }));
    const r = await receiptProcessingService.processReceipt('local://x.jpg', userId, householdId);
    expect(r.needsReview).toBe(true);
  });

  it('captures a discount line so a couponed receipt reconciles (#2/#9)', async () => {
    stubParser(extraction({
      subtotal: 8.0, total: 8.0, receiptDate: '2026-05-03',
      items: [
        { nameOnReceipt: 'Cheese', quantity: 1, unitPrice: 10, totalPrice: 10, unitOfMeasure: null, weight: null, isDiscount: false, suggestedCategory: 'Dairy', suggestedCanonicalName: 'Cheese Block' },
        { nameOnReceipt: 'COUPON', quantity: 1, unitPrice: null, totalPrice: -2, unitOfMeasure: null, weight: null, isDiscount: true, suggestedCategory: null, suggestedCanonicalName: null },
      ],
    }));
    const r = await receiptProcessingService.processReceipt('local://c.jpg', userId, householdId);
    expect(r.needsReview).toBe(false);
    expect(r.discountTotal).toBe(2);
    const items = await receiptRepository.findItemsByReceiptId(r.id);
    const discount = items.find((i) => i.is_discount);
    expect(discount).toBeDefined();
    expect(discount!.product_id).toBeNull();
  });

  it('estimates and flags a missing total and date (#9)', async () => {
    stubParser(extraction({
      receiptDate: null, total: null, subtotal: null,
      items: [
        { nameOnReceipt: 'Bread', quantity: 1, unitPrice: 4, totalPrice: 4, unitOfMeasure: null, weight: null, isDiscount: false, suggestedCategory: 'Bakery', suggestedCanonicalName: 'Bread Loaf' },
      ],
    }));
    const r = await receiptProcessingService.processReceipt('local://e.jpg', userId, householdId);
    expect(r.totalEstimated).toBe(true);
    expect(r.dateEstimated).toBe(true);
    expect(r.total).toBe(4);
  });

  it('merges store-name variants into one store (#2.2)', async () => {
    stubParser(extraction({
      storeName: 'LUNDS&BYERLYS', storeBrand: 'Lunds & Byerlys', receiptDate: '2026-05-04',
      items: [{ nameOnReceipt: 'A', quantity: 1, unitPrice: 1, totalPrice: 1, unitOfMeasure: null, weight: null, isDiscount: false, suggestedCategory: null, suggestedCanonicalName: 'Item A' }],
    }));
    const r1 = await receiptProcessingService.processReceipt('local://s1.jpg', userId, householdId);
    stubParser(extraction({
      storeName: "Lund's & Byerlys", storeBrand: "Lund's & Byerlys", receiptDate: '2026-05-05',
      items: [{ nameOnReceipt: 'B', quantity: 1, unitPrice: 1, totalPrice: 1, unitOfMeasure: null, weight: null, isDiscount: false, suggestedCategory: null, suggestedCanonicalName: 'Item B' }],
    }));
    const r2 = await receiptProcessingService.processReceipt('local://s2.jpg', userId, householdId);
    expect(r2.storeId).toBe(r1.storeId);
  });

  it('does not duplicate a product on word-order / punctuation variance (#3)', async () => {
    stubParser(extraction({
      receiptDate: '2026-05-06',
      items: [{ nameOnReceipt: 'SALMON OAK', quantity: 1, unitPrice: 9, totalPrice: 9, unitOfMeasure: null, weight: null, isDiscount: false, suggestedCategory: 'Meat & Seafood', suggestedCanonicalName: 'Oak Smoked Salmon Pieces' }],
    }));
    await receiptProcessingService.processReceipt('local://p1.jpg', userId, householdId);
    const before = await pool.query('SELECT count(*)::int c FROM products WHERE household_id = $1', [householdId]);

    stubParser(extraction({
      receiptDate: '2026-05-07',
      items: [{ nameOnReceipt: 'SALMON OAK', quantity: 1, unitPrice: 9, totalPrice: 9, unitOfMeasure: null, weight: null, isDiscount: false, suggestedCategory: 'Meat & Seafood', suggestedCanonicalName: 'Salmon Oak Smoked Pieces' }],
    }));
    await receiptProcessingService.processReceipt('local://p2.jpg', userId, householdId);
    const after = await pool.query('SELECT count(*)::int c FROM products WHERE household_id = $1', [householdId]);

    expect(after.rows[0].c).toBe(before.rows[0].c);
  });
});
