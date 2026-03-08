import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// Set local mode for testing
process.env.STORAGE_MODE = 'local';
process.env.PORT = '3001';

import { storageService } from './storageService';

const uploadsDir = path.join(__dirname, '../../uploads');

describe('storageService (local mode)', () => {
  afterAll(() => {
    // Clean up uploads
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it('uploads an image locally', async () => {
    const buffer = Buffer.from('fake-image-data');
    const url = await storageService.uploadImage(buffer, 'image/jpeg', 'test.jpg');
    expect(url).toMatch(/^local:\/\/receipts\/.+\.jpg$/);
  });

  it('gets a signed URL for local image', async () => {
    const buffer = Buffer.from('fake-image-data');
    const url = await storageService.uploadImage(buffer, 'image/jpeg', 'test2.jpg');
    const signedUrl = await storageService.getSignedUrl(url);
    expect(signedUrl).toMatch(/^http:\/\/localhost:3001\/uploads\/receipts\//);
  });

  it('deletes a local image', async () => {
    const buffer = Buffer.from('fake-image-data');
    const url = await storageService.uploadImage(buffer, 'image/jpeg', 'test3.jpg');
    await storageService.deleteImage(url);
    const key = url.replace('local://', '');
    const filePath = path.join(uploadsDir, key);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
