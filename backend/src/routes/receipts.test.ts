import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';
import { authService } from '../services/authService';
import { householdService } from '../services/householdService';
import { receiptRepository } from '../repositories/receiptRepository';
import { storeRepository } from '../repositories/storeRepository';

describe('Receipt routes', () => {
  let token: string;
  let userId: string;
  let householdId: string;
  let storeId: string;
  let receiptId: string;
  let itemId: string;

  beforeAll(async () => {
    // Clean up
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-receipt-routes.com'");

    // Create user with household
    const result = await authService.register('receipts@test-receipt-routes.com', 'password123', 'Tester');
    token = result.token;
    userId = result.user.id;

    const hh = await householdService.createHousehold(userId, 'Test Household');
    householdId = hh.id;

    // Re-login to get updated token with household
    const loginResult = await authService.login('receipts@test-receipt-routes.com', 'password123');
    token = loginResult.token;

    // Create a store
    const store = await storeRepository.create({
      name: 'Test Store',
      brand: 'TestBrand',
      address: '123 Test St',
      householdId,
    });
    storeId = store.id;

    // Create a receipt directly (bypassing AI)
    const receipt = await receiptRepository.create({
      userId,
      householdId,
      storeId,
      receiptDate: '2026-01-15',
      subtotal: 10.00,
      tax: 0.80,
      total: 10.80,
      imageUrl: 'local://test/receipt.jpg',
      rawAiResponse: {},
    });
    receiptId = receipt.id;

    // Create receipt items
    const item = await receiptRepository.createItem({
      receiptId,
      productId: null,
      nameOnReceipt: 'ORG MILK 1GAL',
      quantity: 1,
      unitPrice: 5.99,
      totalPrice: 5.99,
      categoryId: null,
    });
    itemId = item.id;

    await receiptRepository.createItem({
      receiptId,
      productId: null,
      nameOnReceipt: 'BANANAS',
      quantity: 3,
      unitPrice: 0.29,
      totalPrice: 0.87,
      categoryId: null,
    });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM receipt_items WHERE receipt_id = $1", [receiptId]);
    await pool.query("DELETE FROM receipts WHERE id = $1", [receiptId]);
    await pool.query("DELETE FROM stores WHERE id = $1", [storeId]);
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-receipt-routes.com'");
    await pool.query("DELETE FROM households WHERE id = $1", [householdId]);
    await pool.end();
  });

  describe('GET /receipts', () => {
    it('lists receipts', async () => {
      const res = await request(app)
        .get('/receipts')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('supports pagination', async () => {
      const res = await request(app)
        .get('/receipts?page=1&limit=5')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(5);
    });
  });

  describe('GET /receipts/:id', () => {
    it('returns receipt with items', async () => {
      const res = await request(app)
        .get(`/receipts/${receiptId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(receiptId);
      expect(res.body.store_name).toBe('Test Store');
      expect(res.body.items).toHaveLength(2);
    });

    it('returns 404 for nonexistent receipt', async () => {
      const res = await request(app)
        .get('/receipts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /receipts/:id/items/:itemId', () => {
    it('updates a receipt item', async () => {
      const res = await request(app)
        .put(`/receipts/${receiptId}/items/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nameOnReceipt: 'Organic Whole Milk 1 Gallon', totalPrice: 6.49 });
      expect(res.status).toBe(200);
      expect(res.body.name_on_receipt).toBe('Organic Whole Milk 1 Gallon');
    });
  });

  describe('DELETE /receipts/:id', () => {
    it('deletes receipt and cascades items', async () => {
      // Create a receipt to delete
      const receipt = await receiptRepository.create({
        userId,
        householdId,
        storeId,
        receiptDate: '2026-01-20',
        subtotal: 5.00,
        tax: 0.40,
        total: 5.40,
        imageUrl: 'local://test/delete-me.jpg',
        rawAiResponse: {},
      });
      await receiptRepository.createItem({
        receiptId: receipt.id,
        productId: null,
        nameOnReceipt: 'APPLE',
        quantity: 1,
        unitPrice: 1.00,
        totalPrice: 1.00,
        categoryId: null,
      });

      const res = await request(app)
        .delete(`/receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);

      // Verify items are gone
      const items = await receiptRepository.findItemsByReceiptId(receipt.id);
      expect(items).toHaveLength(0);
    });
  });
});
