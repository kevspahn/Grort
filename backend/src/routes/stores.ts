import { Router, Request, Response } from 'express';
import { authMiddleware, requireHousehold } from '../middleware/auth';
import { storeRepository } from '../repositories/storeRepository';
import { UpdateStoreSchema, MergeStoresSchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();
router.use(authMiddleware);
router.use(requireHousehold);

// GET /stores
router.get('/', async (req: Request, res: Response) => {
  try {
    const stores = await storeRepository.findAllByHousehold(req.householdId!);
    res.json(stores.map((s) => ({
      id: s.id,
      name: s.name,
      brand: s.brand,
      address: s.address,
      householdId: s.household_id,
      createdAt: s.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /stores/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateStoreSchema.parse(req.body);

    const store = await storeRepository.findById(req.params.id);
    if (!store || store.household_id !== req.householdId) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    const updated = await storeRepository.update(req.params.id, {
      name: body.name,
      brand: body.brand,
    });

    res.json({
      id: updated.id,
      name: updated.name,
      brand: updated.brand,
      address: updated.address,
      householdId: updated.household_id,
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

// POST /stores/merge
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const body = MergeStoresSchema.parse(req.body);

    const source = await storeRepository.findById(body.sourceId);
    const target = await storeRepository.findById(body.targetId);

    if (!source || source.household_id !== req.householdId) {
      res.status(404).json({ error: 'Source store not found' });
      return;
    }
    if (!target || target.household_id !== req.householdId) {
      res.status(404).json({ error: 'Target store not found' });
      return;
    }

    await storeRepository.mergeStores(body.sourceId, body.targetId);

    res.json({ message: 'Stores merged successfully', targetId: body.targetId });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
