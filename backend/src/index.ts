import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth';
import householdRoutes from './routes/households';
import uploadRoutes from './routes/upload';
import receiptRoutes from './routes/receipts';
import productRoutes from './routes/products';
import storeRoutes from './routes/stores';
import analyticsRoutes from './routes/analytics';

dotenv.config();

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.nyc3.digitaloceanspaces.com", "https://nyc3.digitaloceanspaces.com"],
      connectSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "data:"],
    },
  },
}));
app.use(cors());
app.use(express.json());

// Serve local uploads in dev mode
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/households', householdRoutes);
app.use('/upload', uploadRoutes);
app.use('/receipts', receiptRoutes);
app.use('/products', productRoutes);
app.use('/stores', storeRoutes);
app.use('/analytics', analyticsRoutes);

// Serve Expo web build if the public directory exists (production)
const publicDir = path.join(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  // Hashed assets get long cache
  app.use(express.static(publicDir, {
    maxAge: '1y',
    immutable: true,
    setHeaders(res, filePath) {
      // index.html and service worker must not be cached
      if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // Client-side routing catch-all (Express 5 requires named param)
  app.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Grort API running on port ${PORT}`);
  });
}

export default app;
