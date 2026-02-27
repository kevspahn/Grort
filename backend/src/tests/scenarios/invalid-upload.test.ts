import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { authService } from '../../services/authService';

describe('Scenario: Invalid image upload returns appropriate error, no crash', () => {
  let token: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email = 'upload-test@holdout-upload.com'");
    const result = await authService.register('upload-test@holdout-upload.com', 'password123', 'Upload Tester');
    token = result.token;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = 'upload-test@holdout-upload.com'");
    await pool.end();
  });

  it('rejects upload with no file', async () => {
    const res = await request(app)
      .post('/receipts/scan')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejects non-image file type', async () => {
    const res = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('not an image'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('rejects request without auth', async () => {
    const res = await request(app)
      .post('/receipts/scan')
      .attach('image', Buffer.from('data'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  it('server remains responsive after bad request', async () => {
    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');
  });
});
