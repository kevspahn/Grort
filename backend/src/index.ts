import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import householdRoutes from './routes/households';
import uploadRoutes from './routes/upload';
import receiptRoutes from './routes/receipts';
import productRoutes from './routes/products';
import storeRoutes from './routes/stores';
import analyticsRoutes from './routes/analytics';

dotenv.config();

const app = express();

app.use(helmet());
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

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Grort API running on port ${PORT}`);
  });
}

export default app;
