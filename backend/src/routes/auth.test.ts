import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';

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
});
