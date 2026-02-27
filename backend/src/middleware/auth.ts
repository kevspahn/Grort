import { Request, Response, NextFunction } from 'express';
import { authService, JwtPayload } from '../services/authService';
import { userRepository, UserRow } from '../repositories/userRepository';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
      jwtPayload?: JwtPayload;
      householdId?: string | null;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = authService.verifyToken(token);
    const user = await userRepository.findById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = user;
    req.jwtPayload = payload;
    req.householdId = user.household_id;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
}

export function requireHousehold(req: Request, res: Response, next: NextFunction) {
  if (!req.householdId) {
    res.status(403).json({ error: 'You must belong to a household to perform this action' });
    return;
  }
  next();
}

export function requireHouseholdOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.household_role !== 'owner') {
    res.status(403).json({ error: 'Only household owners can perform this action' });
    return;
  }
  next();
}
