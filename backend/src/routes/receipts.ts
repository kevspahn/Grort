import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { storageService } from '../services/storageService';
import { receiptProcessingService } from '../services/receiptProcessingService';
import { receiptRepository } from '../repositories/receiptRepository';
import { ReceiptsQuerySchema, UpdateReceiptItemSchema } from '../shared/schemas';
import { ZodError } from 'zod';
import { ReceiptParseError } from '../ai/parseResponse';

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
});

// POST /receipts/scan — upload and parse receipt
router.post('/scan', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    // Upload image
    const imageUrl = await storageService.uploadImage(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    // Process receipt
    const result = await receiptProcessingService.processReceipt(
      imageUrl,
      req.user!.id,
      req.householdId || null
    );

    res.status(201).json(result);
  } catch (err) {
    console.error('Receipt scan error:', err);
    if (err instanceof ReceiptParseError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(500).json({ error: `Receipt processing failed: ${err.message}` });
      return;
    }
    res.status(500).json({ error: 'Receipt processing failed' });
  }
});

// GET /receipts — list receipts
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = ReceiptsQuerySchema.parse(req.query);

    let result;
    if (req.householdId) {
      result = await receiptRepository.findByHousehold(req.householdId, {
        page: query.page,
        limit: query.limit,
        storeId: query.storeId,
        startDate: query.startDate,
        endDate: query.endDate,
      });
    } else {
      result = await receiptRepository.findByUser(req.user!.id, {
        page: query.page,
        limit: query.limit,
        storeId: query.storeId,
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    res.json({
      items: result.receipts,
      total: result.total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(result.total / query.limit),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /receipts/:id — receipt detail with items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const receipt = await receiptRepository.findById(req.params.id);
    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    // Verify ownership
    if (req.householdId && receipt.household_id !== req.householdId) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    if (!req.householdId && receipt.user_id !== req.user!.id) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    const items = await receiptRepository.findItemsByReceiptId(receipt.id);

    // Generate a signed URL for the receipt image
    let signedImageUrl: string | null = null;
    if (receipt.image_url) {
      try {
        signedImageUrl = await storageService.getSignedUrl(receipt.image_url);
      } catch {
        // Image may have been deleted; don't fail the whole response
      }
    }

    res.json({
      ...receipt,
      signedImageUrl,
      items,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /receipts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const receipt = await receiptRepository.findById(req.params.id);
    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    // Verify ownership
    if (req.householdId && receipt.household_id !== req.householdId) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    if (!req.householdId && receipt.user_id !== req.user!.id) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    // Delete image from storage
    try {
      await storageService.deleteImage(receipt.image_url);
    } catch {
      // Non-fatal: image cleanup failure shouldn't block receipt deletion
    }

    await receiptRepository.deleteById(receipt.id);
    res.json({ message: 'Receipt deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /receipts/:id/items/:itemId — edit a receipt item
router.put('/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    const body = UpdateReceiptItemSchema.parse(req.body);

    // Verify receipt ownership first
    const receipt = await receiptRepository.findById(req.params.id);
    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    if (req.householdId && receipt.household_id !== req.householdId) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    const updatedItem = await receiptRepository.updateItem(req.params.itemId, {
      nameOnReceipt: body.nameOnReceipt,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      totalPrice: body.totalPrice,
      categoryId: body.categoryId,
      productId: body.productId,
    });

    res.json(updatedItem);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
