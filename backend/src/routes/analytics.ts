import { Router, Request, Response } from 'express';
import { authMiddleware, requireHousehold } from '../middleware/auth';
import { analyticsService } from '../services/analyticsService';
import { SpendingQuerySchema, PriceHistoryQuerySchema, StoreComparisonQuerySchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();
router.use(authMiddleware);

// GET /analytics/spending
router.get('/spending', async (req: Request, res: Response) => {
  try {
    const query = SpendingQuerySchema.parse(req.query);

    const result = await analyticsService.getSpending({
      period: query.period,
      startDate: query.startDate,
      endDate: query.endDate,
      scope: query.scope,
      userId: req.user!.id,
      householdId: req.householdId || null,
    });

    res.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /analytics/category-items
router.get('/category-items', async (req: Request, res: Response) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const scope = (req.query.scope as string) || 'household';

    const result = await analyticsService.getCategoryItems({
      categoryId: categoryId || null,
      scope: scope as 'personal' | 'household',
      userId: req.user!.id,
      householdId: req.householdId || null,
    });

    res.json(result);
  } catch (err) {
    console.error('Category items error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /analytics/price-history/:productId
router.get('/price-history/:productId', requireHousehold, async (req: Request, res: Response) => {
  try {
    const query = PriceHistoryQuerySchema.parse(req.query);

    const result = await analyticsService.getPriceHistory(
      req.params.productId,
      req.householdId!,
      {
        startDate: query.startDate,
        endDate: query.endDate,
      }
    );

    res.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /analytics/store-comparison
router.get('/store-comparison', requireHousehold, async (req: Request, res: Response) => {
  try {
    const productIdsParam = req.query.productIds;
    let productIds: string[];

    if (Array.isArray(productIdsParam)) {
      productIds = productIdsParam as string[];
    } else if (typeof productIdsParam === 'string') {
      productIds = productIdsParam.split(',');
    } else {
      res.status(400).json({ error: 'productIds query parameter is required' });
      return;
    }

    const query = StoreComparisonQuerySchema.parse({ productIds });

    const result = await analyticsService.getStoreComparison(
      query.productIds,
      req.householdId!
    );

    res.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
