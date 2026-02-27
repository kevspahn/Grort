import { describe, it, expect, afterAll } from 'vitest';
import pool from './pool';

describe('Database schema', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('has all required tables', async () => {
    const { rows } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = rows.map((r: { table_name: string }) => r.table_name);
    expect(tables).toContain('users');
    expect(tables).toContain('households');
    expect(tables).toContain('stores');
    expect(tables).toContain('categories');
    expect(tables).toContain('products');
    expect(tables).toContain('receipts');
    expect(tables).toContain('receipt_items');
  });

  it('has seeded categories', async () => {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM categories');
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(10);
  });

  it('has category hierarchy', async () => {
    const { rows } = await pool.query(`
      SELECT c.name, p.name as parent_name
      FROM categories c
      JOIN categories p ON c.parent_id = p.id
      WHERE c.name = 'Fruits'
    `);
    expect(rows[0].parent_name).toBe('Produce');
  });
});
