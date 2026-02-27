import { describe, it, expect, afterAll } from 'vitest';
import pool from './pool';

describe('Database pool', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('connects to PostgreSQL and runs a query', async () => {
    const result = await pool.query('SELECT 1 + 1 AS sum');
    expect(result.rows[0].sum).toBe(2);
  });
});
