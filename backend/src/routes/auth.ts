import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { RegisterSchema, LoginSchema, GoogleAuthSchema } from '../shared/schemas';
import { ZodError } from 'zod';
import { authMiddleware } from '../middleware/auth';

const router = Router();

function handleZodError(res: Response, err: unknown) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.errors });
    return true;
  }
  return false;
}

function decodeJwtPayload(token: string) {
  const segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }

  try {
    const payload = Buffer.from(segments[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

router.post('/register', async (req: Request, res: Response) => {
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

router.post('/login', async (req: Request, res: Response) => {
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

router.post('/google', async (req: Request, res: Response) => {
  try {
    const body = GoogleAuthSchema.parse(req.body);
    const payload = decodeJwtPayload(body.idToken);

    if (!payload) {
      res.status(400).json({ error: 'Invalid Google idToken format' });
      return;
    }

    const tokenGoogleId = typeof payload.sub === 'string' ? payload.sub : null;
    const tokenEmail = typeof payload.email === 'string' ? payload.email : null;
    const tokenName = typeof payload.name === 'string' ? payload.name : null;
    const tokenAud = typeof payload.aud === 'string' ? payload.aud : null;
    const tokenExp = typeof payload.exp === 'number' ? payload.exp : null;

    if (!tokenGoogleId || !tokenEmail) {
      res.status(400).json({ error: 'Google idToken is missing required claims' });
      return;
    }

    if (tokenGoogleId !== body.googleId || tokenEmail !== body.email) {
      res.status(401).json({ error: 'Google token claims did not match supplied user info' });
      return;
    }

    if (tokenName && tokenName !== body.name) {
      res.status(401).json({ error: 'Google token name did not match supplied user info' });
      return;
    }

    if (tokenExp && tokenExp * 1000 <= Date.now()) {
      res.status(401).json({ error: 'Google idToken has expired' });
      return;
    }

    if (process.env.GOOGLE_CLIENT_ID && tokenAud !== process.env.GOOGLE_CLIENT_ID) {
      res.status(401).json({ error: 'Google idToken audience mismatch' });
      return;
    }

    const result = await authService.googleAuth(body.googleId, body.email, body.name);
    res.json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      householdId: req.user!.household_id,
      householdRole: req.user!.household_role,
    },
  });
});

export default router;
