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
// Restrict CORS to configured origins. Requests without an Origin header
// (native app, curl, same-origin) are always allowed; browsers from unknown
// web origins are rejected. Configure via CORS_ORIGINS (comma-separated).
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://grort.app')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  })
);
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

// Global error handler — last middleware. Guarantees no internal error text,
// stack trace, or file path ever reaches the client, regardless of NODE_ENV.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Grort API running on port ${PORT}`);
  });
}

export default app;
