import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface ReceiptRow {
  id: string;
  user_id: string;
  household_id: string | null;
  store_id: string;
  receipt_date: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  image_url: string;
  raw_ai_response: unknown;
  created_at: Date;
  store_name?: string | null;
}

export interface ReceiptItemRow {
  id: string;
  receipt_id: string;
  product_id: string | null;
  name_on_receipt: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
  category_id: string | null;
  created_at: Date;
}

export const receiptRepository = {
  async create(data: {
    userId: string;
    householdId: string | null;
    storeId: string;
    receiptDate: string;
    subtotal: number | null;
    tax: number | null;
    total: number;
    imageUrl: string;
    rawAiResponse: unknown;
  }): Promise<ReceiptRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO receipts (id, user_id, household_id, store_id, receipt_date, subtotal, tax, total, image_url, raw_ai_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, data.userId, data.householdId, data.storeId, data.receiptDate, data.subtotal, data.tax, data.total, data.imageUrl, JSON.stringify(data.rawAiResponse)]
    );
    return rows[0];
  },

  async createItem(data: {
    receiptId: string;
    productId: string | null;
    nameOnReceipt: string;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number;
    categoryId: string | null;
  }): Promise<ReceiptItemRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO receipt_items (id, receipt_id, product_id, name_on_receipt, quantity, unit_price, total_price, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, data.receiptId, data.productId, data.nameOnReceipt, data.quantity, data.unitPrice, data.totalPrice, data.categoryId]
    );
    return rows[0];
  },

  async findById(id: string): Promise<ReceiptRow | null> {
    const { rows } = await pool.query(
      `SELECT r.*, s.name as store_name
       FROM receipts r
       LEFT JOIN stores s ON r.store_id = s.id
       WHERE r.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findItemsByReceiptId(receiptId: string): Promise<ReceiptItemRow[]> {
    const { rows } = await pool.query(
      `SELECT ri.*, p.canonical_name as product_name, c.name as category_name
       FROM receipt_items ri
       LEFT JOIN products p ON ri.product_id = p.id
       LEFT JOIN categories c ON ri.category_id = c.id
       WHERE ri.receipt_id = $1
       ORDER BY ri.created_at`,
      [receiptId]
    );
    return rows;
  },

  async findByHousehold(
    householdId: string,
    options: {
      page: number;
      limit: number;
      storeId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ receipts: ReceiptRow[]; total: number }> {
    let whereClause = 'WHERE r.household_id = $1';
    const params: unknown[] = [householdId];
    let paramIdx = 2;

    if (options.storeId) {
      whereClause += ` AND r.store_id = $${paramIdx++}`;
      params.push(options.storeId);
    }
    if (options.startDate) {
      whereClause += ` AND r.receipt_date >= $${paramIdx++}`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      whereClause += ` AND r.receipt_date <= $${paramIdx++}`;
      params.push(options.endDate);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM receipts r ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const offset = (options.page - 1) * options.limit;
    params.push(options.limit, offset);

    const { rows } = await pool.query(
      `SELECT r.*, s.name as store_name,
        (SELECT COUNT(*) FROM receipt_items WHERE receipt_id = r.id) as item_count
       FROM receipts r
       LEFT JOIN stores s ON r.store_id = s.id
       ${whereClause}
       ORDER BY r.receipt_date DESC, r.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    return { receipts: rows, total };
  },

  async findByUser(
    userId: string,
    options: {
      page: number;
      limit: number;
      storeId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ receipts: ReceiptRow[]; total: number }> {
    let whereClause = 'WHERE r.user_id = $1 AND r.household_id IS NULL';
    const params: unknown[] = [userId];
    let paramIdx = 2;

    if (options.storeId) {
      whereClause += ` AND r.store_id = $${paramIdx++}`;
      params.push(options.storeId);
    }
    if (options.startDate) {
      whereClause += ` AND r.receipt_date >= $${paramIdx++}`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      whereClause += ` AND r.receipt_date <= $${paramIdx++}`;
      params.push(options.endDate);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM receipts r ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const offset = (options.page - 1) * options.limit;
    params.push(options.limit, offset);

    const { rows } = await pool.query(
      `SELECT r.*, s.name as store_name,
        (SELECT COUNT(*) FROM receipt_items WHERE receipt_id = r.id) as item_count
       FROM receipts r
       LEFT JOIN stores s ON r.store_id = s.id
       ${whereClause}
       ORDER BY r.receipt_date DESC, r.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    return { receipts: rows, total };
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM receipts WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async updateItem(
    itemId: string,
    data: {
      nameOnReceipt?: string;
      quantity?: number;
      unitPrice?: number | null;
      totalPrice?: number;
      categoryId?: string | null;
      productId?: string | null;
    }
  ): Promise<ReceiptItemRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.nameOnReceipt !== undefined) {
      fields.push(`name_on_receipt = $${idx++}`);
      values.push(data.nameOnReceipt);
    }
    if (data.quantity !== undefined) {
      fields.push(`quantity = $${idx++}`);
      values.push(data.quantity);
    }
    if (data.unitPrice !== undefined) {
      fields.push(`unit_price = $${idx++}`);
      values.push(data.unitPrice);
    }
    if (data.totalPrice !== undefined) {
      fields.push(`total_price = $${idx++}`);
      values.push(data.totalPrice);
    }
    if (data.categoryId !== undefined) {
      fields.push(`category_id = $${idx++}`);
      values.push(data.categoryId);
    }
    if (data.productId !== undefined) {
      fields.push(`product_id = $${idx++}`);
      values.push(data.productId);
    }

    if (fields.length === 0) throw new Error('No fields to update');

    values.push(itemId);
    const { rows } = await pool.query(
      `UPDATE receipt_items SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0];
  },
};
