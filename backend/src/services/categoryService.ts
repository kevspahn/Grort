import pool from '../db/pool';

const categoryCache: Map<string, string> = new Map();

export const categoryService = {
  async resolveCategoryId(suggestedCategory: string | null): Promise<string | null> {
    if (!suggestedCategory) return null;

    const normalized = suggestedCategory.trim().toLowerCase();

    // Check cache
    if (categoryCache.has(normalized)) {
      return categoryCache.get(normalized)!;
    }

    // Look up by name (case-insensitive)
    const { rows } = await pool.query(
      'SELECT id FROM categories WHERE LOWER(name) = $1 LIMIT 1',
      [normalized]
    );

    if (rows.length > 0) {
      categoryCache.set(normalized, rows[0].id);
      return rows[0].id;
    }

    // Fallback: "Other" category
    const { rows: otherRows } = await pool.query(
      "SELECT id FROM categories WHERE name = 'Other' AND parent_id IS NULL LIMIT 1"
    );

    if (otherRows.length > 0) {
      categoryCache.set(normalized, otherRows[0].id);
      return otherRows[0].id;
    }

    return null;
  },

  async getAllCategories() {
    const { rows } = await pool.query(
      'SELECT id, name, parent_id FROM categories ORDER BY name'
    );
    return rows;
  },
};
