import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { googleAuthService, GoogleAuthError } from '../services/googleAuthService';
import { RegisterSchema, LoginSchema, GoogleAuthSchema, ChangePasswordSchema } from '../shared/schemas';
import { ZodError } from 'zod';
import { authMiddleware } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Throttle credential endpoints to blunt brute-force / credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

function handleZodError(res: Response, err: unknown) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.issues });
    return true;
  }
  return false;
}

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const result = await authService.register(body.email, body.password, body.name);
    res.status(201).json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    if (err instanceof Error && err.message === 'Email already registered') {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const body = LoginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password);
    res.json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    if (err instanceof Error && err.message === 'Invalid email or password') {
      res.status(401).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/google', authLimiter, async (req: Request, res: Response) => {
  try {
    const body = GoogleAuthSchema.parse(req.body);
    const payload = await googleAuthService.verifyIdToken(body.idToken);

    const tokenGoogleId = payload.sub;
    const tokenEmail = payload.email;
    const tokenName = payload.name ?? null;

    if (tokenGoogleId !== body.googleId || tokenEmail !== body.email) {
      res.status(401).json({ error: 'Google token claims did not match supplied user info' });
      return;
    }

    if (tokenName && tokenName !== body.name) {
      res.status(401).json({ error: 'Google token name did not match supplied user info' });
      return;
    }

    const result = await authService.googleAuth(body.googleId, body.email, body.name);
    res.json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    if (err instanceof GoogleAuthError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = (await import('../db/pool')).default;
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM receipts WHERE user_id = $1',
      [req.user!.id]
    );
    const receiptCount = countResult.rows[0].count;

    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        householdId: req.user!.household_id,
        householdRole: req.user!.household_role,
        receiptCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const body = ChangePasswordSchema.parse(req.body);
    const result = await authService.changePassword(
      req.user!.id,
      body.currentPassword,
      body.newPassword
    );
    res.json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    if (err instanceof Error && (
      err.message === 'Current password is incorrect' ||
      err.message === 'Cannot change password for this account'
    )) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
