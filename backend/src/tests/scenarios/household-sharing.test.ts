import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Household sharing — two members see shared receipts', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestHousehold('sharing');
  });

  afterAll(async () => {
    await cleanupTestData('sharing');
    await pool.end();
  });

  it('owner creates a receipt, member can see it', async () => {
    // Owner creates a store and receipt
    const store = await storeRepository.create({
      name: 'Costco',
      brand: 'Costco',
      address: '123 Main St',
      householdId: ctx.householdId,
    });

    const receipt = await receiptRepository.create({
      userId: ctx.ownerId,
      householdId: ctx.householdId,
      storeId: store.id,
      receiptDate: '2026-02-01',
      subtotal: 50.00,
      tax: 4.00,
      total: 54.00,
      imageUrl: 'local://test/shared.jpg',
      rawAiResponse: {},
    });

    await receiptRepository.createItem({
      receiptId: receipt.id,
      productId: null,
      nameOnReceipt: 'Organic Eggs',
      quantity: 1,
      unitPrice: 5.99,
      totalPrice: 5.99,
      categoryId: null,
    });

    // Member queries receipts and sees the owner's receipt
    const res = await request(app)
      .get('/receipts')
      .set('Authorization', `Bearer ${ctx.memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const found = res.body.items.find((r: any) => r.id === receipt.id);
    expect(found).toBeDefined();
  });

  it('member creates a receipt, owner can see it', async () => {
    const store = await storeRepository.create({
      name: 'Safeway',
      brand: 'Safeway',
      address: null,
      householdId: ctx.householdId,
    });

    const receipt = await receiptRepository.create({
      userId: ctx.memberId,
      householdId: ctx.householdId,
      storeId: store.id,
      receiptDate: '2026-02-05',
      subtotal: 30.00,
      tax: 2.40,
      total: 32.40,
      imageUrl: 'local://test/member.jpg',
      rawAiResponse: {},
    });

    // Owner queries receipts and sees the member's receipt
    const res = await request(app)
      .get('/receipts')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    const found = res.body.items.find((r: any) => r.id === receipt.id);
    expect(found).toBeDefined();
  });
});
