import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';
import { authService } from '../services/authService';
import { householdService } from '../services/householdService';
import { productRepository } from '../repositories/productRepository';

describe('Product routes', () => {
  let token: string;
  let userId: string;
  let householdId: string;
  let productId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-product-routes.com'");
    const result = await authService.register('prod@test-product-routes.com', 'password123', 'Tester');
    token = result.token;
    userId = result.user.id;
    const hh = await householdService.createHousehold(userId, 'Prod HH');
    householdId = hh.id;
    const loginResult = await authService.login('prod@test-product-routes.com', 'password123');
    token = loginResult.token;

    const product = await productRepository.create({
      householdId,
      canonicalName: 'Test Product',
      categoryId: null,
    });
    productId = product.id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM products WHERE household_id = $1', [householdId]);
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-product-routes.com'");
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.end();
  });

  it('lists products', async () => {
    const res = await request(app)
      .get('/products')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].canonicalName).toBeDefined();
  });

  it('updates a product', async () => {
    const res = await request(app)
      .put(`/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ canonicalName: 'Updated Product Name' });
    expect(res.status).toBe(200);
    expect(res.body.canonicalName).toBe('Updated Product Name');
  });

  it('merges products', async () => {
    const product2 = await productRepository.create({
      householdId,
      canonicalName: 'Duplicate Product',
      categoryId: null,
    });

    const res = await request(app)
      .post('/products/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceId: product2.id, targetId: productId });
    expect(res.status).toBe(200);
    expect(res.body.targetId).toBe(productId);

    // Verify source is deleted
    const deleted = await productRepository.findById(product2.id);
    expect(deleted).toBeNull();
  });
});
