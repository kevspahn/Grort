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
    // Reject tokens issued before the latest password change / revocation.
    if ((payload.tokenVersion ?? 0) !== (user.token_version ?? 0)) {
      res.status(401).json({ error: 'Token has been revoked' });
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

/**
 * For routes with a :id household param — ensure the caller may only act on
 * their OWN household, never another household referenced by URL id.
 */
export function requireOwnHousehold(req: Request, res: Response, next: NextFunction) {
  if (!req.householdId || req.params.id !== req.householdId) {
    res.status(404).json({ error: 'Household not found' });
    return;
  }
  next();
}
