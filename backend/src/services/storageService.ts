import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../uploads');

function isLocalMode(): boolean {
  return process.env.STORAGE_MODE === 'local';
}

let _s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });
  }
  return _s3Client;
}

const BUCKET = process.env.S3_BUCKET || 'grort-receipts';

export const storageService = {
  async uploadImage(
    fileBuffer: Buffer,
    mimeType: string,
    originalFilename: string
  ): Promise<string> {
    const ext = path.extname(originalFilename) || '.jpg';
    const key = `receipts/${uuidv4()}${ext}`;

    if (isLocalMode()) {
      const filePath = path.join(LOCAL_UPLOAD_DIR, key);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, fileBuffer);
      return `local://${key}`;
    }

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      })
    );

    return `s3://${BUCKET}/${key}`;
  },

  async getSignedUrl(imageUrl: string): Promise<string> {
    if (imageUrl.startsWith('local://')) {
      const key = imageUrl.replace('local://', '');
      return `http://localhost:3000/uploads/${key}`;
    }

    const match = imageUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error('Invalid image URL format');

    const [, bucket, key] = match;
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
  },

  async deleteImage(imageUrl: string): Promise<void> {
    if (imageUrl.startsWith('local://')) {
      const key = imageUrl.replace('local://', '');
      const filePath = path.join(LOCAL_UPLOAD_DIR, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    }

    const match = imageUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error('Invalid image URL format');

    const [, bucket, key] = match;
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key })
    );
  },
};
