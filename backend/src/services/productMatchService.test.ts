import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { productRepository } from '../repositories/productRepository';
import { productMatchService } from './productMatchService';
import { householdRepository } from '../repositories/householdRepository';

describe('productMatchService', () => {
  let householdId: string;

  beforeAll(async () => {
    const hh = await householdRepository.create('Match Test Household');
    householdId = hh.id;

    await productRepository.create({
      householdId,
      canonicalName: 'Organic Large Brown Eggs, 1 Dozen',
      categoryId: null,
    });
    await productRepository.create({
      householdId,
      canonicalName: 'Kirkland Organic Whole Milk, 1 Gallon',
      categoryId: null,
    });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM products WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.end();
  });

  it('finds exact match', async () => {
    const result = await productMatchService.matchProduct(
      householdId,
      'Organic Large Brown Eggs, 1 Dozen',
      'ORG LRG BRN EGGS 12CT'
    );
    expect(result.confidence).toBe('exact');
    expect(result.product).not.toBeNull();
    expect(result.product!.canonical_name).toBe('Organic Large Brown Eggs, 1 Dozen');
  });

  it('finds near match', async () => {
    const result = await productMatchService.matchProduct(
      householdId,
      'Organic Brown Eggs, Large',
      'ORG BRN EGGS'
    );
    // Should be near or exact depending on threshold
    expect(['exact', 'near']).toContain(result.confidence);
    expect(result.product).not.toBeNull();
  });

  it('returns new for no match', async () => {
    const result = await productMatchService.matchProduct(
      householdId,
      'Avocado Hass Single',
      'AVOCADO HASS'
    );
    expect(result.confidence).toBe('new');
  });

  it('handles null suggested name', async () => {
    const result = await productMatchService.matchProduct(
      householdId,
      null,
      'SOME ITEM'
    );
    expect(result.confidence).toBe('new');
    expect(result.product).toBeNull();
  });
});
