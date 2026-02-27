import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import app from '../index';
import pool from '../db/pool';
import { authService } from '../services/authService';

process.env.STORAGE_MODE = 'local';

describe('Upload routes', () => {
  let token: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-upload.com'");
    const result = await authService.register('uploader@test-upload.com', 'password123', 'Uploader');
    token = result.token;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-upload.com'");
    // Clean up uploads
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
    await pool.end();
  });

  it('uploads an image', async () => {
    const fakeImage = Buffer.from('fake-jpeg-data');
    const res = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', fakeImage, { filename: 'receipt.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBeDefined();
    expect(res.body.signedUrl).toBeDefined();
  });

  it('rejects upload without auth', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('image', Buffer.from('data'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  it('rejects non-image file', async () => {
    const res = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('data'), { filename: 'file.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });
});
