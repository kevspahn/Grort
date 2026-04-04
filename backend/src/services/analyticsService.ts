import pool from '../db/pool';

interface SpendingOptions {
  period: 'week' | 'month';
  startDate?: string;
  endDate?: string;
  scope: 'personal' | 'household';
  userId: string;
  householdId: string | null;
}

export const analyticsService = {
  async getSpending(options: SpendingOptions) {
    const { period, startDate, endDate, scope, userId, householdId } = options;

    // Build WHERE clause
    let whereClause: string;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (scope === 'household' && householdId) {
      whereClause = `r.household_id = $${paramIdx++}`;
      params.push(householdId);
    } else {
      whereClause = `r.user_id = $${paramIdx++}`;
      params.push(userId);
    }

    if (startDate) {
      whereClause += ` AND r.receipt_date >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ` AND r.receipt_date <= $${paramIdx++}`;
      params.push(endDate);
    }

    // Total spending
    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(r.total), 0) as total_spent FROM receipts r WHERE ${whereClause}`,
      params
    );
    const totalSpent = Number(totalResult.rows[0].total_spent);

    // Period breakdown
    const dateTrunc = period === 'week' ? 'week' : 'month';
    const periodResult = await pool.query(
      `SELECT
        DATE_TRUNC('${dateTrunc}', r.receipt_date) as period_start,
        SUM(r.total) as total
       FROM receipts r
       WHERE ${whereClause}
       GROUP BY period_start
       ORDER BY period_start`,
      params
    );
    const periodBreakdown = periodResult.rows.map((r: any) => ({
      period: r.period_start.toISOString().split('T')[0],
      total: Number(r.total),
    }));

    // Category breakdown
    const categoryResult = await pool.query(
      `SELECT
        c.id as category_id,
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(ri.total_price) as total
       FROM receipt_items ri
       JOIN receipts r ON ri.receipt_id = r.id
       LEFT JOIN categories c ON ri.category_id = c.id
       WHERE ${whereClause}
       GROUP BY c.id, c.name
       ORDER BY total DESC`,
      params
    );
    const categoryTotal = categoryResult.rows.reduce(
      (sum: number, r: any) => sum + Number(r.total), 0
    );
    const categoryBreakdown = categoryResult.rows.map((r: any) => ({
      categoryId: r.category_id,
      categoryName: r.category_name,
      total: Number(r.total),
      percentage: categoryTotal > 0 ? Math.round((Number(r.total) / categoryTotal) * 10000) / 100 : 0,
    }));

    return {
      totalSpent,
      periodBreakdown,
      categoryBreakdown,
    };
  },

  async getCategoryItems(options: {
    categoryId: string | null;
    scope: 'personal' | 'household';
    userId: string;
    householdId: string | null;
  }) {
    const { categoryId, scope, userId, householdId } = options;

    let whereClause: string;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (scope === 'household' && householdId) {
      whereClause = `r.household_id = $${paramIdx++}`;
      params.push(householdId);
    } else {
      whereClause = `r.user_id = $${paramIdx++}`;
      params.push(userId);
    }

    if (categoryId) {
      whereClause += ` AND ri.category_id = $${paramIdx++}`;
      params.push(categoryId);
    } else {
      whereClause += ' AND ri.category_id IS NULL';
    }

    const { rows } = await pool.query(
      `SELECT
        ri.name_on_receipt,
        MAX(ri.product_id) as product_id,
        MAX(p.canonical_name) as product_name,
        SUM(ri.quantity) as total_quantity,
        SUM(ri.total_price) as total_cost,
        COUNT(*) as purchase_count
       FROM receipt_items ri
       JOIN receipts r ON ri.receipt_id = r.id
       LEFT JOIN products p ON ri.product_id = p.id
       WHERE ${whereClause}
       GROUP BY ri.name_on_receipt
       ORDER BY total_cost DESC`,
      params
    );

    return rows.map((r: any) => ({
      name: r.name_on_receipt,
      productId: r.product_id,
      productName: r.product_name,
      totalQuantity: Number(r.total_quantity),
      totalCost: Number(r.total_cost),
      purchaseCount: Number(r.purchase_count),
    }));
  },

  async getPriceHistory(
    productId: string,
    householdId: string,
    options?: { startDate?: string; endDate?: string }
  ) {
    let whereClause = 'ri.product_id = $1 AND r.household_id = $2';
    const params: unknown[] = [productId, householdId];
    let paramIdx = 3;

    if (options?.startDate) {
      whereClause += ` AND r.receipt_date >= $${paramIdx++}`;
      params.push(options.startDate);
    }
    if (options?.endDate) {
      whereClause += ` AND r.receipt_date <= $${paramIdx++}`;
      params.push(options.endDate);
    }

    const { rows } = await pool.query(
      `SELECT
        r.receipt_date as date,
        (ri.total_price / ri.quantity) as price,
        s.id as store_id,
        s.name as store_name
       FROM receipt_items ri
       JOIN receipts r ON ri.receipt_id = r.id
       JOIN stores s ON r.store_id = s.id
       WHERE ${whereClause}
       ORDER BY r.receipt_date`,
      params
    );

    // Get product name
    const productResult = await pool.query(
      'SELECT canonical_name FROM products WHERE id = $1',
      [productId]
    );

    return {
      productId,
      productName: productResult.rows[0]?.canonical_name || 'Unknown',
      dataPoints: rows.map((r: any) => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
        price: Number(r.price),
        storeId: r.store_id,
        storeName: r.store_name,
      })),
    };
  },

  async getStoreComparison(productIds: string[], householdId: string) {
    const comparisons = [];

    for (const productId of productIds) {
      const { rows } = await pool.query(
        `SELECT
          s.id as store_id,
          s.name as store_name,
          AVG(ri.total_price / ri.quantity) as avg_price,
          MIN(ri.total_price / ri.quantity) as min_price,
          MAX(ri.total_price / ri.quantity) as max_price,
          COUNT(*) as data_points
         FROM receipt_items ri
         JOIN receipts r ON ri.receipt_id = r.id
         JOIN stores s ON r.store_id = s.id
         WHERE ri.product_id = $1 AND r.household_id = $2
         GROUP BY s.id, s.name
         ORDER BY avg_price`,
        [productId, householdId]
      );

      const productResult = await pool.query(
        'SELECT canonical_name FROM products WHERE id = $1',
        [productId]
      );

      const stores = rows.map((r: any) => ({
        storeId: r.store_id,
        storeName: r.store_name,
        avgPrice: Math.round(Number(r.avg_price) * 100) / 100,
        minPrice: Number(r.min_price),
        maxPrice: Number(r.max_price),
        dataPoints: Number(r.data_points),
      }));

      comparisons.push({
        productId,
        productName: productResult.rows[0]?.canonical_name || 'Unknown',
        stores,
        cheapestStoreId: stores.length > 0 ? stores[0].storeId : null,
      });
    }

    return { comparisons };
  },
};
