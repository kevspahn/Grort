import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository, UserRow } from '../repositories/userRepository';

// Refuse to boot in production with a missing/placeholder secret — otherwise
// every token would be forgeable with the well-known fallback value.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '7d';

export interface JwtPayload {
  userId: string;
  email: string;
  tokenVersion: number;
}

function generateToken(user: UserRow): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    tokenVersion: user.token_version ?? 0,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function formatUserResponse(user: UserRow) {
  return {
    token: generateToken(user),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: user.household_id,
      householdRole: user.household_role as 'owner' | 'member' | null,
    },
  };
}

export const authService = {
  async register(email: string, password: string, name: string) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new Error('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepository.create({ email, passwordHash, name });
    return formatUserResponse(user);
  },

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.password_hash) {
      throw new Error('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }
    return formatUserResponse(user);
  },

  async googleAuth(googleId: string, email: string, name: string) {
    // Check if user exists by Google ID
    let user = await userRepository.findByGoogleId(googleId);
    if (user) {
      return formatUserResponse(user);
    }

    // Check if user exists by email (link accounts)
    user = await userRepository.findByEmail(email);
    if (user) {
      await userRepository.updateGoogleId(user.id, googleId);
      user = (await userRepository.findById(user.id))!;
      return formatUserResponse(user);
    }

    // Create new user
    user = await userRepository.create({
      email,
      passwordHash: null,
      name,
      googleId,
    });
    return formatUserResponse(user);
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(userId);
    if (!user || !user.password_hash) {
      throw new Error('Cannot change password for this account');
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await userRepository.updatePassword(userId, passwordHash);
    // Return a fresh token so the caller stays logged in on this device.
    return formatUserResponse(updated);
  },

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  },
};
