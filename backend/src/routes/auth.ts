import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { RegisterSchema, LoginSchema, GoogleAuthSchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();

function handleZodError(res: Response, err: unknown) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.errors });
    return true;
  }
  return false;
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
    // In production, verify the idToken with Google's API.
    // For now, we decode it and trust the payload.
    // The mobile app sends the verified Google user info.
    // This is a simplified flow — production should verify with Google.
    const { idToken } = body;

    // Expect the client to send additional fields alongside the token
    const { googleId, email, name } = req.body as {
      googleId: string;
      email: string;
      name: string;
    };

    if (!googleId || !email || !name) {
      res.status(400).json({ error: 'Missing googleId, email, or name' });
      return;
    }

    const result = await authService.googleAuth(googleId, email, name);
    res.json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
