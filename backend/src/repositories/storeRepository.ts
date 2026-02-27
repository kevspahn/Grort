import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface StoreRow {
  id: string;
  name: string;
  brand: string | null;
  address: string | null;
  household_id: string;
  created_at: Date;
}

export const storeRepository = {
  async findByBrandAndAddress(
    householdId: string,
    brand: string | null,
    address: string | null
  ): Promise<StoreRow | null> {
    if (brand && address) {
      const { rows } = await pool.query(
        'SELECT * FROM stores WHERE household_id = $1 AND brand = $2 AND address = $3',
        [householdId, brand, address]
      );
      return rows[0] || null;
    }
    if (brand) {
      const { rows } = await pool.query(
        'SELECT * FROM stores WHERE household_id = $1 AND brand = $2 AND address IS NULL LIMIT 1',
        [householdId, brand]
      );
      return rows[0] || null;
    }
    return null;
  },

  async findByNameFuzzy(householdId: string, name: string): Promise<StoreRow | null> {
    const { rows } = await pool.query(
      'SELECT * FROM stores WHERE household_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1',
      [householdId, name]
    );
    return rows[0] || null;
  },

  async create(data: {
    name: string;
    brand: string | null;
    address: string | null;
    householdId: string;
  }): Promise<StoreRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO stores (id, name, brand, address, household_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, data.name, data.brand, data.address, data.householdId]
    );
    return rows[0];
  },

  async findById(id: string): Promise<StoreRow | null> {
    const { rows } = await pool.query('SELECT * FROM stores WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findAllByHousehold(householdId: string): Promise<StoreRow[]> {
    const { rows } = await pool.query(
      'SELECT * FROM stores WHERE household_id = $1 ORDER BY name',
      [householdId]
    );
    return rows;
  },

  async update(id: string, data: { name?: string; brand?: string | null }): Promise<StoreRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.brand !== undefined) {
      fields.push(`brand = $${idx++}`);
      values.push(data.brand);
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE stores SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0];
  },

  async mergeStores(sourceId: string, targetId: string): Promise<void> {
    // Move all receipts from source to target
    await pool.query(
      'UPDATE receipts SET store_id = $1 WHERE store_id = $2',
      [targetId, sourceId]
    );
    // Delete source store
    await pool.query('DELETE FROM stores WHERE id = $1', [sourceId]);
  },
};
