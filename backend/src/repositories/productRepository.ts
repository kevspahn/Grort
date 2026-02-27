import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface ProductRow {
  id: string;
  household_id: string;
  canonical_name: string;
  category_id: string | null;
  created_at: Date;
}

export const productRepository = {
  async findByCanonicalName(householdId: string, canonicalName: string): Promise<ProductRow | null> {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE household_id = $1 AND LOWER(canonical_name) = LOWER($2)',
      [householdId, canonicalName]
    );
    return rows[0] || null;
  },

  async findAllByHousehold(householdId: string): Promise<ProductRow[]> {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE household_id = $1 ORDER BY canonical_name',
      [householdId]
    );
    return rows;
  },

  async create(data: {
    householdId: string;
    canonicalName: string;
    categoryId: string | null;
  }): Promise<ProductRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO products (id, household_id, canonical_name, category_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, data.householdId, data.canonicalName, data.categoryId]
    );
    return rows[0];
  },

  async findById(id: string): Promise<ProductRow | null> {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async update(id: string, data: { canonicalName?: string; categoryId?: string | null }): Promise<ProductRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.canonicalName !== undefined) {
      fields.push(`canonical_name = $${idx++}`);
      values.push(data.canonicalName);
    }
    if (data.categoryId !== undefined) {
      fields.push(`category_id = $${idx++}`);
      values.push(data.categoryId);
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0];
  },

  async mergeProducts(sourceId: string, targetId: string): Promise<void> {
    // Update all receipt_items referencing source to target
    await pool.query(
      'UPDATE receipt_items SET product_id = $1 WHERE product_id = $2',
      [targetId, sourceId]
    );
    // Delete source product
    await pool.query('DELETE FROM products WHERE id = $1', [sourceId]);
  },
};
