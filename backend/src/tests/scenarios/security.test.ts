import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Security — authorization and token revocation', () => {
  let alpha: TestContext;
  let beta: TestContext;

  beforeAll(async () => {
    alpha = await setupTestHousehold('sec-alpha');
    beta = await setupTestHousehold('sec-beta');
  });

  afterAll(async () => {
    await cleanupTestData('sec-alpha');
    await cleanupTestData('sec-beta');
    await pool.end();
  });

  it('IDOR: cannot edit a receipt item that belongs to another receipt (#5)', async () => {
    // Alpha owns a receipt with an item.
    const store = await storeRepository.create({
      name: 'Target', brand: 'Target', address: '1 A St', householdId: alpha.householdId,
    });
    const alphaReceipt = await receiptRepository.create({
      userId: alpha.ownerId, householdId: alpha.householdId, storeId: store.id,
      receiptDate: '2026-03-01', subtotal: 10, tax: 1, total: 11,
      imageUrl: 'local://a.jpg', rawAiResponse: {},
    });
    const alphaItem = await receiptRepository.createItem({
      receiptId: alphaReceipt.id, productId: null, nameOnReceipt: 'Milk',
      quantity: 1, unitPrice: 3, totalPrice: 3, categoryId: null,
    });

    // Beta owns their own receipt; try to edit Alpha's item via Beta's receipt URL.
    const betaStore = await storeRepository.create({
      name: 'Cub', brand: 'Cub', address: '2 B St', householdId: beta.householdId,
    });
    const betaReceipt = await receiptRepository.create({
      userId: beta.ownerId, householdId: beta.householdId, storeId: betaStore.id,
      receiptDate: '2026-03-02', subtotal: 5, tax: 0, total: 5,
      imageUrl: 'local://b.jpg', rawAiResponse: {},
    });

    const res = await request(app)
      .put(`/receipts/${betaReceipt.id}/items/${alphaItem.id}`)
      .set('Authorization', `Bearer ${beta.ownerToken}`)
      .send({ totalPrice: 999 });

    expect(res.status).toBe(404);

    // Alpha's item must be untouched.
    const items = await receiptRepository.findItemsByReceiptId(alphaReceipt.id);
    expect(Number(items[0].total_price)).toBe(3);
  });

  it('IDOR: cannot read another household\'s members (#6)', async () => {
    const res = await request(app)
      .get(`/households/${beta.householdId}/members`)
      .set('Authorization', `Bearer ${alpha.ownerToken}`);
    expect(res.status).toBe(404);
  });

  it('can read own household members', async () => {
    const res = await request(app)
      .get(`/households/${alpha.householdId}/members`)
      .set('Authorization', `Bearer ${alpha.ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('change-password rejects a wrong current password', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${alpha.memberToken}`)
      .send({ currentPassword: 'wrongpass', newPassword: 'brandnewpass123' });
    expect(res.status).toBe(400);
  });

  it('change-password succeeds and revokes the old token (#16)', async () => {
    const oldToken = beta.memberToken;

    const change = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ currentPassword: 'password123', newPassword: 'brandnewpass123' });
    expect(change.status).toBe(200);
    expect(change.body.token).toBeDefined();

    // Old token is now revoked.
    const stale = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(stale.status).toBe(401);

    // The freshly issued token works.
    const fresh = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${change.body.token}`);
    expect(fresh.status).toBe(200);
  });
});
