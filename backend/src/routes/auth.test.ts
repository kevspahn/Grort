import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';
import { googleAuthService, GoogleAuthError } from '../services/googleAuthService';

describe('Auth routes', () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-routes.com'");
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
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
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        iss: 'https://accounts.google.com',
        sub: 'google-123',
        email: 'actual@test-routes.com',
        name: 'Actual User',
        aud: 'test-google-client-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await request(app)
        .post('/auth/google')
        .send({
          idToken: 'verified-token',
          googleId: 'google-123',
          email: 'spoofed@test-routes.com',
          name: 'Actual User',
        });

      expect(res.status).toBe(401);
    });

    it('accepts matching Google token claims', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        iss: 'https://accounts.google.com',
        sub: 'google-456',
        email: 'google@test-routes.com',
        name: 'Google User',
        aud: 'test-google-client-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await request(app)
        .post('/auth/google')
        .send({
          idToken: 'verified-token',
          googleId: 'google-456',
          email: 'google@test-routes.com',
          name: 'Google User',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('google@test-routes.com');
    });

    it('rejects invalid Google tokens', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockRejectedValue(
        new GoogleAuthError('Invalid Google idToken')
      );

      const res = await request(app)
        .post('/auth/google')
        .send({
          idToken: 'bad-token',
          googleId: 'google-789',
          email: 'google-invalid@test-routes.com',
          name: 'Invalid User',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid Google idToken');
    });

    it('returns a server error when Google auth is not configured', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockRejectedValue(
        new GoogleAuthError('Google auth is not configured on the server', 500)
      );

      const res = await request(app)
        .post('/auth/google')
        .send({
          idToken: 'verified-token',
          googleId: 'google-999',
          email: 'google-config@test-routes.com',
          name: 'Config User',
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Google auth is not configured on the server');
    });
  });
});
