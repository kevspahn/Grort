import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';
import { authService } from '../services/authService';
import { householdService } from '../services/householdService';
import { storeRepository } from '../repositories/storeRepository';
import { productRepository } from '../repositories/productRepository';
import { receiptRepository } from '../repositories/receiptRepository';

describe('Analytics routes', () => {
  let token: string;
  let userId: string;
  let householdId: string;
  let storeId1: string;
  let storeId2: string;
  let productId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-analytics.com'");

    const result = await authService.register('analytics@test-analytics.com', 'password123', 'Tester');
    userId = result.user.id;
    const hh = await householdService.createHousehold(userId, 'Analytics HH');
    householdId = hh.id;
    const loginResult = await authService.login('analytics@test-analytics.com', 'password123');
    token = loginResult.token;

    // Create two stores
    const store1 = await storeRepository.create({ name: 'Costco', brand: 'Costco', address: null, householdId });
    storeId1 = store1.id;
    const store2 = await storeRepository.create({ name: 'Safeway', brand: 'Safeway', address: null, householdId });
    storeId2 = store2.id;

    // Create a product
    const product = await productRepository.create({
      householdId,
      canonicalName: 'Organic Eggs',
      categoryId: 'a0000000-0000-0000-0000-000000000002', // Dairy
    });
    productId = product.id;

    // Create receipts at different stores with the same product
    const receipt1 = await receiptRepository.create({
      userId, householdId, storeId: storeId1,
      receiptDate: '2026-01-10', subtotal: 5.99, tax: 0, total: 5.99,
      imageUrl: 'local://test/r1.jpg', rawAiResponse: {},
    });
    await receiptRepository.createItem({
      receiptId: receipt1.id, productId, nameOnReceipt: 'ORG EGGS',
      quantity: 1, unitPrice: 5.99, totalPrice: 5.99,
      categoryId: 'a0000000-0000-0000-0000-000000000002',
    });

    const receipt2 = await receiptRepository.create({
      userId, householdId, storeId: storeId2,
      receiptDate: '2026-01-15', subtotal: 6.49, tax: 0, total: 6.49,
      imageUrl: 'local://test/r2.jpg', rawAiResponse: {},
    });
    await receiptRepository.createItem({
      receiptId: receipt2.id, productId, nameOnReceipt: 'ORGANIC EGGS',
      quantity: 1, unitPrice: 6.49, totalPrice: 6.49,
      categoryId: 'a0000000-0000-0000-0000-000000000002',
    });

    const receipt3 = await receiptRepository.create({
      userId, householdId, storeId: storeId1,
      receiptDate: '2026-02-01', subtotal: 5.49, tax: 0, total: 5.49,
      imageUrl: 'local://test/r3.jpg', rawAiResponse: {},
    });
    await receiptRepository.createItem({
      receiptId: receipt3.id, productId, nameOnReceipt: 'ORG EGGS',
      quantity: 1, unitPrice: 5.49, totalPrice: 5.49,
      categoryId: 'a0000000-0000-0000-0000-000000000002',
    });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM receipt_items WHERE receipt_id IN (SELECT id FROM receipts WHERE household_id = $1)', [householdId]);
    await pool.query('DELETE FROM receipts WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM products WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM stores WHERE household_id = $1', [householdId]);
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-analytics.com'");
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.end();
  });

  describe('GET /analytics/spending', () => {
    it('returns spending totals', async () => {
      const res = await request(app)
        .get('/analytics/spending?period=month')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.totalSpent).toBeGreaterThan(0);
      expect(res.body.periodBreakdown).toBeDefined();
      expect(res.body.categoryBreakdown).toBeDefined();
    });
  });

  describe('GET /analytics/price-history/:productId', () => {
    it('returns price history across stores', async () => {
      const res = await request(app)
        .get(`/analytics/price-history/${productId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.dataPoints).toHaveLength(3);
      expect(res.body.productName).toBe('Organic Eggs');
    });
  });

  describe('GET /analytics/store-comparison', () => {
    it('compares prices across stores', async () => {
      const res = await request(app)
        .get(`/analytics/store-comparison?productIds=${productId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.comparisons).toHaveLength(1);
      expect(res.body.comparisons[0].stores).toHaveLength(2);
      // Costco should be cheapest (avg 5.74 vs 6.49)
      expect(res.body.comparisons[0].cheapestStoreId).toBe(storeId1);
    });
  });
});
