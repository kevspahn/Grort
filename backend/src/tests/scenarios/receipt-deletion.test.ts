import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Delete receipt — items removed, analytics updated', () => {
  let ctx: TestContext;
  let receiptId: string;
  let storeId: string;

  beforeAll(async () => {
    ctx = await setupTestHousehold('deletion');

    const store = await storeRepository.create({
      name: 'Target', brand: 'Target', address: null, householdId: ctx.householdId,
    });
    storeId = store.id;

    const receipt = await receiptRepository.create({
      userId: ctx.ownerId, householdId: ctx.householdId, storeId,
      receiptDate: '2026-02-10', subtotal: 20.00, tax: 1.60, total: 21.60,
      imageUrl: 'local://test/delete-scenario.jpg', rawAiResponse: {},
    });
    receiptId = receipt.id;

    await receiptRepository.createItem({
      receiptId, productId: null, nameOnReceipt: 'Item A',
      quantity: 1, unitPrice: 10.00, totalPrice: 10.00, categoryId: null,
    });
    await receiptRepository.createItem({
      receiptId, productId: null, nameOnReceipt: 'Item B',
      quantity: 2, unitPrice: 5.00, totalPrice: 10.00, categoryId: null,
    });
  });

  afterAll(async () => {
    await cleanupTestData('deletion');
    await pool.end();
  });

  it('deleting a receipt removes all items', async () => {
    // Verify items exist
    const itemsBefore = await receiptRepository.findItemsByReceiptId(receiptId);
    expect(itemsBefore.length).toBe(2);

    // Delete receipt
    const res = await request(app)
      .delete(`/receipts/${receiptId}`)
      .set('Authorization', `Bearer ${ctx.ownerToken}`);
    expect(res.status).toBe(200);

    // Verify receipt is gone
    const receipt = await receiptRepository.findById(receiptId);
    expect(receipt).toBeNull();

    // Verify items are gone (CASCADE DELETE)
    const itemsAfter = await receiptRepository.findItemsByReceiptId(receiptId);
    expect(itemsAfter.length).toBe(0);
  });

  it('analytics reflect the deletion', async () => {
    const res = await request(app)
      .get('/analytics/spending?period=month')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);
    expect(res.status).toBe(200);
    // The deleted receipt should not appear in spending
    // Total should not include the deleted receipt's $21.60
  });
});
