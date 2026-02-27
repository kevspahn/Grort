import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Spending trends show correct category breakdowns for 5 receipts', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestHousehold('trends');

    const store = await storeRepository.create({
      name: 'Grocery Store', brand: 'Generic', address: null, householdId: ctx.householdId,
    });

    // Create 5 receipts in January 2026 with categorized items
    const receipts = [
      { date: '2026-01-05', total: 45.00, items: [
        { name: 'Apples', price: 5.00, cat: 'a0000000-0000-0000-0000-000000000001' },    // Produce
        { name: 'Milk', price: 4.00, cat: 'a0000000-0000-0000-0000-000000000002' },       // Dairy
        { name: 'Chicken', price: 12.00, cat: 'a0000000-0000-0000-0000-000000000003' },   // Meat
        { name: 'Bread', price: 3.00, cat: 'a0000000-0000-0000-0000-000000000004' },      // Bakery
        { name: 'Ice cream', price: 6.00, cat: 'a0000000-0000-0000-0000-000000000005' },  // Frozen
      ]},
      { date: '2026-01-10', total: 35.00, items: [
        { name: 'Bananas', price: 2.00, cat: 'a0000000-0000-0000-0000-000000000001' },
        { name: 'Cheese', price: 8.00, cat: 'a0000000-0000-0000-0000-000000000002' },
        { name: 'Salmon', price: 15.00, cat: 'a0000000-0000-0000-0000-000000000003' },
      ]},
      { date: '2026-01-15', total: 28.00, items: [
        { name: 'Orange juice', price: 5.00, cat: 'a0000000-0000-0000-0000-000000000006' }, // Beverages
        { name: 'Chips', price: 4.00, cat: 'a0000000-0000-0000-0000-000000000007' },       // Snacks
        { name: 'Detergent', price: 12.00, cat: 'a0000000-0000-0000-0000-000000000008' },  // Household
      ]},
      { date: '2026-01-20', total: 22.00, items: [
        { name: 'Yogurt', price: 6.00, cat: 'a0000000-0000-0000-0000-000000000002' },
        { name: 'Steak', price: 16.00, cat: 'a0000000-0000-0000-0000-000000000003' },
      ]},
      { date: '2026-01-25', total: 18.00, items: [
        { name: 'Frozen pizza', price: 8.00, cat: 'a0000000-0000-0000-0000-000000000005' },
        { name: 'Soda', price: 5.00, cat: 'a0000000-0000-0000-0000-000000000006' },
        { name: 'Shampoo', price: 5.00, cat: 'a0000000-0000-0000-0000-000000000009' },    // Personal Care
      ]},
    ];

    for (const r of receipts) {
      const receipt = await receiptRepository.create({
        userId: ctx.ownerId, householdId: ctx.householdId, storeId: store.id,
        receiptDate: r.date, subtotal: r.total, tax: 0, total: r.total,
        imageUrl: `local://test/trends-${r.date}.jpg`, rawAiResponse: {},
      });
      for (const item of r.items) {
        await receiptRepository.createItem({
          receiptId: receipt.id, productId: null, nameOnReceipt: item.name,
          quantity: 1, unitPrice: item.price, totalPrice: item.price, categoryId: item.cat,
        });
      }
    }
  });

  afterAll(async () => {
    await cleanupTestData('trends');
    await pool.end();
  });

  it('returns correct total spending', async () => {
    const res = await request(app)
      .get('/analytics/spending?period=month&startDate=2026-01-01&endDate=2026-01-31')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    // 45 + 35 + 28 + 22 + 18 = 148
    expect(res.body.totalSpent).toBe(148);
  });

  it('returns correct category breakdowns', async () => {
    const res = await request(app)
      .get('/analytics/spending?period=month&startDate=2026-01-01&endDate=2026-01-31')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    const categories = res.body.categoryBreakdown;
    expect(categories.length).toBeGreaterThan(0);

    // Meat & Seafood: 12 + 15 + 16 = 43 (highest)
    const meat = categories.find((c: any) => c.categoryName === 'Meat & Seafood');
    expect(meat).toBeDefined();
    expect(meat.total).toBe(43);

    // Dairy: 4 + 8 + 6 = 18
    const dairy = categories.find((c: any) => c.categoryName === 'Dairy');
    expect(dairy).toBeDefined();
    expect(dairy.total).toBe(18);

    // Produce: 5 + 2 = 7
    const produce = categories.find((c: any) => c.categoryName === 'Produce');
    expect(produce).toBeDefined();
    expect(produce.total).toBe(7);

    // Percentages should sum to ~100
    const totalPercentage = categories.reduce((sum: number, c: any) => sum + c.percentage, 0);
    expect(totalPercentage).toBeGreaterThanOrEqual(99);
    expect(totalPercentage).toBeLessThanOrEqual(101);
  });

  it('returns period breakdown for January', async () => {
    const res = await request(app)
      .get('/analytics/spending?period=month&startDate=2026-01-01&endDate=2026-01-31')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.periodBreakdown.length).toBeGreaterThanOrEqual(1);
    expect(res.body.periodBreakdown[0].total).toBe(148);
  });
});
