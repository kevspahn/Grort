import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { productRepository } from '../../repositories/productRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Price history — 3 receipts from different stores show 3 data points', () => {
  let ctx: TestContext;
  let productId: string;
  let costcoId: string;
  let safewayId: string;
  let tradersId: string;

  beforeAll(async () => {
    ctx = await setupTestHousehold('pricehistory');

    // Create 3 stores
    const costco = await storeRepository.create({ name: 'Costco', brand: 'Costco', address: null, householdId: ctx.householdId });
    const safeway = await storeRepository.create({ name: 'Safeway', brand: 'Safeway', address: null, householdId: ctx.householdId });
    const traders = await storeRepository.create({ name: "Trader Joe's", brand: "Trader Joe's", address: null, householdId: ctx.householdId });
    costcoId = costco.id;
    safewayId = safeway.id;
    tradersId = traders.id;

    // Create product
    const product = await productRepository.create({
      householdId: ctx.householdId,
      canonicalName: 'Large Brown Eggs, 1 Dozen',
      categoryId: null,
    });
    productId = product.id;

    // Create receipts with eggs at each store
    for (const { storeId, date, price } of [
      { storeId: costcoId, date: '2026-01-10', price: 4.99 },
      { storeId: safewayId, date: '2026-01-17', price: 6.49 },
      { storeId: tradersId, date: '2026-01-24', price: 5.49 },
    ]) {
      const receipt = await receiptRepository.create({
        userId: ctx.ownerId, householdId: ctx.householdId, storeId,
        receiptDate: date, subtotal: price, tax: 0, total: price,
        imageUrl: `local://test/eggs-${date}.jpg`, rawAiResponse: {},
      });
      await receiptRepository.createItem({
        receiptId: receipt.id, productId, nameOnReceipt: 'EGGS LRG BRN 12CT',
        quantity: 1, unitPrice: price, totalPrice: price, categoryId: null,
      });
    }
  });

  afterAll(async () => {
    await cleanupTestData('pricehistory');
    await pool.end();
  });

  it('price history shows 3 data points across stores', async () => {
    const res = await request(app)
      .get(`/analytics/price-history/${productId}`)
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.productName).toBe('Large Brown Eggs, 1 Dozen');
    expect(res.body.dataPoints).toHaveLength(3);

    const storeNames = res.body.dataPoints.map((dp: any) => dp.storeName);
    expect(storeNames).toContain('Costco');
    expect(storeNames).toContain('Safeway');
    expect(storeNames).toContain("Trader Joe's");
  });

  it('store comparison shows cheapest store for eggs', async () => {
    const res = await request(app)
      .get(`/analytics/store-comparison?productIds=${productId}`)
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.comparisons).toHaveLength(1);
    expect(res.body.comparisons[0].stores).toHaveLength(3);
    // Costco at $4.99 should be cheapest
    expect(res.body.comparisons[0].cheapestStoreId).toBe(costcoId);
  });
});
