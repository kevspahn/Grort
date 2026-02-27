import { Router, Request, Response } from 'express';
import { authMiddleware, requireHousehold } from '../middleware/auth';
import { productRepository } from '../repositories/productRepository';
import { UpdateProductSchema, MergeProductsSchema } from '../shared/schemas';
import { ZodError } from 'zod';
import pool from '../db/pool';

const router = Router();
router.use(authMiddleware);
router.use(requireHousehold);

// GET /products — list products with latest price and frequency
router.get('/', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
        (SELECT ri.total_price / ri.quantity
         FROM receipt_items ri
         JOIN receipts r ON ri.receipt_id = r.id
         WHERE ri.product_id = p.id
         ORDER BY r.receipt_date DESC
         LIMIT 1) as latest_price,
        (SELECT COUNT(*)
         FROM receipt_items ri
         WHERE ri.product_id = p.id) as purchase_count,
        c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.household_id = $1
       ORDER BY p.canonical_name`,
      [req.householdId]
    );

    res.json(rows.map((r: any) => ({
      id: r.id,
      householdId: r.household_id,
      canonicalName: r.canonical_name,
      categoryId: r.category_id,
      categoryName: r.category_name,
      createdAt: r.created_at,
      latestPrice: r.latest_price ? Number(r.latest_price) : null,
      purchaseCount: Number(r.purchase_count),
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /products/:id — edit product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateProductSchema.parse(req.body);

    const product = await productRepository.findById(req.params.id);
    if (!product || product.household_id !== req.householdId) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const updated = await productRepository.update(req.params.id, {
      canonicalName: body.canonicalName,
      categoryId: body.categoryId,
    });

    res.json({
      id: updated.id,
      householdId: updated.household_id,
      canonicalName: updated.canonical_name,
      categoryId: updated.category_id,
      createdAt: updated.created_at,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /products/merge — merge two products
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const body = MergeProductsSchema.parse(req.body);

    const source = await productRepository.findById(body.sourceId);
    const target = await productRepository.findById(body.targetId);

    if (!source || source.household_id !== req.householdId) {
      res.status(404).json({ error: 'Source product not found' });
      return;
    }
    if (!target || target.household_id !== req.householdId) {
      res.status(404).json({ error: 'Target product not found' });
      return;
    }

    await productRepository.mergeProducts(body.sourceId, body.targetId);

    res.json({ message: 'Products merged successfully', targetId: body.targetId });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
