import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';

function createFakeGoogleIdToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('Auth routes', () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-routes.com'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-routes.com'");
    await pool.end();
  });

  describe('POST /auth/register', () => {
    it('registers a new user', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'new@test-routes.com', password: 'password123', name: 'New User' });
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('new@test-routes.com');
    });

    it('rejects duplicate email', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'new@test-routes.com', password: 'password123', name: 'Dup' });
      expect(res.status).toBe(409);
    });

    it('rejects invalid input', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'bad', password: '1', name: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'new@test-routes.com', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('rejects wrong password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'new@test-routes.com', password: 'wrong' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the authenticated user', async () => {
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: 'new@test-routes.com', password: 'password123' });

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('new@test-routes.com');
    });
  });

  describe('POST /auth/google', () => {
    it('rejects mismatched Google token claims', async () => {
      const idToken = createFakeGoogleIdToken({
        sub: 'google-123',
        email: 'actual@test-routes.com',
        name: 'Actual User',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await request(app)
        .post('/auth/google')
        .send({
          idToken,
          googleId: 'google-123',
          email: 'spoofed@test-routes.com',
          name: 'Actual User',
        });

      expect(res.status).toBe(401);
    });

    it('accepts matching Google token claims', async () => {
      const idToken = createFakeGoogleIdToken({
        sub: 'google-456',
        email: 'google@test-routes.com',
        name: 'Google User',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await request(app)
        .post('/auth/google')
        .send({
          idToken,
          googleId: 'google-456',
          email: 'google@test-routes.com',
          name: 'Google User',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('google@test-routes.com');
    });
  });
});
