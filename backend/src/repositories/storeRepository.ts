import pool, { Executor } from '../db/pool';
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
  async create(data: {
    name: string;
    brand: string | null;
    address: string | null;
    householdId: string;
  }, executor: Executor = pool): Promise<StoreRow> {
    const id = uuidv4();
    const { rows } = await executor.query(
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

  async findAllByHousehold(householdId: string, executor: Executor = pool): Promise<StoreRow[]> {
    const { rows } = await executor.query(
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
