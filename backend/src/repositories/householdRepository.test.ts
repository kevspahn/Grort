import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { householdRepository } from './householdRepository';

describe('householdRepository', () => {
  let householdId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-household-repo.com'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-household-repo.com'");
    if (householdId) {
      await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    }
    await pool.end();
  });

  it('creates a household', async () => {
    const hh = await householdRepository.create('Test Family');
    householdId = hh.id;
    expect(hh.name).toBe('Test Family');
    expect(hh.id).toBeDefined();
  });

  it('finds household by id', async () => {
    const hh = await householdRepository.findById(householdId);
    expect(hh).not.toBeNull();
    expect(hh!.name).toBe('Test Family');
  });

  it('returns null for nonexistent id', async () => {
    const hh = await householdRepository.findById('00000000-0000-0000-0000-000000000000');
    expect(hh).toBeNull();
  });
});
