import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import pool from '../db/pool';
import { authService } from '../services/authService';
import { authMiddleware } from './auth';

const app = express();
app.use(express.json());
app.get('/protected', authMiddleware, (req, res) => {
  res.json({ userId: req.user!.id, email: req.user!.email });
});

describe('authMiddleware', () => {
  let token: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-middleware.com'");
    const result = await authService.register('user@test-middleware.com', 'password123', 'User');
    token = result.token;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-middleware.com'");
    await pool.end();
  });

  it('passes with valid token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('user@test-middleware.com');
  });

  it('rejects missing token', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});
