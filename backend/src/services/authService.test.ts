import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { authService } from './authService';

describe('authService', () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-auth.com'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-auth.com'");
    await pool.end();
  });

  it('registers a new user', async () => {
    const result = await authService.register('alice@test-auth.com', 'password123', 'Alice');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('alice@test-auth.com');
    expect(result.user.name).toBe('Alice');
  });

  it('rejects duplicate email', async () => {
    await expect(
      authService.register('alice@test-auth.com', 'password123', 'Alice2')
    ).rejects.toThrow('Email already registered');
  });

  it('logs in with correct credentials', async () => {
    const result = await authService.login('alice@test-auth.com', 'password123');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('alice@test-auth.com');
  });

  it('rejects wrong password', async () => {
    await expect(
      authService.login('alice@test-auth.com', 'wrongpass')
    ).rejects.toThrow('Invalid email or password');
  });

  it('rejects nonexistent email', async () => {
    await expect(
      authService.login('nobody@test-auth.com', 'password123')
    ).rejects.toThrow('Invalid email or password');
  });

  it('verifies JWT token', async () => {
    const result = await authService.register('bob@test-auth.com', 'password123', 'Bob');
    const payload = authService.verifyToken(result.token);
    expect(payload.userId).toBe(result.user.id);
    expect(payload.email).toBe('bob@test-auth.com');
  });

  it('handles Google OAuth new user', async () => {
    const result = await authService.googleAuth('google-123', 'carol@test-auth.com', 'Carol');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('carol@test-auth.com');
  });

  it('handles Google OAuth returning user', async () => {
    const result = await authService.googleAuth('google-123', 'carol@test-auth.com', 'Carol');
    expect(result.user.email).toBe('carol@test-auth.com');
  });
});
