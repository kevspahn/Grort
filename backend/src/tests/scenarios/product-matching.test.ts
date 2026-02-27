import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { productRepository } from '../../repositories/productRepository';
import { productMatchService } from '../../services/productMatchService';

describe('Scenario: Product matching — previously seen item is matched, not duplicated', () => {
  let ctx: TestContext;
  let existingProductId: string;

  beforeAll(async () => {
    ctx = await setupTestHousehold('matching');

    // Create existing product
    const product = await productRepository.create({
      householdId: ctx.householdId,
      canonicalName: 'Kirkland Organic Whole Milk, 1 Gallon',
      categoryId: null,
    });
    existingProductId = product.id;
  });

  afterAll(async () => {
    await cleanupTestData('matching');
    await pool.end();
  });

  it('matches exact product name', async () => {
    const result = await productMatchService.matchProduct(
      ctx.householdId,
      'Kirkland Organic Whole Milk, 1 Gallon',
      'KS ORG WHOLE MLK 1GAL'
    );
    expect(result.confidence).toBe('exact');
    expect(result.product!.id).toBe(existingProductId);
  });

  it('matches near product name', async () => {
    const result = await productMatchService.matchProduct(
      ctx.householdId,
      'Kirkland Organic Whole Milk 1 Gallon',
      'KS ORG WH MLK'
    );
    expect(['exact', 'near']).toContain(result.confidence);
    expect(result.product!.id).toBe(existingProductId);
  });

  it('does not match unrelated product', async () => {
    const result = await productMatchService.matchProduct(
      ctx.householdId,
      'Fresh Atlantic Salmon Fillet',
      'ATLANTIC SALMON'
    );
    expect(result.confidence).toBe('new');
    expect(result.product).toBeNull();
  });

  it('product count stays the same after matching', async () => {
    const productsBefore = await productRepository.findAllByHousehold(ctx.householdId);
    const countBefore = productsBefore.length;

    // Matching should not create a new product
    await productMatchService.matchProduct(
      ctx.householdId,
      'Kirkland Organic Whole Milk, 1 Gallon',
      'KS ORG WHOLE MLK'
    );

    const productsAfter = await productRepository.findAllByHousehold(ctx.householdId);
    expect(productsAfter.length).toBe(countBefore);
  });
});
