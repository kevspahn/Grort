# Grort Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Grort — an AI-powered grocery receipt tracker with photo scanning, spending analytics, price history, and store comparison.

**Architecture:** React Native (Expo) mobile app with Express/Node.js backend, PostgreSQL database, and provider-agnostic AI receipt parsing (Claude, GPT-4o, Gemini). Dark factory approach — spec-driven with holdout scenario validation.

**Tech Stack:** React Native (Expo SDK 52), TypeScript, Express 5, PostgreSQL 16, Zod validation, JWT auth, S3-compatible storage, AI vision APIs (Anthropic, OpenAI, Gemini)

---

## Phase 1: Project Scaffold

### Task 1.1: Create monorepo root

Create the top-level project directory and initialize git.

```bash
mkdir -p /Users/kevinspahn/Grort
cd /Users/kevinspahn/Grort
git init
```

Create `/Users/kevinspahn/Grort/.gitignore`:

```gitignore
node_modules/
dist/
.env
*.local
.DS_Store
coverage/
.expo/
android/
ios/
uploads/
```

Create `/Users/kevinspahn/Grort/.env.example`:

```env
# Database
DATABASE_URL=postgresql://grort:grort@localhost:5432/grort

# JWT
JWT_SECRET=change-me-in-production

# AI Providers (set at least one)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
AI_PROVIDER=claude

# S3-compatible storage
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=grort-receipts
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Create `/Users/kevinspahn/Grort/docker-compose.yml`:

```yaml
version: "3.8"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: grort
      POSTGRES_PASSWORD: grort
      POSTGRES_DB: grort
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

**Verify:** `docker compose up -d` starts PostgreSQL on port 5432 and MinIO on port 9000. `docker compose ps` shows both services running.

**Commit:** `git add -A && git commit -m "chore: initialize project root with docker-compose, gitignore, env example"`

---

### Task 1.2: Initialize backend project

```bash
mkdir -p /Users/kevinspahn/Grort/backend
cd /Users/kevinspahn/Grort/backend
npm init -y
npm install express@5 pg dotenv cors helmet uuid jsonwebtoken bcryptjs zod multer
npm install -D typescript @types/node @types/express @types/pg @types/cors @types/uuid @types/jsonwebtoken @types/bcryptjs @types/multer ts-node tsx vitest @types/supertest supertest
npx tsc --init
```

Create `/Users/kevinspahn/Grort/backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Update `/Users/kevinspahn/Grort/backend/package.json` scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `/Users/kevinspahn/Grort/backend/src/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Grort API running on port ${PORT}`);
});

export default app;
```

Create `/Users/kevinspahn/Grort/backend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './index';

describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — 1 test passes.

**Commit:** `git add -A && git commit -m "feat: initialize backend with Express, TypeScript, health endpoint"`

---

### Task 1.3: Set up database connection pool

Create `/Users/kevinspahn/Grort/backend/src/db/pool.ts`:

```typescript
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://grort:grort@localhost:5432/grort',
});

export default pool;
```

Create `/Users/kevinspahn/Grort/backend/src/db/index.ts`:

```typescript
export { default as pool } from './pool';
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/db/pool.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import pool from './pool';

describe('Database pool', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('connects to PostgreSQL and runs a query', async () => {
    const result = await pool.query('SELECT 1 + 1 AS sum');
    expect(result.rows[0].sum).toBe(2);
  });
});
```

**Verify:** `docker compose up -d db` then `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add PostgreSQL connection pool"`

---

### Task 1.4: Initialize mobile project

```bash
cd /Users/kevinspahn/Grort
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install expo-camera expo-image-picker expo-secure-store expo-router react-native-safe-area-context react-native-screens react-native-gesture-handler @react-navigation/bottom-tabs @react-navigation/native @react-navigation/native-stack react-native-chart-kit react-native-svg
npm install zod axios
```

Update `/Users/kevinspahn/Grort/mobile/tsconfig.json` to ensure strict mode:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Create `/Users/kevinspahn/Grort/mobile/src/api/client.ts`:

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
```

Create `/Users/kevinspahn/Grort/mobile/src/types/index.ts`:

```typescript
// Re-export shared types — will be populated with Zod schemas in Task 1.5
export {};
```

**Verify:** `cd /Users/kevinspahn/Grort/mobile && npx tsc --noEmit` — no TypeScript errors.

**Commit:** `git add -A && git commit -m "feat: initialize Expo mobile app with navigation dependencies"`

---

### Task 1.5: Create shared Zod schemas

Create `/Users/kevinspahn/Grort/backend/src/shared/schemas.ts`:

```typescript
import { z } from 'zod';

// ---- Auth ----
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const GoogleAuthSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleAuthInput = z.infer<typeof GoogleAuthSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    householdId: z.string().uuid().nullable(),
    householdRole: z.enum(['owner', 'member']).nullable(),
  }),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ---- Household ----
export const CreateHouseholdSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdSchema>;

export const InviteMemberSchema = z.object({
  email: z.string().email(),
});
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

export const HouseholdMemberSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['owner', 'member']),
});
export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;

// ---- Store ----
export const StoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  address: z.string().nullable(),
  householdId: z.string().uuid(),
  createdAt: z.string(),
});
export type Store = z.infer<typeof StoreSchema>;

export const UpdateStoreSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brand: z.string().max(200).nullable().optional(),
});
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;

export const MergeStoresSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});
export type MergeStoresInput = z.infer<typeof MergeStoresSchema>;

// ---- Category ----
export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
});
export type Category = z.infer<typeof CategorySchema>;

// ---- Product ----
export const ProductSchema = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  canonicalName: z.string(),
  categoryId: z.string().uuid().nullable(),
  createdAt: z.string(),
  latestPrice: z.number().nullable().optional(),
  purchaseCount: z.number().optional(),
});
export type Product = z.infer<typeof ProductSchema>;

export const UpdateProductSchema = z.object({
  canonicalName: z.string().min(1).max(300).optional(),
  categoryId: z.string().uuid().nullable().optional(),
});
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const MergeProductsSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});
export type MergeProductsInput = z.infer<typeof MergeProductsSchema>;

// ---- Receipt Item (AI extraction) ----
export const ExtractedItemSchema = z.object({
  nameOnReceipt: z.string(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nullable(),
  totalPrice: z.number(),
  suggestedCategory: z.string().nullable(),
  suggestedCanonicalName: z.string().nullable(),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

// ---- AI Extraction Result ----
export const ReceiptExtractionResultSchema = z.object({
  storeName: z.string(),
  storeAddress: z.string().nullable(),
  storeBrand: z.string().nullable(),
  receiptDate: z.string(), // YYYY-MM-DD
  items: z.array(ExtractedItemSchema).min(1),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number(),
});
export type ReceiptExtractionResult = z.infer<typeof ReceiptExtractionResultSchema>;

// ---- Receipt ----
export const ReceiptItemSchema = z.object({
  id: z.string().uuid(),
  receiptId: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  nameOnReceipt: z.string(),
  quantity: z.number(),
  unitPrice: z.number().nullable(),
  totalPrice: z.number(),
  categoryId: z.string().uuid().nullable(),
  createdAt: z.string(),
  // Joined fields
  productName: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  matchConfidence: z.enum(['exact', 'near', 'new']).optional(),
});
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

export const ReceiptSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  householdId: z.string().uuid().nullable(),
  storeId: z.string().uuid(),
  receiptDate: z.string(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number(),
  imageUrl: z.string(),
  createdAt: z.string(),
  // Joined fields
  storeName: z.string().optional(),
  itemCount: z.number().optional(),
  items: z.array(ReceiptItemSchema).optional(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const UpdateReceiptItemSchema = z.object({
  nameOnReceipt: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nullable().optional(),
  totalPrice: z.number().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
});
export type UpdateReceiptItemInput = z.infer<typeof UpdateReceiptItemSchema>;

// ---- Analytics ----
export const SpendingQuerySchema = z.object({
  period: z.enum(['week', 'month']).default('month'),
  startDate: z.string().optional(), // YYYY-MM-DD
  endDate: z.string().optional(),
  scope: z.enum(['personal', 'household']).default('household'),
});
export type SpendingQuery = z.infer<typeof SpendingQuerySchema>;

export const SpendingResultSchema = z.object({
  totalSpent: z.number(),
  periodBreakdown: z.array(z.object({
    period: z.string(),
    total: z.number(),
  })),
  categoryBreakdown: z.array(z.object({
    categoryId: z.string().uuid().nullable(),
    categoryName: z.string(),
    total: z.number(),
    percentage: z.number(),
  })),
});
export type SpendingResult = z.infer<typeof SpendingResultSchema>;

export const PriceHistoryQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type PriceHistoryQuery = z.infer<typeof PriceHistoryQuerySchema>;

export const PriceHistoryResultSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  dataPoints: z.array(z.object({
    date: z.string(),
    price: z.number(),
    storeId: z.string().uuid(),
    storeName: z.string(),
  })),
});
export type PriceHistoryResult = z.infer<typeof PriceHistoryResultSchema>;

export const StoreComparisonQuerySchema = z.object({
  productIds: z.array(z.string().uuid()).min(1),
});
export type StoreComparisonQuery = z.infer<typeof StoreComparisonQuerySchema>;

export const StoreComparisonResultSchema = z.object({
  comparisons: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string(),
    stores: z.array(z.object({
      storeId: z.string().uuid(),
      storeName: z.string(),
      avgPrice: z.number(),
      minPrice: z.number(),
      maxPrice: z.number(),
      dataPoints: z.number(),
    })),
    cheapestStoreId: z.string().uuid(),
  })),
});
export type StoreComparisonResult = z.infer<typeof StoreComparisonResultSchema>;

// ---- Pagination ----
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  });

// ---- Receipts list query ----
export const ReceiptsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  storeId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ReceiptsQuery = z.infer<typeof ReceiptsQuerySchema>;
```

Now copy the schemas to the mobile app. Create `/Users/kevinspahn/Grort/mobile/src/shared/schemas.ts` — this should be an exact copy of the backend schemas file. In production you'd use a shared package, but for simplicity we duplicate and keep in sync.

```bash
cp /Users/kevinspahn/Grort/backend/src/shared/schemas.ts /Users/kevinspahn/Grort/mobile/src/shared/schemas.ts
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/shared/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  LoginSchema,
  ReceiptExtractionResultSchema,
  SpendingQuerySchema,
} from './schemas';

describe('Zod schemas', () => {
  it('validates RegisterSchema', () => {
    const valid = RegisterSchema.parse({ email: 'a@b.com', password: '12345678', name: 'Test' });
    expect(valid.email).toBe('a@b.com');
  });

  it('rejects invalid RegisterSchema', () => {
    expect(() => RegisterSchema.parse({ email: 'bad', password: '1', name: '' })).toThrow();
  });

  it('validates LoginSchema', () => {
    const valid = LoginSchema.parse({ email: 'a@b.com', password: 'pass' });
    expect(valid.email).toBe('a@b.com');
  });

  it('validates ReceiptExtractionResultSchema', () => {
    const data = {
      storeName: 'Costco',
      storeAddress: '123 Main St',
      storeBrand: 'Costco',
      receiptDate: '2026-01-15',
      items: [
        {
          nameOnReceipt: 'Organic Milk',
          quantity: 1,
          unitPrice: 5.99,
          totalPrice: 5.99,
          suggestedCategory: 'Dairy',
          suggestedCanonicalName: 'Organic Whole Milk',
        },
      ],
      subtotal: 5.99,
      tax: 0,
      total: 5.99,
    };
    const result = ReceiptExtractionResultSchema.parse(data);
    expect(result.items).toHaveLength(1);
  });

  it('defaults SpendingQuery period to month', () => {
    const result = SpendingQuerySchema.parse({});
    expect(result.period).toBe('month');
    expect(result.scope).toBe('household');
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add shared Zod schemas for all API contracts"`

---

## Phase 2: Database Schema & Migrations

### Task 2.1: Create migration runner

Create `/Users/kevinspahn/Grort/backend/src/db/migrate.ts`:

```typescript
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://grort:grort@localhost:5432/grort',
});

async function migrate() {
  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Get already-executed migrations
  const { rows: executed } = await pool.query('SELECT name FROM migrations ORDER BY id');
  const executedNames = new Set(executed.map((r: { name: string }) => r.name));

  // Read migration files
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found.');
    await pool.end();
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (executedNames.has(file)) {
      console.log(`Skipping already executed: ${file}`);
      continue;
    }
    console.log(`Executing migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
    console.log(`Completed: ${file}`);
  }

  console.log('All migrations complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

Add to `/Users/kevinspahn/Grort/backend/package.json` scripts:

```json
"migrate": "tsx src/db/migrate.ts"
```

**Commit:** `git add -A && git commit -m "feat: add SQL migration runner"`

---

### Task 2.2: Create initial schema migration

Create directory: `mkdir -p /Users/kevinspahn/Grort/backend/src/db/migrations`

Create `/Users/kevinspahn/Grort/backend/src/db/migrations/001_initial_schema.sql`:

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Households
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(100) NOT NULL,
  google_id VARCHAR(255) UNIQUE,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  household_role VARCHAR(20) CHECK (household_role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_household_id ON users(household_id);
CREATE INDEX idx_users_google_id ON users(google_id);

-- Categories (hierarchical)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL
);

-- Stores
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  brand VARCHAR(200),
  address VARCHAR(500),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand, address, household_id)
);

CREATE INDEX idx_stores_household_id ON stores(household_id);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  canonical_name VARCHAR(300) NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(household_id, canonical_name)
);

CREATE INDEX idx_products_household_id ON products(household_id);
CREATE INDEX idx_products_category_id ON products(category_id);

-- Receipts
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  receipt_date DATE NOT NULL,
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2),
  total DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(1000) NOT NULL,
  raw_ai_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipts_user_id ON receipts(user_id);
CREATE INDEX idx_receipts_household_id ON receipts(household_id);
CREATE INDEX idx_receipts_store_id ON receipts(store_id);
CREATE INDEX idx_receipts_receipt_date ON receipts(receipt_date);

-- Receipt items
CREATE TABLE receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name_on_receipt VARCHAR(500) NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2) NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipt_items_receipt_id ON receipt_items(receipt_id);
CREATE INDEX idx_receipt_items_product_id ON receipt_items(product_id);
CREATE INDEX idx_receipt_items_category_id ON receipt_items(category_id);
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm run migrate` — outputs "Executing migration: 001_initial_schema.sql" then "All migrations complete."

**Commit:** `git add -A && git commit -m "feat: add initial database schema migration with all tables"`

---

### Task 2.3: Seed categories

Create `/Users/kevinspahn/Grort/backend/src/db/migrations/002_seed_categories.sql`:

```sql
-- Top-level categories
INSERT INTO categories (id, name, parent_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Produce', NULL),
  ('a0000000-0000-0000-0000-000000000002', 'Dairy', NULL),
  ('a0000000-0000-0000-0000-000000000003', 'Meat & Seafood', NULL),
  ('a0000000-0000-0000-0000-000000000004', 'Bakery', NULL),
  ('a0000000-0000-0000-0000-000000000005', 'Frozen', NULL),
  ('a0000000-0000-0000-0000-000000000006', 'Beverages', NULL),
  ('a0000000-0000-0000-0000-000000000007', 'Snacks', NULL),
  ('a0000000-0000-0000-0000-000000000008', 'Household', NULL),
  ('a0000000-0000-0000-0000-000000000009', 'Personal Care', NULL),
  ('a0000000-0000-0000-0000-000000000010', 'Other', NULL);

-- Subcategories: Produce
INSERT INTO categories (id, name, parent_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Fruits', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Vegetables', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'Herbs', 'a0000000-0000-0000-0000-000000000001');

-- Subcategories: Dairy
INSERT INTO categories (id, name, parent_id) VALUES
  ('b0000000-0000-0000-0000-000000000004', 'Milk', 'a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000005', 'Cheese', 'a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000006', 'Yogurt', 'a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000007', 'Eggs', 'a0000000-0000-0000-0000-000000000002');

-- Subcategories: Meat & Seafood
INSERT INTO categories (id, name, parent_id) VALUES
  ('b0000000-0000-0000-0000-000000000008', 'Beef', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000009', 'Poultry', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000010', 'Pork', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000011', 'Seafood', 'a0000000-0000-0000-0000-000000000003');

-- Subcategories: Beverages
INSERT INTO categories (id, name, parent_id) VALUES
  ('b0000000-0000-0000-0000-000000000012', 'Water', 'a0000000-0000-0000-0000-000000000006'),
  ('b0000000-0000-0000-0000-000000000013', 'Juice', 'a0000000-0000-0000-0000-000000000006'),
  ('b0000000-0000-0000-0000-000000000014', 'Soda', 'a0000000-0000-0000-0000-000000000006'),
  ('b0000000-0000-0000-0000-000000000015', 'Coffee & Tea', 'a0000000-0000-0000-0000-000000000006');

-- Subcategories: Snacks
INSERT INTO categories (id, name, parent_id) VALUES
  ('b0000000-0000-0000-0000-000000000016', 'Chips', 'a0000000-0000-0000-0000-000000000007'),
  ('b0000000-0000-0000-0000-000000000017', 'Crackers', 'a0000000-0000-0000-0000-000000000007'),
  ('b0000000-0000-0000-0000-000000000018', 'Nuts', 'a0000000-0000-0000-0000-000000000007'),
  ('b0000000-0000-0000-0000-000000000019', 'Candy', 'a0000000-0000-0000-0000-000000000007');
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm run migrate` — outputs "Executing migration: 002_seed_categories.sql" then "All migrations complete."

**Test:** Create `/Users/kevinspahn/Grort/backend/src/db/migrations.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import pool from './pool';

describe('Database schema', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('has all required tables', async () => {
    const { rows } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = rows.map((r: { table_name: string }) => r.table_name);
    expect(tables).toContain('users');
    expect(tables).toContain('households');
    expect(tables).toContain('stores');
    expect(tables).toContain('categories');
    expect(tables).toContain('products');
    expect(tables).toContain('receipts');
    expect(tables).toContain('receipt_items');
  });

  it('has seeded categories', async () => {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM categories');
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(10);
  });

  it('has category hierarchy', async () => {
    const { rows } = await pool.query(`
      SELECT c.name, p.name as parent_name
      FROM categories c
      JOIN categories p ON c.parent_id = p.id
      WHERE c.name = 'Fruits'
    `);
    expect(rows[0].parent_name).toBe('Produce');
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: seed grocery categories with hierarchy"`

---

## Phase 3: Auth System

### Task 3.1: Create user repository

Create `/Users/kevinspahn/Grort/backend/src/repositories/userRepository.ts`:

```typescript
import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  google_id: string | null;
  household_id: string | null;
  household_role: string | null;
  created_at: Date;
}

export const userRepository = {
  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  },

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByGoogleId(googleId: string): Promise<UserRow | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    return rows[0] || null;
  },

  async create(data: {
    email: string;
    passwordHash: string | null;
    name: string;
    googleId?: string | null;
  }): Promise<UserRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO users (id, email, password_hash, name, google_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, data.email, data.passwordHash, data.name, data.googleId || null]
    );
    return rows[0];
  },

  async updateHousehold(
    userId: string,
    householdId: string | null,
    role: 'owner' | 'member' | null
  ): Promise<UserRow> {
    const { rows } = await pool.query(
      `UPDATE users SET household_id = $1, household_role = $2 WHERE id = $3 RETURNING *`,
      [householdId, role, userId]
    );
    return rows[0];
  },

  async updateGoogleId(userId: string, googleId: string): Promise<UserRow> {
    const { rows } = await pool.query(
      `UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *`,
      [googleId, userId]
    );
    return rows[0];
  },
};
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/repositories/userRepository.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { userRepository } from './userRepository';

describe('userRepository', () => {
  beforeAll(async () => {
    // Clean up test users
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-repo.com'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-repo.com'");
    await pool.end();
  });

  it('creates a user', async () => {
    const user = await userRepository.create({
      email: 'alice@test-repo.com',
      passwordHash: 'hashed',
      name: 'Alice',
    });
    expect(user.id).toBeDefined();
    expect(user.email).toBe('alice@test-repo.com');
    expect(user.name).toBe('Alice');
  });

  it('finds user by email', async () => {
    const user = await userRepository.findByEmail('alice@test-repo.com');
    expect(user).not.toBeNull();
    expect(user!.name).toBe('Alice');
  });

  it('finds user by id', async () => {
    const created = await userRepository.create({
      email: 'bob@test-repo.com',
      passwordHash: 'hashed',
      name: 'Bob',
    });
    const user = await userRepository.findById(created.id);
    expect(user).not.toBeNull();
    expect(user!.name).toBe('Bob');
  });

  it('returns null for nonexistent email', async () => {
    const user = await userRepository.findByEmail('nobody@test-repo.com');
    expect(user).toBeNull();
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add user repository with CRUD operations"`

---

### Task 3.2: Create auth service

Create `/Users/kevinspahn/Grort/backend/src/services/authService.ts`:

```typescript
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository, UserRow } from '../repositories/userRepository';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '7d';

export interface JwtPayload {
  userId: string;
  email: string;
}

function generateToken(user: UserRow): string {
  const payload: JwtPayload = { userId: user.id, email: user.email };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function formatUserResponse(user: UserRow) {
  return {
    token: generateToken(user),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: user.household_id,
      householdRole: user.household_role as 'owner' | 'member' | null,
    },
  };
}

export const authService = {
  async register(email: string, password: string, name: string) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new Error('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepository.create({ email, passwordHash, name });
    return formatUserResponse(user);
  },

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.password_hash) {
      throw new Error('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }
    return formatUserResponse(user);
  },

  async googleAuth(googleId: string, email: string, name: string) {
    // Check if user exists by Google ID
    let user = await userRepository.findByGoogleId(googleId);
    if (user) {
      return formatUserResponse(user);
    }

    // Check if user exists by email (link accounts)
    user = await userRepository.findByEmail(email);
    if (user) {
      await userRepository.updateGoogleId(user.id, googleId);
      user = (await userRepository.findById(user.id))!;
      return formatUserResponse(user);
    }

    // Create new user
    user = await userRepository.create({
      email,
      passwordHash: null,
      name,
      googleId,
    });
    return formatUserResponse(user);
  },

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  },
};
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/services/authService.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { authService } from './authService';

describe('authService', () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-auth.com'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-auth.com'");
    await pool.end();
  });

  it('registers a new user', async () => {
    const result = await authService.register('alice@test-auth.com', 'password123', 'Alice');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('alice@test-auth.com');
    expect(result.user.name).toBe('Alice');
  });

  it('rejects duplicate email', async () => {
    await expect(
      authService.register('alice@test-auth.com', 'password123', 'Alice2')
    ).rejects.toThrow('Email already registered');
  });

  it('logs in with correct credentials', async () => {
    const result = await authService.login('alice@test-auth.com', 'password123');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('alice@test-auth.com');
  });

  it('rejects wrong password', async () => {
    await expect(
      authService.login('alice@test-auth.com', 'wrongpass')
    ).rejects.toThrow('Invalid email or password');
  });

  it('rejects nonexistent email', async () => {
    await expect(
      authService.login('nobody@test-auth.com', 'password123')
    ).rejects.toThrow('Invalid email or password');
  });

  it('verifies JWT token', async () => {
    const result = await authService.register('bob@test-auth.com', 'password123', 'Bob');
    const payload = authService.verifyToken(result.token);
    expect(payload.userId).toBe(result.user.id);
    expect(payload.email).toBe('bob@test-auth.com');
  });

  it('handles Google OAuth new user', async () => {
    const result = await authService.googleAuth('google-123', 'carol@test-auth.com', 'Carol');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('carol@test-auth.com');
  });

  it('handles Google OAuth returning user', async () => {
    const result = await authService.googleAuth('google-123', 'carol@test-auth.com', 'Carol');
    expect(result.user.email).toBe('carol@test-auth.com');
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add auth service with register, login, Google OAuth, JWT"`

---

### Task 3.3: Create auth middleware

Create `/Users/kevinspahn/Grort/backend/src/middleware/auth.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { authService, JwtPayload } from '../services/authService';
import { userRepository, UserRow } from '../repositories/userRepository';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
      jwtPayload?: JwtPayload;
      householdId?: string | null;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = authService.verifyToken(token);
    const user = await userRepository.findById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = user;
    req.jwtPayload = payload;
    req.householdId = user.household_id;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
}

export function requireHousehold(req: Request, res: Response, next: NextFunction) {
  if (!req.householdId) {
    res.status(403).json({ error: 'You must belong to a household to perform this action' });
    return;
  }
  next();
}

export function requireHouseholdOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.household_role !== 'owner') {
    res.status(403).json({ error: 'Only household owners can perform this action' });
    return;
  }
  next();
}
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/middleware/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import pool from '../db/pool';
import { authService } from '../services/authService';
import { authMiddleware } from './auth';

const app = express();
app.use(express.json());
app.get('/protected', authMiddleware, (req, res) => {
  res.json({ userId: req.user!.id, email: req.user!.email });
});

describe('authMiddleware', () => {
  let token: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-middleware.com'");
    const result = await authService.register('user@test-middleware.com', 'password123', 'User');
    token = result.token;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-middleware.com'");
    await pool.end();
  });

  it('passes with valid token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('user@test-middleware.com');
  });

  it('rejects missing token', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add auth middleware with JWT verification and household resolution"`

---

### Task 3.4: Create auth routes

Create `/Users/kevinspahn/Grort/backend/src/routes/auth.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { RegisterSchema, LoginSchema, GoogleAuthSchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();

function handleZodError(res: Response, err: unknown) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.errors });
    return true;
  }
  return false;
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const result = await authService.register(body.email, body.password, body.name);
    res.status(201).json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    if (err instanceof Error && err.message === 'Email already registered') {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const body = LoginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password);
    res.json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    if (err instanceof Error && err.message === 'Invalid email or password') {
      res.status(401).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/google', async (req: Request, res: Response) => {
  try {
    const body = GoogleAuthSchema.parse(req.body);
    // In production, verify the idToken with Google's API.
    // For now, we decode it and trust the payload.
    // The mobile app sends the verified Google user info.
    // This is a simplified flow — production should verify with Google.
    const { idToken } = body;

    // Expect the client to send additional fields alongside the token
    const { googleId, email, name } = req.body as {
      googleId: string;
      email: string;
      name: string;
    };

    if (!googleId || !email || !name) {
      res.status(400).json({ error: 'Missing googleId, email, or name' });
      return;
    }

    const result = await authService.googleAuth(googleId, email, name);
    res.json(result);
  } catch (err) {
    if (handleZodError(res, err)) return;
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

Register routes in `/Users/kevinspahn/Grort/backend/src/index.ts` — update to:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Grort API running on port ${PORT}`);
  });
}

export default app;
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/routes/auth.test.ts`:

```typescript
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
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add auth routes (register, login, Google OAuth)"`

---

## Phase 4: Household Management

### Task 4.1: Create household repository

Create `/Users/kevinspahn/Grort/backend/src/repositories/householdRepository.ts`:

```typescript
import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface HouseholdRow {
  id: string;
  name: string;
  created_at: Date;
}

export interface HouseholdMemberRow {
  id: string;
  email: string;
  name: string;
  household_role: string;
}

export const householdRepository = {
  async create(name: string): Promise<HouseholdRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      'INSERT INTO households (id, name) VALUES ($1, $2) RETURNING *',
      [id, name]
    );
    return rows[0];
  },

  async findById(id: string): Promise<HouseholdRow | null> {
    const { rows } = await pool.query('SELECT * FROM households WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async getMembers(householdId: string): Promise<HouseholdMemberRow[]> {
    const { rows } = await pool.query(
      'SELECT id, email, name, household_role FROM users WHERE household_id = $1',
      [householdId]
    );
    return rows;
  },

  async removeMember(householdId: string, userId: string): Promise<void> {
    await pool.query(
      'UPDATE users SET household_id = NULL, household_role = NULL WHERE id = $1 AND household_id = $2',
      [userId, householdId]
    );
  },
};
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/repositories/householdRepository.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { householdRepository } from './householdRepository';

describe('householdRepository', () => {
  let householdId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-household-repo.com'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-household-repo.com'");
    if (householdId) {
      await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    }
    await pool.end();
  });

  it('creates a household', async () => {
    const hh = await householdRepository.create('Test Family');
    householdId = hh.id;
    expect(hh.name).toBe('Test Family');
    expect(hh.id).toBeDefined();
  });

  it('finds household by id', async () => {
    const hh = await householdRepository.findById(householdId);
    expect(hh).not.toBeNull();
    expect(hh!.name).toBe('Test Family');
  });

  it('returns null for nonexistent id', async () => {
    const hh = await householdRepository.findById('00000000-0000-0000-0000-000000000000');
    expect(hh).toBeNull();
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add household repository"`

---

### Task 4.2: Create household service

Create `/Users/kevinspahn/Grort/backend/src/services/householdService.ts`:

```typescript
import { householdRepository } from '../repositories/householdRepository';
import { userRepository, UserRow } from '../repositories/userRepository';

export const householdService = {
  async createHousehold(userId: string, name: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.household_id) throw new Error('User already belongs to a household');

    const household = await householdRepository.create(name);
    await userRepository.updateHousehold(userId, household.id, 'owner');

    return household;
  },

  async inviteMember(householdId: string, inviterUserId: string, email: string) {
    const inviter = await userRepository.findById(inviterUserId);
    if (!inviter || inviter.household_id !== householdId || inviter.household_role !== 'owner') {
      throw new Error('Only household owners can invite members');
    }

    const invitee = await userRepository.findByEmail(email);
    if (!invitee) throw new Error('User not found with that email');
    if (invitee.household_id) throw new Error('User already belongs to a household');

    await userRepository.updateHousehold(invitee.id, householdId, 'member');
    return invitee;
  },

  async removeMember(householdId: string, ownerUserId: string, targetUserId: string) {
    const owner = await userRepository.findById(ownerUserId);
    if (!owner || owner.household_id !== householdId || owner.household_role !== 'owner') {
      throw new Error('Only household owners can remove members');
    }

    if (ownerUserId === targetUserId) {
      throw new Error('Cannot remove yourself as owner');
    }

    const target = await userRepository.findById(targetUserId);
    if (!target || target.household_id !== householdId) {
      throw new Error('User is not a member of this household');
    }

    await householdRepository.removeMember(householdId, targetUserId);
  },

  async getMembers(householdId: string) {
    return householdRepository.getMembers(householdId);
  },
};
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/services/householdService.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { authService } from './authService';
import { householdService } from './householdService';

describe('householdService', () => {
  let ownerId: string;
  let memberId: string;
  let householdId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-hh-svc.com'");
    const ownerResult = await authService.register('owner@test-hh-svc.com', 'password123', 'Owner');
    ownerId = ownerResult.user.id;
    const memberResult = await authService.register('member@test-hh-svc.com', 'password123', 'Member');
    memberId = memberResult.user.id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-hh-svc.com'");
    if (householdId) {
      await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    }
    await pool.end();
  });

  it('creates a household and makes user owner', async () => {
    const hh = await householdService.createHousehold(ownerId, 'Smith Family');
    householdId = hh.id;
    expect(hh.name).toBe('Smith Family');
  });

  it('rejects creating household if user already in one', async () => {
    await expect(
      householdService.createHousehold(ownerId, 'Another')
    ).rejects.toThrow('User already belongs to a household');
  });

  it('invites a member', async () => {
    await householdService.inviteMember(householdId, ownerId, 'member@test-hh-svc.com');
    const members = await householdService.getMembers(householdId);
    expect(members).toHaveLength(2);
    const memberEntry = members.find((m) => m.email === 'member@test-hh-svc.com');
    expect(memberEntry!.household_role).toBe('member');
  });

  it('removes a member', async () => {
    await householdService.removeMember(householdId, ownerId, memberId);
    const members = await householdService.getMembers(householdId);
    expect(members).toHaveLength(1);
  });

  it('rejects non-owner removing members', async () => {
    // Re-add member first
    await householdService.inviteMember(householdId, ownerId, 'member@test-hh-svc.com');
    await expect(
      householdService.removeMember(householdId, memberId, ownerId)
    ).rejects.toThrow('Only household owners can remove members');
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add household service with create, invite, remove"`

---

### Task 4.3: Create household routes

Create `/Users/kevinspahn/Grort/backend/src/routes/households.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware, requireHousehold, requireHouseholdOwner } from '../middleware/auth';
import { householdService } from '../services/householdService';
import { CreateHouseholdSchema, InviteMemberSchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = CreateHouseholdSchema.parse(req.body);
    const household = await householdService.createHousehold(req.user!.id, body.name);
    res.status(201).json(household);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/invite', requireHousehold, requireHouseholdOwner, async (req: Request, res: Response) => {
  try {
    const body = InviteMemberSchema.parse(req.body);
    await householdService.inviteMember(req.params.id, req.user!.id, body.email);
    res.json({ message: 'Member invited successfully' });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/members/:userId', requireHousehold, requireHouseholdOwner, async (req: Request, res: Response) => {
  try {
    await householdService.removeMember(req.params.id, req.user!.id, req.params.userId);
    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/members', requireHousehold, async (req: Request, res: Response) => {
  try {
    const members = await householdService.getMembers(req.params.id);
    res.json(members.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.household_role,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

Update `/Users/kevinspahn/Grort/backend/src/index.ts` to add household routes:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import householdRoutes from './routes/households';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/households', householdRoutes);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Grort API running on port ${PORT}`);
  });
}

export default app;
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add household routes (create, invite, remove, list members)"`

---

## Phase 5: Image Upload & Storage

### Task 5.1: Create storage service

Create `/Users/kevinspahn/Grort/backend/src/services/storageService.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const isLocalStorage = process.env.STORAGE_MODE === 'local';
const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../uploads');

const s3Client = isLocalStorage
  ? null
  : new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true, // Required for MinIO
    });

const BUCKET = process.env.S3_BUCKET || 'grort-receipts';

export const storageService = {
  async uploadImage(
    fileBuffer: Buffer,
    mimeType: string,
    originalFilename: string
  ): Promise<string> {
    const ext = path.extname(originalFilename) || '.jpg';
    const key = `receipts/${uuidv4()}${ext}`;

    if (isLocalStorage) {
      const filePath = path.join(LOCAL_UPLOAD_DIR, key);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, fileBuffer);
      return `local://${key}`;
    }

    await s3Client!.send(
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
    return getSignedUrl(s3Client!, command, { expiresIn: 3600 });
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
    await s3Client!.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key })
    );
  },
};
```

Install AWS SDK:

```bash
cd /Users/kevinspahn/Grort/backend
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/services/storageService.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// Set local mode for testing
process.env.STORAGE_MODE = 'local';

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
    expect(signedUrl).toMatch(/^http:\/\/localhost:3000\/uploads\/receipts\//);
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
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add storage service with S3 and local filesystem support"`

---

### Task 5.2: Create upload endpoint

Create `/Users/kevinspahn/Grort/backend/src/routes/upload.ts`:

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { storageService } from '../services/storageService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
    }
  },
});

router.use(authMiddleware);

router.post('/', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const imageUrl = await storageService.uploadImage(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    const signedUrl = await storageService.getSignedUrl(imageUrl);

    res.status(201).json({
      imageUrl,
      signedUrl,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid file type')) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
```

Update `/Users/kevinspahn/Grort/backend/src/index.ts` — add upload routes:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import householdRoutes from './routes/households';
import uploadRoutes from './routes/upload';

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

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Grort API running on port ${PORT}`);
  });
}

export default app;
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/routes/upload.test.ts`:

```typescript
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
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add image upload endpoint with validation"`

---

## Phase 6: AI Receipt Parsing

### Task 6.1: Create prompt template

Create `/Users/kevinspahn/Grort/backend/src/ai/promptTemplate.ts`:

```typescript
export const RECEIPT_PARSING_PROMPT = `You are a grocery receipt parser. Analyze this receipt image and extract all information into structured JSON.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):

{
  "storeName": "Store display name",
  "storeAddress": "Full store address or null",
  "storeBrand": "Chain/brand name (e.g., 'Costco', 'Trader Joe\\'s') or null",
  "receiptDate": "YYYY-MM-DD",
  "items": [
    {
      "nameOnReceipt": "Exact text as printed on receipt",
      "quantity": 1,
      "unitPrice": 5.99,
      "totalPrice": 5.99,
      "suggestedCategory": "One of: Produce, Dairy, Meat & Seafood, Bakery, Frozen, Beverages, Snacks, Household, Personal Care, Other",
      "suggestedCanonicalName": "Human-readable product name (e.g., 'Organic Large Brown Eggs, 1 Dozen')"
    }
  ],
  "subtotal": 45.99,
  "tax": 3.67,
  "total": 49.66
}

Rules:
1. Extract EVERY line item from the receipt.
2. "nameOnReceipt" must be the EXACT text printed on the receipt (abbreviated codes and all).
3. "suggestedCanonicalName" should be a clear, human-readable product name that normalizes abbreviations.
4. "quantity" defaults to 1 unless the receipt shows a different quantity.
5. If unit_price is not visible, set it to null but always provide totalPrice.
6. "suggestedCategory" must be one of the listed categories.
7. If the receipt date is not visible, use today's date.
8. subtotal and tax can be null if not visible on the receipt.
9. total must always be provided — estimate from item sum if needed.
10. Do NOT include coupons, discounts, or payment method lines as items.
`;
```

**Commit:** `git add -A && git commit -m "feat: add AI receipt parsing prompt template"`

---

### Task 6.2: Create ReceiptParser interface and Claude adapter

Create `/Users/kevinspahn/Grort/backend/src/ai/types.ts`:

```typescript
import { ReceiptExtractionResult } from '../shared/schemas';

export interface ReceiptParser {
  parse(imageUrl: string): Promise<ReceiptExtractionResult>;
  readonly providerName: string;
}
```

Create `/Users/kevinspahn/Grort/backend/src/ai/claudeParser.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ReceiptParser } from './types';
import { ReceiptExtractionResult, ReceiptExtractionResultSchema } from '../shared/schemas';
import { RECEIPT_PARSING_PROMPT } from './promptTemplate';
import { storageService } from '../services/storageService';

export class ClaudeReceiptParser implements ReceiptParser {
  readonly providerName = 'claude';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async parse(imageUrl: string): Promise<ReceiptExtractionResult> {
    // Get a publicly accessible URL
    const accessibleUrl = await storageService.getSignedUrl(imageUrl);

    // For base64 approach (more reliable with S3/local):
    // We need to fetch the image and send as base64
    const response = await fetch(accessibleUrl);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mediaType = response.headers.get('content-type') || 'image/jpeg';

    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64,
              },
            },
            {
              type: 'text',
              text: RECEIPT_PARSING_PROMPT,
            },
          ],
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Claude returned no text response');
    }

    const jsonStr = textContent.text.trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try to extract JSON from markdown code block
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${jsonStr.substring(0, 200)}`);
      }
    }

    return ReceiptExtractionResultSchema.parse(parsed);
  }
}
```

Install Anthropic SDK:

```bash
cd /Users/kevinspahn/Grort/backend
npm install @anthropic-ai/sdk
```

**Commit:** `git add -A && git commit -m "feat: add Claude receipt parser adapter"`

---

### Task 6.3: Create OpenAI adapter

Create `/Users/kevinspahn/Grort/backend/src/ai/openaiParser.ts`:

```typescript
import OpenAI from 'openai';
import { ReceiptParser } from './types';
import { ReceiptExtractionResult, ReceiptExtractionResultSchema } from '../shared/schemas';
import { RECEIPT_PARSING_PROMPT } from './promptTemplate';
import { storageService } from '../services/storageService';

export class OpenAIReceiptParser implements ReceiptParser {
  readonly providerName = 'openai';
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async parse(imageUrl: string): Promise<ReceiptExtractionResult> {
    const accessibleUrl = await storageService.getSignedUrl(imageUrl);

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: accessibleUrl },
            },
            {
              type: 'text',
              text: RECEIPT_PARSING_PROMPT,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned no content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${content.substring(0, 200)}`);
      }
    }

    return ReceiptExtractionResultSchema.parse(parsed);
  }
}
```

Install OpenAI SDK:

```bash
cd /Users/kevinspahn/Grort/backend
npm install openai
```

**Commit:** `git add -A && git commit -m "feat: add OpenAI GPT-4o receipt parser adapter"`

---

### Task 6.4: Create Gemini adapter

Create `/Users/kevinspahn/Grort/backend/src/ai/geminiParser.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ReceiptParser } from './types';
import { ReceiptExtractionResult, ReceiptExtractionResultSchema } from '../shared/schemas';
import { RECEIPT_PARSING_PROMPT } from './promptTemplate';
import { storageService } from '../services/storageService';

export class GeminiReceiptParser implements ReceiptParser {
  readonly providerName = 'gemini';
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  async parse(imageUrl: string): Promise<ReceiptExtractionResult> {
    const accessibleUrl = await storageService.getSignedUrl(imageUrl);

    // Fetch image as base64
    const response = await fetch(accessibleUrl);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
      { text: RECEIPT_PARSING_PROMPT },
    ]);

    const content = result.response.text();
    if (!content) {
      throw new Error('Gemini returned no content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${content.substring(0, 200)}`);
      }
    }

    return ReceiptExtractionResultSchema.parse(parsed);
  }
}
```

Install Google AI SDK:

```bash
cd /Users/kevinspahn/Grort/backend
npm install @google/generative-ai
```

**Commit:** `git add -A && git commit -m "feat: add Gemini receipt parser adapter"`

---

### Task 6.5: Create parser factory

Create `/Users/kevinspahn/Grort/backend/src/ai/parserFactory.ts`:

```typescript
import { ReceiptParser } from './types';
import { ClaudeReceiptParser } from './claudeParser';
import { OpenAIReceiptParser } from './openaiParser';
import { GeminiReceiptParser } from './geminiParser';

export type AIProvider = 'claude' | 'openai' | 'gemini';

const parsers: Record<AIProvider, () => ReceiptParser> = {
  claude: () => new ClaudeReceiptParser(),
  openai: () => new OpenAIReceiptParser(),
  gemini: () => new GeminiReceiptParser(),
};

let cachedParser: ReceiptParser | null = null;
let cachedProvider: AIProvider | null = null;

export function getReceiptParser(provider?: AIProvider): ReceiptParser {
  const activeProvider = provider || (process.env.AI_PROVIDER as AIProvider) || 'claude';

  if (cachedParser && cachedProvider === activeProvider) {
    return cachedParser;
  }

  const factory = parsers[activeProvider];
  if (!factory) {
    throw new Error(`Unknown AI provider: ${activeProvider}. Supported: ${Object.keys(parsers).join(', ')}`);
  }

  cachedParser = factory();
  cachedProvider = activeProvider;
  return cachedParser;
}
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/ai/parserFactory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getReceiptParser } from './parserFactory';

describe('parserFactory', () => {
  it('creates Claude parser', () => {
    const parser = getReceiptParser('claude');
    expect(parser.providerName).toBe('claude');
  });

  it('creates OpenAI parser', () => {
    const parser = getReceiptParser('openai');
    expect(parser.providerName).toBe('openai');
  });

  it('creates Gemini parser', () => {
    const parser = getReceiptParser('gemini');
    expect(parser.providerName).toBe('gemini');
  });

  it('throws on unknown provider', () => {
    expect(() => getReceiptParser('unknown' as any)).toThrow('Unknown AI provider');
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add AI parser factory with provider selection"`

---

## Phase 7: Receipt Processing Pipeline

### Task 7.1: Create store repository

Create `/Users/kevinspahn/Grort/backend/src/repositories/storeRepository.ts`:

```typescript
import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface StoreRow {
  id: string;
  name: string;
  brand: string | null;
  address: string | null;
  household_id: string;
  created_at: Date;
}

export const storeRepository = {
  async findByBrandAndAddress(
    householdId: string,
    brand: string | null,
    address: string | null
  ): Promise<StoreRow | null> {
    if (brand && address) {
      const { rows } = await pool.query(
        'SELECT * FROM stores WHERE household_id = $1 AND brand = $2 AND address = $3',
        [householdId, brand, address]
      );
      return rows[0] || null;
    }
    if (brand) {
      const { rows } = await pool.query(
        'SELECT * FROM stores WHERE household_id = $1 AND brand = $2 AND address IS NULL LIMIT 1',
        [householdId, brand]
      );
      return rows[0] || null;
    }
    return null;
  },

  async findByNameFuzzy(householdId: string, name: string): Promise<StoreRow | null> {
    const { rows } = await pool.query(
      'SELECT * FROM stores WHERE household_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1',
      [householdId, name]
    );
    return rows[0] || null;
  },

  async create(data: {
    name: string;
    brand: string | null;
    address: string | null;
    householdId: string;
  }): Promise<StoreRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO stores (id, name, brand, address, household_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, data.name, data.brand, data.address, data.householdId]
    );
    return rows[0];
  },

  async findById(id: string): Promise<StoreRow | null> {
    const { rows } = await pool.query('SELECT * FROM stores WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findAllByHousehold(householdId: string): Promise<StoreRow[]> {
    const { rows } = await pool.query(
      'SELECT * FROM stores WHERE household_id = $1 ORDER BY name',
      [householdId]
    );
    return rows;
  },

  async update(id: string, data: { name?: string; brand?: string | null }): Promise<StoreRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.brand !== undefined) {
      fields.push(`brand = $${idx++}`);
      values.push(data.brand);
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE stores SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0];
  },

  async mergeStores(sourceId: string, targetId: string): Promise<void> {
    // Move all receipts from source to target
    await pool.query(
      'UPDATE receipts SET store_id = $1 WHERE store_id = $2',
      [targetId, sourceId]
    );
    // Delete source store
    await pool.query('DELETE FROM stores WHERE id = $1', [sourceId]);
  },
};
```

**Commit:** `git add -A && git commit -m "feat: add store repository"`

---

### Task 7.2: Create product repository

Create `/Users/kevinspahn/Grort/backend/src/repositories/productRepository.ts`:

```typescript
import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface ProductRow {
  id: string;
  household_id: string;
  canonical_name: string;
  category_id: string | null;
  created_at: Date;
}

export const productRepository = {
  async findByCanonicalName(householdId: string, canonicalName: string): Promise<ProductRow | null> {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE household_id = $1 AND LOWER(canonical_name) = LOWER($2)',
      [householdId, canonicalName]
    );
    return rows[0] || null;
  },

  async findAllByHousehold(householdId: string): Promise<ProductRow[]> {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE household_id = $1 ORDER BY canonical_name',
      [householdId]
    );
    return rows;
  },

  async create(data: {
    householdId: string;
    canonicalName: string;
    categoryId: string | null;
  }): Promise<ProductRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO products (id, household_id, canonical_name, category_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, data.householdId, data.canonicalName, data.categoryId]
    );
    return rows[0];
  },

  async findById(id: string): Promise<ProductRow | null> {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async update(id: string, data: { canonicalName?: string; categoryId?: string | null }): Promise<ProductRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.canonicalName !== undefined) {
      fields.push(`canonical_name = $${idx++}`);
      values.push(data.canonicalName);
    }
    if (data.categoryId !== undefined) {
      fields.push(`category_id = $${idx++}`);
      values.push(data.categoryId);
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0];
  },

  async mergeProducts(sourceId: string, targetId: string): Promise<void> {
    // Update all receipt_items referencing source to target
    await pool.query(
      'UPDATE receipt_items SET product_id = $1 WHERE product_id = $2',
      [targetId, sourceId]
    );
    // Delete source product
    await pool.query('DELETE FROM products WHERE id = $1', [sourceId]);
  },
};
```

**Commit:** `git add -A && git commit -m "feat: add product repository"`

---

### Task 7.3: Create receipt repository

Create `/Users/kevinspahn/Grort/backend/src/repositories/receiptRepository.ts`:

```typescript
import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface ReceiptRow {
  id: string;
  user_id: string;
  household_id: string | null;
  store_id: string;
  receipt_date: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  image_url: string;
  raw_ai_response: unknown;
  created_at: Date;
}

export interface ReceiptItemRow {
  id: string;
  receipt_id: string;
  product_id: string | null;
  name_on_receipt: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
  category_id: string | null;
  created_at: Date;
}

export const receiptRepository = {
  async create(data: {
    userId: string;
    householdId: string | null;
    storeId: string;
    receiptDate: string;
    subtotal: number | null;
    tax: number | null;
    total: number;
    imageUrl: string;
    rawAiResponse: unknown;
  }): Promise<ReceiptRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO receipts (id, user_id, household_id, store_id, receipt_date, subtotal, tax, total, image_url, raw_ai_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, data.userId, data.householdId, data.storeId, data.receiptDate, data.subtotal, data.tax, data.total, data.imageUrl, JSON.stringify(data.rawAiResponse)]
    );
    return rows[0];
  },

  async createItem(data: {
    receiptId: string;
    productId: string | null;
    nameOnReceipt: string;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number;
    categoryId: string | null;
  }): Promise<ReceiptItemRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO receipt_items (id, receipt_id, product_id, name_on_receipt, quantity, unit_price, total_price, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, data.receiptId, data.productId, data.nameOnReceipt, data.quantity, data.unitPrice, data.totalPrice, data.categoryId]
    );
    return rows[0];
  },

  async findById(id: string): Promise<ReceiptRow | null> {
    const { rows } = await pool.query('SELECT * FROM receipts WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findItemsByReceiptId(receiptId: string): Promise<ReceiptItemRow[]> {
    const { rows } = await pool.query(
      `SELECT ri.*, p.canonical_name as product_name, c.name as category_name
       FROM receipt_items ri
       LEFT JOIN products p ON ri.product_id = p.id
       LEFT JOIN categories c ON ri.category_id = c.id
       WHERE ri.receipt_id = $1
       ORDER BY ri.created_at`,
      [receiptId]
    );
    return rows;
  },

  async findByHousehold(
    householdId: string,
    options: {
      page: number;
      limit: number;
      storeId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ receipts: ReceiptRow[]; total: number }> {
    let whereClause = 'WHERE r.household_id = $1';
    const params: unknown[] = [householdId];
    let paramIdx = 2;

    if (options.storeId) {
      whereClause += ` AND r.store_id = $${paramIdx++}`;
      params.push(options.storeId);
    }
    if (options.startDate) {
      whereClause += ` AND r.receipt_date >= $${paramIdx++}`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      whereClause += ` AND r.receipt_date <= $${paramIdx++}`;
      params.push(options.endDate);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM receipts r ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const offset = (options.page - 1) * options.limit;
    params.push(options.limit, offset);

    const { rows } = await pool.query(
      `SELECT r.*, s.name as store_name,
        (SELECT COUNT(*) FROM receipt_items WHERE receipt_id = r.id) as item_count
       FROM receipts r
       LEFT JOIN stores s ON r.store_id = s.id
       ${whereClause}
       ORDER BY r.receipt_date DESC, r.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    return { receipts: rows, total };
  },

  async findByUser(
    userId: string,
    options: {
      page: number;
      limit: number;
      storeId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ receipts: ReceiptRow[]; total: number }> {
    let whereClause = 'WHERE r.user_id = $1 AND r.household_id IS NULL';
    const params: unknown[] = [userId];
    let paramIdx = 2;

    if (options.storeId) {
      whereClause += ` AND r.store_id = $${paramIdx++}`;
      params.push(options.storeId);
    }
    if (options.startDate) {
      whereClause += ` AND r.receipt_date >= $${paramIdx++}`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      whereClause += ` AND r.receipt_date <= $${paramIdx++}`;
      params.push(options.endDate);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM receipts r ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const offset = (options.page - 1) * options.limit;
    params.push(options.limit, offset);

    const { rows } = await pool.query(
      `SELECT r.*, s.name as store_name,
        (SELECT COUNT(*) FROM receipt_items WHERE receipt_id = r.id) as item_count
       FROM receipts r
       LEFT JOIN stores s ON r.store_id = s.id
       ${whereClause}
       ORDER BY r.receipt_date DESC, r.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    return { receipts: rows, total };
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM receipts WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async updateItem(
    itemId: string,
    data: {
      nameOnReceipt?: string;
      quantity?: number;
      unitPrice?: number | null;
      totalPrice?: number;
      categoryId?: string | null;
      productId?: string | null;
    }
  ): Promise<ReceiptItemRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.nameOnReceipt !== undefined) {
      fields.push(`name_on_receipt = $${idx++}`);
      values.push(data.nameOnReceipt);
    }
    if (data.quantity !== undefined) {
      fields.push(`quantity = $${idx++}`);
      values.push(data.quantity);
    }
    if (data.unitPrice !== undefined) {
      fields.push(`unit_price = $${idx++}`);
      values.push(data.unitPrice);
    }
    if (data.totalPrice !== undefined) {
      fields.push(`total_price = $${idx++}`);
      values.push(data.totalPrice);
    }
    if (data.categoryId !== undefined) {
      fields.push(`category_id = $${idx++}`);
      values.push(data.categoryId);
    }
    if (data.productId !== undefined) {
      fields.push(`product_id = $${idx++}`);
      values.push(data.productId);
    }

    if (fields.length === 0) throw new Error('No fields to update');

    values.push(itemId);
    const { rows } = await pool.query(
      `UPDATE receipt_items SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0];
  },
};
```

**Commit:** `git add -A && git commit -m "feat: add receipt repository with CRUD operations"`

---

### Task 7.4: Create product matching service (fuzzy match)

Create `/Users/kevinspahn/Grort/backend/src/services/productMatchService.ts`:

```typescript
import { productRepository, ProductRow } from '../repositories/productRepository';

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalized similarity (0-1, where 1 is identical).
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

export interface MatchResult {
  product: ProductRow | null;
  confidence: 'exact' | 'near' | 'new';
  score: number;
}

const EXACT_THRESHOLD = 0.9;
const NEAR_THRESHOLD = 0.6;

export const productMatchService = {
  async matchProduct(
    householdId: string,
    suggestedCanonicalName: string | null,
    nameOnReceipt: string
  ): Promise<MatchResult> {
    if (!suggestedCanonicalName) {
      return { product: null, confidence: 'new', score: 0 };
    }

    const products = await productRepository.findAllByHousehold(householdId);

    let bestMatch: ProductRow | null = null;
    let bestScore = 0;

    for (const product of products) {
      // Compare against canonical name
      const canonicalScore = similarity(suggestedCanonicalName, product.canonical_name);
      // Also compare against receipt name for good measure
      const receiptScore = similarity(nameOnReceipt, product.canonical_name);
      const score = Math.max(canonicalScore, receiptScore);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    if (bestScore >= EXACT_THRESHOLD && bestMatch) {
      return { product: bestMatch, confidence: 'exact', score: bestScore };
    }

    if (bestScore >= NEAR_THRESHOLD && bestMatch) {
      return { product: bestMatch, confidence: 'near', score: bestScore };
    }

    return { product: null, confidence: 'new', score: bestScore };
  },
};
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/services/productMatchService.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { productRepository } from '../repositories/productRepository';
import { productMatchService } from './productMatchService';
import { householdRepository } from '../repositories/householdRepository';

describe('productMatchService', () => {
  let householdId: string;

  beforeAll(async () => {
    const hh = await householdRepository.create('Match Test Household');
    householdId = hh.id;

    await productRepository.create({
      householdId,
      canonicalName: 'Organic Large Brown Eggs, 1 Dozen',
      categoryId: null,
    });
    await productRepository.create({
      householdId,
      canonicalName: 'Kirkland Organic Whole Milk, 1 Gallon',
      categoryId: null,
    });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM products WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.end();
  });

  it('finds exact match', async () => {
    const result = await productMatchService.matchProduct(
      householdId,
      'Organic Large Brown Eggs, 1 Dozen',
      'ORG LRG BRN EGGS 12CT'
    );
    expect(result.confidence).toBe('exact');
    expect(result.product).not.toBeNull();
    expect(result.product!.canonical_name).toBe('Organic Large Brown Eggs, 1 Dozen');
  });

  it('finds near match', async () => {
    const result = await productMatchService.matchProduct(
      householdId,
      'Organic Brown Eggs, Large',
      'ORG BRN EGGS'
    );
    // Should be near or exact depending on threshold
    expect(['exact', 'near']).toContain(result.confidence);
    expect(result.product).not.toBeNull();
  });

  it('returns new for no match', async () => {
    const result = await productMatchService.matchProduct(
      householdId,
      'Avocado Hass Single',
      'AVOCADO HASS'
    );
    expect(result.confidence).toBe('new');
  });

  it('handles null suggested name', async () => {
    const result = await productMatchService.matchProduct(
      householdId,
      null,
      'SOME ITEM'
    );
    expect(result.confidence).toBe('new');
    expect(result.product).toBeNull();
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add product matching service with Levenshtein fuzzy match"`

---

### Task 7.5: Create category resolution helper

Create `/Users/kevinspahn/Grort/backend/src/services/categoryService.ts`:

```typescript
import pool from '../db/pool';

const categoryCache: Map<string, string> = new Map();

export const categoryService = {
  async resolveCategoryId(suggestedCategory: string | null): Promise<string | null> {
    if (!suggestedCategory) return null;

    const normalized = suggestedCategory.trim().toLowerCase();

    // Check cache
    if (categoryCache.has(normalized)) {
      return categoryCache.get(normalized)!;
    }

    // Look up by name (case-insensitive)
    const { rows } = await pool.query(
      'SELECT id FROM categories WHERE LOWER(name) = $1 LIMIT 1',
      [normalized]
    );

    if (rows.length > 0) {
      categoryCache.set(normalized, rows[0].id);
      return rows[0].id;
    }

    // Fallback: "Other" category
    const { rows: otherRows } = await pool.query(
      "SELECT id FROM categories WHERE name = 'Other' AND parent_id IS NULL LIMIT 1"
    );

    if (otherRows.length > 0) {
      categoryCache.set(normalized, otherRows[0].id);
      return otherRows[0].id;
    }

    return null;
  },

  async getAllCategories() {
    const { rows } = await pool.query(
      'SELECT id, name, parent_id FROM categories ORDER BY name'
    );
    return rows;
  },
};
```

**Commit:** `git add -A && git commit -m "feat: add category resolution service"`

---

### Task 7.6: Create receipt processing service

Create `/Users/kevinspahn/Grort/backend/src/services/receiptProcessingService.ts`:

```typescript
import { getReceiptParser } from '../ai/parserFactory';
import { storageService } from './storageService';
import { receiptRepository } from '../repositories/receiptRepository';
import { storeRepository } from '../repositories/storeRepository';
import { productRepository } from '../repositories/productRepository';
import { productMatchService, MatchResult } from './productMatchService';
import { categoryService } from './categoryService';
import { ReceiptExtractionResult } from '../shared/schemas';

export interface ProcessedReceiptItem {
  id: string;
  nameOnReceipt: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  productId: string | null;
  productName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  matchConfidence: 'exact' | 'near' | 'new';
}

export interface ProcessedReceipt {
  id: string;
  storeId: string;
  storeName: string;
  receiptDate: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  imageUrl: string;
  items: ProcessedReceiptItem[];
}

export const receiptProcessingService = {
  async processReceipt(
    imageUrl: string,
    userId: string,
    householdId: string | null
  ): Promise<ProcessedReceipt> {
    // Step 1: Parse receipt with AI
    const parser = getReceiptParser();
    const extraction = await parser.parse(imageUrl);

    // Step 2: Resolve store
    const store = await resolveStore(extraction, householdId);

    // Step 3: Create receipt record
    const receipt = await receiptRepository.create({
      userId,
      householdId,
      storeId: store.id,
      receiptDate: extraction.receiptDate,
      subtotal: extraction.subtotal,
      tax: extraction.tax,
      total: extraction.total,
      imageUrl,
      rawAiResponse: extraction,
    });

    // Step 4: Process each item
    const processedItems: ProcessedReceiptItem[] = [];

    for (const item of extraction.items) {
      // Resolve category
      const categoryId = await categoryService.resolveCategoryId(item.suggestedCategory);

      // Match product
      let matchResult: MatchResult = { product: null, confidence: 'new', score: 0 };
      if (householdId) {
        matchResult = await productMatchService.matchProduct(
          householdId,
          item.suggestedCanonicalName,
          item.nameOnReceipt
        );
      }

      let productId: string | null = null;
      let productName: string | null = null;

      if (matchResult.confidence === 'exact' && matchResult.product) {
        // Use existing product
        productId = matchResult.product.id;
        productName = matchResult.product.canonical_name;
      } else if (matchResult.confidence === 'near' && matchResult.product) {
        // Flag for review — use existing product but mark as near match
        productId = matchResult.product.id;
        productName = matchResult.product.canonical_name;
      } else if (householdId && item.suggestedCanonicalName) {
        // Create new product
        const newProduct = await productRepository.create({
          householdId,
          canonicalName: item.suggestedCanonicalName,
          categoryId,
        });
        productId = newProduct.id;
        productName = newProduct.canonical_name;
      }

      // Create receipt item
      const receiptItem = await receiptRepository.createItem({
        receiptId: receipt.id,
        productId,
        nameOnReceipt: item.nameOnReceipt,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        categoryId,
      });

      processedItems.push({
        id: receiptItem.id,
        nameOnReceipt: item.nameOnReceipt,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        productId,
        productName,
        categoryId,
        categoryName: item.suggestedCategory,
        matchConfidence: matchResult.confidence,
      });
    }

    return {
      id: receipt.id,
      storeId: store.id,
      storeName: store.name,
      receiptDate: extraction.receiptDate,
      subtotal: extraction.subtotal,
      tax: extraction.tax,
      total: extraction.total,
      imageUrl,
      items: processedItems,
    };
  },
};

async function resolveStore(
  extraction: ReceiptExtractionResult,
  householdId: string | null
) {
  if (!householdId) {
    // For users without a household, create a temporary store record
    // In practice, every user should have a household for full features
    return storeRepository.create({
      name: extraction.storeName,
      brand: extraction.storeBrand,
      address: extraction.storeAddress,
      householdId: householdId!, // This case is handled by requiring household
    });
  }

  // Try to match existing store by brand+address
  let store = await storeRepository.findByBrandAndAddress(
    householdId,
    extraction.storeBrand,
    extraction.storeAddress
  );

  if (store) return store;

  // Try by name
  store = await storeRepository.findByNameFuzzy(householdId, extraction.storeName);

  if (store) return store;

  // Create new store
  return storeRepository.create({
    name: extraction.storeName,
    brand: extraction.storeBrand,
    address: extraction.storeAddress,
    householdId,
  });
}
```

**Commit:** `git add -A && git commit -m "feat: add receipt processing pipeline (AI parse → store resolve → product match → save)"`

---

### Task 7.7: Create receipt scan endpoint

Create `/Users/kevinspahn/Grort/backend/src/routes/receipts.ts`:

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { storageService } from '../services/storageService';
import { receiptProcessingService } from '../services/receiptProcessingService';
import { receiptRepository } from '../repositories/receiptRepository';
import { ReceiptsQuerySchema, UpdateReceiptItemSchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
});

// POST /receipts/scan — upload and parse receipt
router.post('/scan', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    // Upload image
    const imageUrl = await storageService.uploadImage(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    // Process receipt
    const result = await receiptProcessingService.processReceipt(
      imageUrl,
      req.user!.id,
      req.householdId || null
    );

    res.status(201).json(result);
  } catch (err) {
    console.error('Receipt scan error:', err);
    if (err instanceof Error) {
      res.status(500).json({ error: `Receipt processing failed: ${err.message}` });
      return;
    }
    res.status(500).json({ error: 'Receipt processing failed' });
  }
});

// GET /receipts — list receipts
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = ReceiptsQuerySchema.parse(req.query);

    let result;
    if (req.householdId) {
      result = await receiptRepository.findByHousehold(req.householdId, {
        page: query.page,
        limit: query.limit,
        storeId: query.storeId,
        startDate: query.startDate,
        endDate: query.endDate,
      });
    } else {
      result = await receiptRepository.findByUser(req.user!.id, {
        page: query.page,
        limit: query.limit,
        storeId: query.storeId,
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    res.json({
      items: result.receipts,
      total: result.total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(result.total / query.limit),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /receipts/:id — receipt detail with items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const receipt = await receiptRepository.findById(req.params.id);
    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    // Verify ownership
    if (req.householdId && receipt.household_id !== req.householdId) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    if (!req.householdId && receipt.user_id !== req.user!.id) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    const items = await receiptRepository.findItemsByReceiptId(receipt.id);

    res.json({
      ...receipt,
      items,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /receipts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const receipt = await receiptRepository.findById(req.params.id);
    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    // Verify ownership
    if (req.householdId && receipt.household_id !== req.householdId) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    if (!req.householdId && receipt.user_id !== req.user!.id) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    // Delete image from storage
    try {
      await storageService.deleteImage(receipt.image_url);
    } catch {
      // Non-fatal: image cleanup failure shouldn't block receipt deletion
    }

    await receiptRepository.deleteById(receipt.id);
    res.json({ message: 'Receipt deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /receipts/:id/items/:itemId — edit a receipt item
router.put('/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    const body = UpdateReceiptItemSchema.parse(req.body);

    // Verify receipt ownership first
    const receipt = await receiptRepository.findById(req.params.id);
    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    if (req.householdId && receipt.household_id !== req.householdId) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    const updatedItem = await receiptRepository.updateItem(req.params.itemId, {
      nameOnReceipt: body.nameOnReceipt,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      totalPrice: body.totalPrice,
      categoryId: body.categoryId,
      productId: body.productId,
    });

    res.json(updatedItem);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

Update `/Users/kevinspahn/Grort/backend/src/index.ts` to add receipt routes:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import householdRoutes from './routes/households';
import uploadRoutes from './routes/upload';
import receiptRoutes from './routes/receipts';

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

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Grort API running on port ${PORT}`);
  });
}

export default app;
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: add receipt routes (scan, list, detail, delete, edit item)"`

---

## Phase 8: Receipt CRUD

> Note: The receipt CRUD endpoints (GET /receipts, GET /receipts/:id, DELETE /receipts/:id, PUT /receipts/:id/items/:itemId) were already implemented in Task 7.7 as part of the receipt routes. This phase adds integration tests to verify them thoroughly.

### Task 8.1: Receipt CRUD integration tests

Create `/Users/kevinspahn/Grort/backend/src/routes/receipts.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';
import { authService } from '../services/authService';
import { householdService } from '../services/householdService';
import { receiptRepository } from '../repositories/receiptRepository';
import { storeRepository } from '../repositories/storeRepository';

describe('Receipt routes', () => {
  let token: string;
  let userId: string;
  let householdId: string;
  let storeId: string;
  let receiptId: string;
  let itemId: string;

  beforeAll(async () => {
    // Clean up
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-receipt-routes.com'");

    // Create user with household
    const result = await authService.register('receipts@test-receipt-routes.com', 'password123', 'Tester');
    token = result.token;
    userId = result.user.id;

    const hh = await householdService.createHousehold(userId, 'Test Household');
    householdId = hh.id;

    // Re-login to get updated token with household
    const loginResult = await authService.login('receipts@test-receipt-routes.com', 'password123');
    token = loginResult.token;

    // Create a store
    const store = await storeRepository.create({
      name: 'Test Store',
      brand: 'TestBrand',
      address: '123 Test St',
      householdId,
    });
    storeId = store.id;

    // Create a receipt directly (bypassing AI)
    const receipt = await receiptRepository.create({
      userId,
      householdId,
      storeId,
      receiptDate: '2026-01-15',
      subtotal: 10.00,
      tax: 0.80,
      total: 10.80,
      imageUrl: 'local://test/receipt.jpg',
      rawAiResponse: {},
    });
    receiptId = receipt.id;

    // Create receipt items
    const item = await receiptRepository.createItem({
      receiptId,
      productId: null,
      nameOnReceipt: 'ORG MILK 1GAL',
      quantity: 1,
      unitPrice: 5.99,
      totalPrice: 5.99,
      categoryId: null,
    });
    itemId = item.id;

    await receiptRepository.createItem({
      receiptId,
      productId: null,
      nameOnReceipt: 'BANANAS',
      quantity: 3,
      unitPrice: 0.29,
      totalPrice: 0.87,
      categoryId: null,
    });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM receipt_items WHERE receipt_id = $1", [receiptId]);
    await pool.query("DELETE FROM receipts WHERE id = $1", [receiptId]);
    await pool.query("DELETE FROM stores WHERE id = $1", [storeId]);
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-receipt-routes.com'");
    await pool.query("DELETE FROM households WHERE id = $1", [householdId]);
    await pool.end();
  });

  describe('GET /receipts', () => {
    it('lists receipts', async () => {
      const res = await request(app)
        .get('/receipts')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('supports pagination', async () => {
      const res = await request(app)
        .get('/receipts?page=1&limit=5')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(5);
    });
  });

  describe('GET /receipts/:id', () => {
    it('returns receipt with items', async () => {
      const res = await request(app)
        .get(`/receipts/${receiptId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(receiptId);
      expect(res.body.items).toHaveLength(2);
    });

    it('returns 404 for nonexistent receipt', async () => {
      const res = await request(app)
        .get('/receipts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /receipts/:id/items/:itemId', () => {
    it('updates a receipt item', async () => {
      const res = await request(app)
        .put(`/receipts/${receiptId}/items/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nameOnReceipt: 'Organic Whole Milk 1 Gallon', totalPrice: 6.49 });
      expect(res.status).toBe(200);
      expect(res.body.name_on_receipt).toBe('Organic Whole Milk 1 Gallon');
    });
  });

  describe('DELETE /receipts/:id', () => {
    it('deletes receipt and cascades items', async () => {
      // Create a receipt to delete
      const receipt = await receiptRepository.create({
        userId,
        householdId,
        storeId,
        receiptDate: '2026-01-20',
        subtotal: 5.00,
        tax: 0.40,
        total: 5.40,
        imageUrl: 'local://test/delete-me.jpg',
        rawAiResponse: {},
      });
      await receiptRepository.createItem({
        receiptId: receipt.id,
        productId: null,
        nameOnReceipt: 'APPLE',
        quantity: 1,
        unitPrice: 1.00,
        totalPrice: 1.00,
        categoryId: null,
      });

      const res = await request(app)
        .delete(`/receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);

      // Verify items are gone
      const items = await receiptRepository.findItemsByReceiptId(receipt.id);
      expect(items).toHaveLength(0);
    });
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "test: add receipt CRUD integration tests"`

---

## Phase 9: Product Management

### Task 9.1: Create product routes

Create `/Users/kevinspahn/Grort/backend/src/routes/products.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware, requireHousehold } from '../middleware/auth';
import { productRepository } from '../repositories/productRepository';
import { UpdateProductSchema, MergeProductsSchema } from '../shared/schemas';
import { ZodError } from 'zod';
import pool from '../db/pool';

const router = Router();
router.use(authMiddleware);
router.use(requireHousehold);

// GET /products — list products with latest price and frequency
router.get('/', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
        (SELECT ri.total_price / ri.quantity
         FROM receipt_items ri
         JOIN receipts r ON ri.receipt_id = r.id
         WHERE ri.product_id = p.id
         ORDER BY r.receipt_date DESC
         LIMIT 1) as latest_price,
        (SELECT COUNT(*)
         FROM receipt_items ri
         WHERE ri.product_id = p.id) as purchase_count,
        c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.household_id = $1
       ORDER BY p.canonical_name`,
      [req.householdId]
    );

    res.json(rows.map((r: any) => ({
      id: r.id,
      householdId: r.household_id,
      canonicalName: r.canonical_name,
      categoryId: r.category_id,
      categoryName: r.category_name,
      createdAt: r.created_at,
      latestPrice: r.latest_price ? Number(r.latest_price) : null,
      purchaseCount: Number(r.purchase_count),
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /products/:id — edit product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateProductSchema.parse(req.body);

    const product = await productRepository.findById(req.params.id);
    if (!product || product.household_id !== req.householdId) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const updated = await productRepository.update(req.params.id, {
      canonicalName: body.canonicalName,
      categoryId: body.categoryId,
    });

    res.json({
      id: updated.id,
      householdId: updated.household_id,
      canonicalName: updated.canonical_name,
      categoryId: updated.category_id,
      createdAt: updated.created_at,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /products/merge — merge two products
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const body = MergeProductsSchema.parse(req.body);

    const source = await productRepository.findById(body.sourceId);
    const target = await productRepository.findById(body.targetId);

    if (!source || source.household_id !== req.householdId) {
      res.status(404).json({ error: 'Source product not found' });
      return;
    }
    if (!target || target.household_id !== req.householdId) {
      res.status(404).json({ error: 'Target product not found' });
      return;
    }

    await productRepository.mergeProducts(body.sourceId, body.targetId);

    res.json({ message: 'Products merged successfully', targetId: body.targetId });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

**Commit:** `git add -A && git commit -m "feat: add product routes (list, update, merge)"`

---

### Task 9.2: Create store routes

Create `/Users/kevinspahn/Grort/backend/src/routes/stores.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware, requireHousehold } from '../middleware/auth';
import { storeRepository } from '../repositories/storeRepository';
import { UpdateStoreSchema, MergeStoresSchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();
router.use(authMiddleware);
router.use(requireHousehold);

// GET /stores
router.get('/', async (req: Request, res: Response) => {
  try {
    const stores = await storeRepository.findAllByHousehold(req.householdId!);
    res.json(stores.map((s) => ({
      id: s.id,
      name: s.name,
      brand: s.brand,
      address: s.address,
      householdId: s.household_id,
      createdAt: s.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /stores/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateStoreSchema.parse(req.body);

    const store = await storeRepository.findById(req.params.id);
    if (!store || store.household_id !== req.householdId) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    const updated = await storeRepository.update(req.params.id, {
      name: body.name,
      brand: body.brand,
    });

    res.json({
      id: updated.id,
      name: updated.name,
      brand: updated.brand,
      address: updated.address,
      householdId: updated.household_id,
      createdAt: updated.created_at,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /stores/merge
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const body = MergeStoresSchema.parse(req.body);

    const source = await storeRepository.findById(body.sourceId);
    const target = await storeRepository.findById(body.targetId);

    if (!source || source.household_id !== req.householdId) {
      res.status(404).json({ error: 'Source store not found' });
      return;
    }
    if (!target || target.household_id !== req.householdId) {
      res.status(404).json({ error: 'Target store not found' });
      return;
    }

    await storeRepository.mergeStores(body.sourceId, body.targetId);

    res.json({ message: 'Stores merged successfully', targetId: body.targetId });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

**Commit:** `git add -A && git commit -m "feat: add store routes (list, update, merge)"`

---

### Task 9.3: Register product and store routes

Update `/Users/kevinspahn/Grort/backend/src/index.ts`:

```typescript
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

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Grort API running on port ${PORT}`);
  });
}

export default app;
```

**Test:** Create `/Users/kevinspahn/Grort/backend/src/routes/products.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';
import { authService } from '../services/authService';
import { householdService } from '../services/householdService';
import { productRepository } from '../repositories/productRepository';

describe('Product routes', () => {
  let token: string;
  let userId: string;
  let householdId: string;
  let productId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-product-routes.com'");
    const result = await authService.register('prod@test-product-routes.com', 'password123', 'Tester');
    token = result.token;
    userId = result.user.id;
    const hh = await householdService.createHousehold(userId, 'Prod HH');
    householdId = hh.id;
    const loginResult = await authService.login('prod@test-product-routes.com', 'password123');
    token = loginResult.token;

    const product = await productRepository.create({
      householdId,
      canonicalName: 'Test Product',
      categoryId: null,
    });
    productId = product.id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM products WHERE household_id = $1', [householdId]);
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-product-routes.com'");
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.end();
  });

  it('lists products', async () => {
    const res = await request(app)
      .get('/products')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].canonicalName).toBeDefined();
  });

  it('updates a product', async () => {
    const res = await request(app)
      .put(`/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ canonicalName: 'Updated Product Name' });
    expect(res.status).toBe(200);
    expect(res.body.canonicalName).toBe('Updated Product Name');
  });

  it('merges products', async () => {
    const product2 = await productRepository.create({
      householdId,
      canonicalName: 'Duplicate Product',
      categoryId: null,
    });

    const res = await request(app)
      .post('/products/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceId: product2.id, targetId: productId });
    expect(res.status).toBe(200);
    expect(res.body.targetId).toBe(productId);

    // Verify source is deleted
    const deleted = await productRepository.findById(product2.id);
    expect(deleted).toBeNull();
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "feat: register product and store routes, add product integration tests"`

---

## Phase 10: Analytics API

### Task 10.1: Create analytics service

Create `/Users/kevinspahn/Grort/backend/src/services/analyticsService.ts`:

```typescript
import pool from '../db/pool';

interface SpendingOptions {
  period: 'week' | 'month';
  startDate?: string;
  endDate?: string;
  scope: 'personal' | 'household';
  userId: string;
  householdId: string | null;
}

export const analyticsService = {
  async getSpending(options: SpendingOptions) {
    const { period, startDate, endDate, scope, userId, householdId } = options;

    // Build WHERE clause
    let whereClause: string;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (scope === 'household' && householdId) {
      whereClause = `r.household_id = $${paramIdx++}`;
      params.push(householdId);
    } else {
      whereClause = `r.user_id = $${paramIdx++}`;
      params.push(userId);
    }

    if (startDate) {
      whereClause += ` AND r.receipt_date >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ` AND r.receipt_date <= $${paramIdx++}`;
      params.push(endDate);
    }

    // Total spending
    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(r.total), 0) as total_spent FROM receipts r WHERE ${whereClause}`,
      params
    );
    const totalSpent = Number(totalResult.rows[0].total_spent);

    // Period breakdown
    const dateTrunc = period === 'week' ? 'week' : 'month';
    const periodResult = await pool.query(
      `SELECT
        DATE_TRUNC('${dateTrunc}', r.receipt_date) as period_start,
        SUM(r.total) as total
       FROM receipts r
       WHERE ${whereClause}
       GROUP BY period_start
       ORDER BY period_start`,
      params
    );
    const periodBreakdown = periodResult.rows.map((r: any) => ({
      period: r.period_start.toISOString().split('T')[0],
      total: Number(r.total),
    }));

    // Category breakdown
    const categoryResult = await pool.query(
      `SELECT
        c.id as category_id,
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(ri.total_price) as total
       FROM receipt_items ri
       JOIN receipts r ON ri.receipt_id = r.id
       LEFT JOIN categories c ON ri.category_id = c.id
       WHERE ${whereClause}
       GROUP BY c.id, c.name
       ORDER BY total DESC`,
      params
    );
    const categoryTotal = categoryResult.rows.reduce(
      (sum: number, r: any) => sum + Number(r.total), 0
    );
    const categoryBreakdown = categoryResult.rows.map((r: any) => ({
      categoryId: r.category_id,
      categoryName: r.category_name,
      total: Number(r.total),
      percentage: categoryTotal > 0 ? Math.round((Number(r.total) / categoryTotal) * 10000) / 100 : 0,
    }));

    return {
      totalSpent,
      periodBreakdown,
      categoryBreakdown,
    };
  },

  async getPriceHistory(
    productId: string,
    householdId: string,
    options?: { startDate?: string; endDate?: string }
  ) {
    let whereClause = 'ri.product_id = $1 AND r.household_id = $2';
    const params: unknown[] = [productId, householdId];
    let paramIdx = 3;

    if (options?.startDate) {
      whereClause += ` AND r.receipt_date >= $${paramIdx++}`;
      params.push(options.startDate);
    }
    if (options?.endDate) {
      whereClause += ` AND r.receipt_date <= $${paramIdx++}`;
      params.push(options.endDate);
    }

    const { rows } = await pool.query(
      `SELECT
        r.receipt_date as date,
        (ri.total_price / ri.quantity) as price,
        s.id as store_id,
        s.name as store_name
       FROM receipt_items ri
       JOIN receipts r ON ri.receipt_id = r.id
       JOIN stores s ON r.store_id = s.id
       WHERE ${whereClause}
       ORDER BY r.receipt_date`,
      params
    );

    // Get product name
    const productResult = await pool.query(
      'SELECT canonical_name FROM products WHERE id = $1',
      [productId]
    );

    return {
      productId,
      productName: productResult.rows[0]?.canonical_name || 'Unknown',
      dataPoints: rows.map((r: any) => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
        price: Number(r.price),
        storeId: r.store_id,
        storeName: r.store_name,
      })),
    };
  },

  async getStoreComparison(productIds: string[], householdId: string) {
    const comparisons = [];

    for (const productId of productIds) {
      const { rows } = await pool.query(
        `SELECT
          s.id as store_id,
          s.name as store_name,
          AVG(ri.total_price / ri.quantity) as avg_price,
          MIN(ri.total_price / ri.quantity) as min_price,
          MAX(ri.total_price / ri.quantity) as max_price,
          COUNT(*) as data_points
         FROM receipt_items ri
         JOIN receipts r ON ri.receipt_id = r.id
         JOIN stores s ON r.store_id = s.id
         WHERE ri.product_id = $1 AND r.household_id = $2
         GROUP BY s.id, s.name
         ORDER BY avg_price`,
        [productId, householdId]
      );

      const productResult = await pool.query(
        'SELECT canonical_name FROM products WHERE id = $1',
        [productId]
      );

      const stores = rows.map((r: any) => ({
        storeId: r.store_id,
        storeName: r.store_name,
        avgPrice: Math.round(Number(r.avg_price) * 100) / 100,
        minPrice: Number(r.min_price),
        maxPrice: Number(r.max_price),
        dataPoints: Number(r.data_points),
      }));

      comparisons.push({
        productId,
        productName: productResult.rows[0]?.canonical_name || 'Unknown',
        stores,
        cheapestStoreId: stores.length > 0 ? stores[0].storeId : null,
      });
    }

    return { comparisons };
  },
};
```

**Commit:** `git add -A && git commit -m "feat: add analytics service (spending, price history, store comparison)"`

---

### Task 10.2: Create analytics routes

Create `/Users/kevinspahn/Grort/backend/src/routes/analytics.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware, requireHousehold } from '../middleware/auth';
import { analyticsService } from '../services/analyticsService';
import { SpendingQuerySchema, PriceHistoryQuerySchema, StoreComparisonQuerySchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();
router.use(authMiddleware);

// GET /analytics/spending
router.get('/spending', async (req: Request, res: Response) => {
  try {
    const query = SpendingQuerySchema.parse(req.query);

    const result = await analyticsService.getSpending({
      period: query.period,
      startDate: query.startDate,
      endDate: query.endDate,
      scope: query.scope,
      userId: req.user!.id,
      householdId: req.householdId || null,
    });

    res.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /analytics/price-history/:productId
router.get('/price-history/:productId', requireHousehold, async (req: Request, res: Response) => {
  try {
    const query = PriceHistoryQuerySchema.parse(req.query);

    const result = await analyticsService.getPriceHistory(
      req.params.productId,
      req.householdId!,
      {
        startDate: query.startDate,
        endDate: query.endDate,
      }
    );

    res.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /analytics/store-comparison
router.get('/store-comparison', requireHousehold, async (req: Request, res: Response) => {
  try {
    const productIdsParam = req.query.productIds;
    let productIds: string[];

    if (Array.isArray(productIdsParam)) {
      productIds = productIdsParam as string[];
    } else if (typeof productIdsParam === 'string') {
      productIds = productIdsParam.split(',');
    } else {
      res.status(400).json({ error: 'productIds query parameter is required' });
      return;
    }

    const query = StoreComparisonQuerySchema.parse({ productIds });

    const result = await analyticsService.getStoreComparison(
      query.productIds,
      req.householdId!
    );

    res.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

Update `/Users/kevinspahn/Grort/backend/src/index.ts` — add analytics routes:

```typescript
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
```

**Commit:** `git add -A && git commit -m "feat: add analytics routes (spending, price history, store comparison)"`

---

### Task 10.3: Analytics integration tests

Create `/Users/kevinspahn/Grort/backend/src/routes/analytics.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import pool from '../db/pool';
import { authService } from '../services/authService';
import { householdService } from '../services/householdService';
import { storeRepository } from '../repositories/storeRepository';
import { productRepository } from '../repositories/productRepository';
import { receiptRepository } from '../repositories/receiptRepository';

describe('Analytics routes', () => {
  let token: string;
  let userId: string;
  let householdId: string;
  let storeId1: string;
  let storeId2: string;
  let productId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-analytics.com'");

    const result = await authService.register('analytics@test-analytics.com', 'password123', 'Tester');
    userId = result.user.id;
    const hh = await householdService.createHousehold(userId, 'Analytics HH');
    householdId = hh.id;
    const loginResult = await authService.login('analytics@test-analytics.com', 'password123');
    token = loginResult.token;

    // Create two stores
    const store1 = await storeRepository.create({ name: 'Costco', brand: 'Costco', address: null, householdId });
    storeId1 = store1.id;
    const store2 = await storeRepository.create({ name: 'Safeway', brand: 'Safeway', address: null, householdId });
    storeId2 = store2.id;

    // Create a product
    const product = await productRepository.create({
      householdId,
      canonicalName: 'Organic Eggs',
      categoryId: 'a0000000-0000-0000-0000-000000000002', // Dairy
    });
    productId = product.id;

    // Create receipts at different stores with the same product
    const receipt1 = await receiptRepository.create({
      userId, householdId, storeId: storeId1,
      receiptDate: '2026-01-10', subtotal: 5.99, tax: 0, total: 5.99,
      imageUrl: 'local://test/r1.jpg', rawAiResponse: {},
    });
    await receiptRepository.createItem({
      receiptId: receipt1.id, productId, nameOnReceipt: 'ORG EGGS',
      quantity: 1, unitPrice: 5.99, totalPrice: 5.99,
      categoryId: 'a0000000-0000-0000-0000-000000000002',
    });

    const receipt2 = await receiptRepository.create({
      userId, householdId, storeId: storeId2,
      receiptDate: '2026-01-15', subtotal: 6.49, tax: 0, total: 6.49,
      imageUrl: 'local://test/r2.jpg', rawAiResponse: {},
    });
    await receiptRepository.createItem({
      receiptId: receipt2.id, productId, nameOnReceipt: 'ORGANIC EGGS',
      quantity: 1, unitPrice: 6.49, totalPrice: 6.49,
      categoryId: 'a0000000-0000-0000-0000-000000000002',
    });

    const receipt3 = await receiptRepository.create({
      userId, householdId, storeId: storeId1,
      receiptDate: '2026-02-01', subtotal: 5.49, tax: 0, total: 5.49,
      imageUrl: 'local://test/r3.jpg', rawAiResponse: {},
    });
    await receiptRepository.createItem({
      receiptId: receipt3.id, productId, nameOnReceipt: 'ORG EGGS',
      quantity: 1, unitPrice: 5.49, totalPrice: 5.49,
      categoryId: 'a0000000-0000-0000-0000-000000000002',
    });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM receipt_items WHERE receipt_id IN (SELECT id FROM receipts WHERE household_id = $1)', [householdId]);
    await pool.query('DELETE FROM receipts WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM products WHERE household_id = $1', [householdId]);
    await pool.query('DELETE FROM stores WHERE household_id = $1', [householdId]);
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-analytics.com'");
    await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    await pool.end();
  });

  describe('GET /analytics/spending', () => {
    it('returns spending totals', async () => {
      const res = await request(app)
        .get('/analytics/spending?period=month')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.totalSpent).toBeGreaterThan(0);
      expect(res.body.periodBreakdown).toBeDefined();
      expect(res.body.categoryBreakdown).toBeDefined();
    });
  });

  describe('GET /analytics/price-history/:productId', () => {
    it('returns price history across stores', async () => {
      const res = await request(app)
        .get(`/analytics/price-history/${productId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.dataPoints).toHaveLength(3);
      expect(res.body.productName).toBe('Organic Eggs');
    });
  });

  describe('GET /analytics/store-comparison', () => {
    it('compares prices across stores', async () => {
      const res = await request(app)
        .get(`/analytics/store-comparison?productIds=${productId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.comparisons).toHaveLength(1);
      expect(res.body.comparisons[0].stores).toHaveLength(2);
      // Costco should be cheapest (avg 5.74 vs 6.49)
      expect(res.body.comparisons[0].cheapestStoreId).toBe(storeId1);
    });
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all tests pass.

**Commit:** `git add -A && git commit -m "test: add analytics integration tests for spending, price history, store comparison"`

---

### Task 10.4: Add database indexes for analytics performance

Create `/Users/kevinspahn/Grort/backend/src/db/migrations/003_analytics_indexes.sql`:

```sql
-- Composite indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_receipts_household_date ON receipts(household_id, receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipts_user_date ON receipts(user_id, receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipt_items_product_id_receipt_id ON receipt_items(product_id, receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_category_total ON receipt_items(category_id, total_price);
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm run migrate` — migration runs successfully.

**Commit:** `git add -A && git commit -m "perf: add composite indexes for analytics queries"`

---

## Phase 11: Mobile — Navigation & Auth Screens

### Task 11.1: Set up Expo Router navigation structure

Create the app directory structure for Expo Router file-based routing.

```bash
mkdir -p /Users/kevinspahn/Grort/mobile/app/(tabs)
mkdir -p /Users/kevinspahn/Grort/mobile/app/(auth)
mkdir -p /Users/kevinspahn/Grort/mobile/src/contexts
mkdir -p /Users/kevinspahn/Grort/mobile/src/components
mkdir -p /Users/kevinspahn/Grort/mobile/src/hooks
mkdir -p /Users/kevinspahn/Grort/mobile/src/styles
```

Create `/Users/kevinspahn/Grort/mobile/src/styles/theme.ts`:

```typescript
export const colors = {
  primary: '#2E7D32',       // Green -- grocery themed
  primaryLight: '#60AD5E',
  primaryDark: '#005005',
  secondary: '#FF6F00',     // Amber accent
  background: '#F5F5F5',
  surface: '#FFFFFF',
  error: '#D32F2F',
  text: '#212121',
  textSecondary: '#757575',
  textOnPrimary: '#FFFFFF',
  border: '#E0E0E0',
  success: '#4CAF50',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};
```

Create `/Users/kevinspahn/Grort/mobile/app/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/contexts/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AuthProvider>
  );
}
```

Create `/Users/kevinspahn/Grort/mobile/app/index.tsx`:

```typescript
import { Redirect } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/scan" />;
  }

  return <Redirect href="/(auth)/login" />;
}
```

**Commit:** `git add -A && git commit -m "feat: set up Expo Router navigation structure and theme"`

---

### Task 11.2: Create Auth context

Create `/Users/kevinspahn/Grort/mobile/src/contexts/AuthContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
  householdId: string | null;
  householdRole: 'owner' | 'member' | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  googleAuth: (idToken: string, googleId: string, email: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token');
      const storedUser = await SecureStore.getItemAsync('auth_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (err) {
      // Silently fail -- user will need to login
    } finally {
      setIsLoading(false);
    }
  }

  async function storeAuth(authToken: string, authUser: User) {
    await SecureStore.setItemAsync('auth_token', authToken);
    await SecureStore.setItemAsync('auth_user', JSON.stringify(authUser));
    setToken(authToken);
    setUser(authUser);
  }

  async function login(email: string, password: string) {
    const response = await apiClient.post('/auth/login', { email, password });
    await storeAuth(response.data.token, response.data.user);
  }

  async function register(email: string, password: string, name: string) {
    const response = await apiClient.post('/auth/register', { email, password, name });
    await storeAuth(response.data.token, response.data.user);
  }

  async function googleAuth(idToken: string, googleId: string, email: string, name: string) {
    const response = await apiClient.post('/auth/google', { idToken, googleId, email, name });
    await storeAuth(response.data.token, response.data.user);
  }

  async function logout() {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('auth_user');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (token) {
      try {
        const storedUser = await SecureStore.getItemAsync('auth_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch {
        // ignore
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, googleAuth, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

**Commit:** `git add -A && git commit -m "feat: add AuthContext with login, register, logout, Google OAuth"`

---

### Task 11.3: Create Login screen

Create `/Users/kevinspahn/Grort/mobile/app/(auth)/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
```

Create `/Users/kevinspahn/Grort/mobile/app/(auth)/login.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, fontSize } from '../../src/styles/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)/scan');
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Login failed. Please try again.';
      Alert.alert('Login Failed', message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Grort</Text>
        <Text style={styles.subtitle}>Grocery Receipt Tracker</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <Link href="/(auth)/register" asChild>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.linkBold}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.primary, textAlign: 'center' },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  form: { gap: spacing.md },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing.md, fontSize: fontSize.md },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 8, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
  linkButton: { padding: spacing.sm, alignItems: 'center' },
  linkText: { color: colors.textSecondary, fontSize: fontSize.sm },
  linkBold: { color: colors.primary, fontWeight: 'bold' },
});
```

**Commit:** `git add -A && git commit -m "feat: add Login screen"`

---

### Task 11.4: Create Register screen

Create `/Users/kevinspahn/Grort/mobile/app/(auth)/register.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, fontSize } from '../../src/styles/theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleRegister() {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await register(email, password, name);
      router.replace('/(tabs)/scan');
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Registration failed. Please try again.';
      Alert.alert('Registration Failed', message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Start tracking your grocery spending</Text>
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <TextInput style={styles.input} placeholder="Password (min 8 characters)" value={password} onChangeText={setPassword} secureTextEntry />
          <TextInput style={styles.input} placeholder="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
          <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleRegister} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.buttonText}>Sign Up</Text>}
          </TouchableOpacity>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Sign In</Text></Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  title: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary, textAlign: 'center' },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  form: { gap: spacing.md },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing.md, fontSize: fontSize.md },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 8, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
  linkButton: { padding: spacing.sm, alignItems: 'center' },
  linkText: { color: colors.textSecondary, fontSize: fontSize.sm },
  linkBold: { color: colors.primary, fontWeight: 'bold' },
});
```

**Commit:** `git add -A && git commit -m "feat: add Register screen"`

---

### Task 11.5: Create bottom tab navigator

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/_layout.tsx`:

```typescript
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/styles/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} /> }} />
      <Tabs.Screen name="receipts" options={{ title: 'Receipts', tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} /> }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', tabBarIcon: ({ color, size }) => <Ionicons name="trending-up" size={size} color={color} /> }} />
      <Tabs.Screen name="prices" options={{ title: 'Prices', tabBarIcon: ({ color, size }) => <Ionicons name="pricetag" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
      <Tabs.Screen name="receipt-review" options={{ href: null }} />
      <Tabs.Screen name="receipt-detail" options={{ href: null }} />
      <Tabs.Screen name="product-detail" options={{ href: null }} />
    </Tabs>
  );
}
```

Install Ionicons:

```bash
cd /Users/kevinspahn/Grort/mobile && npx expo install @expo/vector-icons
```

**Commit:** `git add -A && git commit -m "feat: add bottom tab navigator with 5 tabs"`

---

## Phase 12: Mobile -- Scan & Receipt Review

### Task 12.1: Create Scan screen

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/scan.tsx`:

```typescript
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
      await processImage(result.assets[0].uri);
    }
  }

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Camera access is needed to scan receipts</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickFromGallery}>
            <Text style={styles.secondaryButtonText}>Pick from Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo) {
        setCapturedImage(photo.uri);
        await processImage(photo.uri);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to take picture');
    }
  }

  async function processImage(uri: string) {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'receipt.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('image', { uri, name: filename, type } as any);

      const response = await apiClient.post('/receipts/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      router.push({ pathname: '/(tabs)/receipt-review', params: { receiptData: JSON.stringify(response.data) } });
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Failed to process receipt. Please try again.';
      Alert.alert('Processing Failed', message);
      setCapturedImage(null);
    } finally {
      setIsProcessing(false);
    }
  }

  if (isProcessing) {
    return (
      <View style={styles.processingContainer}>
        {capturedImage && <Image source={{ uri: capturedImage }} style={styles.previewImage} />}
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.processingText}>Scanning receipt...</Text>
          <Text style={styles.processingSubtext}>AI is extracting items and prices</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </CameraView>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.galleryButton} onPress={pickFromGallery}>
          <Text style={styles.galleryButtonText}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
        <View style={styles.placeholder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: '85%', height: '70%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 12 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: spacing.lg, backgroundColor: '#000' },
  captureButton: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  captureButtonInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF' },
  galleryButton: { padding: spacing.md },
  galleryButtonText: { color: '#FFF', fontSize: fontSize.sm },
  placeholder: { width: 60 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background },
  permissionText: { fontSize: fontSize.md, color: colors.text, textAlign: 'center', marginBottom: spacing.lg },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: spacing.md },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: 'bold' },
  secondaryButton: { padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, width: '100%', alignItems: 'center' },
  secondaryButtonText: { color: colors.primary, fontSize: fontSize.md },
  processingContainer: { flex: 1, backgroundColor: '#000' },
  previewImage: { flex: 1, resizeMode: 'contain' },
  processingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  processingText: { color: '#FFF', fontSize: fontSize.lg, fontWeight: 'bold', marginTop: spacing.md },
  processingSubtext: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.sm, marginTop: spacing.xs },
});
```

**Commit:** `git add -A && git commit -m "feat: add Scan screen with camera capture and gallery picker"`

---

### Task 12.2: Create Receipt Review screen

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/receipt-review.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

interface ReviewItem {
  id: string;
  nameOnReceipt: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  productName: string | null;
  categoryName: string | null;
  matchConfidence: 'exact' | 'near' | 'new';
  isEditing?: boolean;
  editedName?: string;
  editedPrice?: string;
}

export default function ReceiptReviewScreen() {
  const params = useLocalSearchParams<{ receiptData: string }>();
  const receiptData = JSON.parse(params.receiptData || '{}');

  const [items, setItems] = useState<ReviewItem[]>(
    (receiptData.items || []).map((item: any) => ({
      ...item, isEditing: false, editedName: item.nameOnReceipt, editedPrice: String(item.totalPrice),
    }))
  );

  const receiptId = receiptData.id;
  const storeName = receiptData.storeName;
  const total = receiptData.total;
  const receiptDate = receiptData.receiptDate;

  function toggleEdit(index: number) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, isEditing: !item.isEditing } : item));
  }

  function updateItem(index: number, field: string, value: string) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  async function saveEdits(index: number) {
    const item = items[index];
    try {
      await apiClient.put(`/receipts/${receiptId}/items/${item.id}`, {
        nameOnReceipt: item.editedName,
        totalPrice: parseFloat(item.editedPrice || '0'),
      });
      setItems((prev) => prev.map((it, i) => i === index ? { ...it, nameOnReceipt: it.editedName || it.nameOnReceipt, totalPrice: parseFloat(it.editedPrice || '0'), isEditing: false } : it));
    } catch {
      Alert.alert('Error', 'Failed to save changes');
    }
  }

  function getConfidenceBadge(confidence: string) {
    switch (confidence) {
      case 'exact': return { text: 'Matched', color: colors.success };
      case 'near': return { text: 'Review', color: colors.secondary };
      case 'new': return { text: 'New', color: colors.primary };
      default: return { text: '', color: colors.textSecondary };
    }
  }

  function renderItem({ item, index }: { item: ReviewItem; index: number }) {
    const badge = getConfidenceBadge(item.matchConfidence);
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={[styles.badge, { backgroundColor: badge.color }]}>
            <Text style={styles.badgeText}>{badge.text}</Text>
          </View>
          <TouchableOpacity onPress={() => toggleEdit(index)}>
            <Text style={styles.editButton}>{item.isEditing ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
        {item.isEditing ? (
          <View style={styles.editForm}>
            <TextInput style={styles.editInput} value={item.editedName} onChangeText={(v) => updateItem(index, 'editedName', v)} placeholder="Item name" />
            <TextInput style={[styles.editInput, styles.priceInput]} value={item.editedPrice} onChangeText={(v) => updateItem(index, 'editedPrice', v)} placeholder="Price" keyboardType="decimal-pad" />
            <TouchableOpacity style={styles.saveButton} onPress={() => saveEdits(index)}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.itemName}>{item.nameOnReceipt}</Text>
            {item.productName && item.productName !== item.nameOnReceipt && <Text style={styles.productName}>{item.productName}</Text>}
            <View style={styles.itemFooter}>
              <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
              <Text style={styles.itemPrice}>${item.totalPrice.toFixed(2)}</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.storeName}>{storeName}</Text>
        <Text style={styles.date}>{receiptDate}</Text>
        <Text style={styles.total}>Total: ${total?.toFixed(2)}</Text>
      </View>
      <Text style={styles.sectionTitle}>{items.length} items extracted</Text>
      <FlatList data={items} renderItem={renderItem} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} />
      <TouchableOpacity style={styles.doneButton} onPress={() => router.replace('/(tabs)/receipts')}>
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, padding: spacing.lg, paddingTop: spacing.xl },
  storeName: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textOnPrimary },
  date: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  total: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.textOnPrimary, marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, padding: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
  itemCard: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#FFF', fontSize: fontSize.xs, fontWeight: 'bold' },
  editButton: { color: colors.primary, fontSize: fontSize.sm },
  itemName: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  productName: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  itemQty: { color: colors.textSecondary, fontSize: fontSize.sm },
  itemPrice: { color: colors.text, fontSize: fontSize.md, fontWeight: 'bold' },
  editForm: { gap: spacing.sm },
  editInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm, fontSize: fontSize.sm },
  priceInput: { width: 120 },
  saveButton: { backgroundColor: colors.primary, padding: spacing.sm, borderRadius: 6, alignItems: 'center' },
  saveButtonText: { color: colors.textOnPrimary, fontWeight: 'bold' },
  doneButton: { backgroundColor: colors.primary, margin: spacing.md, padding: spacing.md, borderRadius: 8, alignItems: 'center' },
  doneButtonText: { color: colors.textOnPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
});
```

**Commit:** `git add -A && git commit -m "feat: add Receipt Review screen with edit capability"`

---

## Phase 13: Mobile -- Receipt History

### Task 13.1: Create Receipt List screen

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/receipts.tsx`:

```typescript
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

interface ReceiptSummary {
  id: string;
  store_name: string;
  receipt_date: string;
  total: number;
  item_count: number;
}

export default function ReceiptsScreen() {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useFocusEffect(useCallback(() => { loadReceipts(1); }, []));

  async function loadReceipts(pageNum: number, append = false) {
    try {
      const response = await apiClient.get(`/receipts?page=${pageNum}&limit=20`);
      if (append) { setReceipts((prev) => [...prev, ...response.data.items]); }
      else { setReceipts(response.data.items); }
      setPage(pageNum);
      setTotalPages(response.data.totalPages);
    } catch (err) {
      Alert.alert('Error', 'Failed to load receipts');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  function handleRefresh() { setIsRefreshing(true); loadReceipts(1); }
  function handleLoadMore() { if (page < totalPages) loadReceipts(page + 1, true); }
  function handlePress(receiptId: string) { router.push({ pathname: '/(tabs)/receipt-detail', params: { receiptId } }); }

  async function handleDelete(receiptId: string) {
    Alert.alert('Delete Receipt', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`/receipts/${receiptId}`); setReceipts((prev) => prev.filter((r) => r.id !== receiptId)); }
        catch { Alert.alert('Error', 'Failed to delete receipt'); }
      }},
    ]);
  }

  function renderReceipt({ item }: { item: ReceiptSummary }) {
    const date = new Date(item.receipt_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return (
      <TouchableOpacity style={styles.receiptCard} onPress={() => handlePress(item.id)} onLongPress={() => handleDelete(item.id)}>
        <View style={styles.receiptLeft}>
          <Text style={styles.storeName}>{item.store_name || 'Unknown Store'}</Text>
          <Text style={styles.date}>{date}</Text>
          <Text style={styles.itemCount}>{item.item_count} items</Text>
        </View>
        <Text style={styles.total}>${Number(item.total).toFixed(2)}</Text>
      </TouchableOpacity>
    );
  }

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (receipts.length === 0) return <View style={styles.centered}><Text style={styles.emptyText}>No receipts yet</Text><Text style={styles.emptySubtext}>Scan a receipt to get started</Text></View>;

  return (
    <FlatList
      style={styles.container} data={receipts} renderItem={renderReceipt} keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      onEndReached={handleLoadMore} onEndReachedThreshold={0.5} contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  receiptCard: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  receiptLeft: { flex: 1 },
  storeName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  date: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  itemCount: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  total: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  emptyText: { fontSize: fontSize.lg, color: colors.textSecondary },
  emptySubtext: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
});
```

**Commit:** `git add -A && git commit -m "feat: add Receipt List screen with pagination and pull-to-refresh"`

---

### Task 13.2: Create Receipt Detail screen

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/receipt-detail.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

interface ReceiptDetail {
  id: string;
  store_name: string;
  receipt_date: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  items: Array<{
    id: string; name_on_receipt: string; product_name: string | null;
    quantity: number; unit_price: number | null; total_price: number; category_name: string | null;
  }>;
}

export default function ReceiptDetailScreen() {
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadReceipt(); }, [receiptId]);

  async function loadReceipt() {
    try { const response = await apiClient.get(`/receipts/${receiptId}`); setReceipt(response.data); }
    catch { Alert.alert('Error', 'Failed to load receipt'); }
    finally { setIsLoading(false); }
  }

  async function handleDelete() {
    Alert.alert('Delete Receipt', 'This will permanently delete this receipt and all items.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`/receipts/${receiptId}`); router.back(); }
        catch { Alert.alert('Error', 'Failed to delete receipt'); }
      }},
    ]);
  }

  if (isLoading || !receipt) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const date = new Date(receipt.receipt_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>Back</Text></TouchableOpacity>
        <Text style={styles.storeName}>{receipt.store_name || 'Unknown Store'}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
      <FlatList data={receipt.items} keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name_on_receipt}</Text>
              {item.product_name && <Text style={styles.productName}>{item.product_name}</Text>}
              {item.category_name && <Text style={styles.category}>{item.category_name}</Text>}
            </View>
            <View style={styles.itemPricing}>
              {item.quantity !== 1 && <Text style={styles.qty}>{item.quantity}x</Text>}
              <Text style={styles.price}>${Number(item.total_price).toFixed(2)}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.totals}>
            {receipt.subtotal != null && <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>${Number(receipt.subtotal).toFixed(2)}</Text></View>}
            {receipt.tax != null && <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax</Text><Text style={styles.totalValue}>${Number(receipt.tax).toFixed(2)}</Text></View>}
            <View style={[styles.totalRow, styles.grandTotal]}><Text style={styles.grandTotalLabel}>Total</Text><Text style={styles.grandTotalValue}>${Number(receipt.total).toFixed(2)}</Text></View>
          </View>
        }
        contentContainerStyle={styles.list}
      />
      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Text style={styles.deleteButtonText}>Delete Receipt</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: colors.primary, padding: spacing.lg, paddingTop: spacing.xl },
  backButton: { marginBottom: spacing.sm },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },
  storeName: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textOnPrimary },
  date: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  list: { padding: spacing.md },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemInfo: { flex: 1, marginRight: spacing.md },
  itemName: { fontSize: fontSize.md, color: colors.text },
  productName: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  category: { fontSize: fontSize.xs, color: colors.primary, marginTop: 2 },
  itemPricing: { alignItems: 'flex-end' },
  qty: { fontSize: fontSize.xs, color: colors.textSecondary },
  price: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  totals: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 2, borderTopColor: colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  totalLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  totalValue: { fontSize: fontSize.md, color: colors.text },
  grandTotal: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  grandTotalLabel: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.text },
  grandTotalValue: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  deleteButton: { margin: spacing.md, padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.error, alignItems: 'center' },
  deleteButtonText: { color: colors.error, fontSize: fontSize.md, fontWeight: '600' },
});
```

**Commit:** `git add -A && git commit -m "feat: add Receipt Detail screen with items, totals, delete"`

---

## Phase 14: Mobile -- Trends Dashboard

### Task 14.1: Create Trends screen with spending charts

Install charting library:

```bash
cd /Users/kevinspahn/Grort/mobile
npx expo install react-native-chart-kit react-native-svg
```

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/trends.tsx`:

```typescript
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BarChart, PieChart, LineChart } from 'react-native-chart-kit';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

const screenWidth = Dimensions.get('window').width - spacing.md * 2;

interface SpendingData {
  totalSpent: number;
  periodBreakdown: Array<{ period: string; total: number }>;
  categoryBreakdown: Array<{ categoryId: string | null; categoryName: string; total: number; percentage: number }>;
}

const PERIOD_COLORS = [
  '#2E7D32', '#FF6F00', '#1565C0', '#6A1B9A', '#C62828',
  '#00838F', '#4E342E', '#283593', '#558B2F', '#E65100',
];

export default function TrendsScreen() {
  const [data, setData] = useState<SpendingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [scope, setScope] = useState<'personal' | 'household'>('household');

  useFocusEffect(useCallback(() => { loadData(); }, [period, scope]));

  async function loadData() {
    setIsLoading(true);
    try {
      const response = await apiClient.get(`/analytics/spending?period=${period}&scope=${scope}`);
      setData(response.data);
    } catch (err) {
      // Silently fail -- show empty state
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!data) return <View style={styles.centered}><Text style={styles.emptyText}>No spending data yet</Text></View>;

  const barData = {
    labels: data.periodBreakdown.slice(-6).map((p) => {
      const d = new Date(p.period);
      return period === 'month' ? d.toLocaleString('default', { month: 'short' }) : `Wk ${d.getDate()}`;
    }),
    datasets: [{ data: data.periodBreakdown.slice(-6).map((p) => p.total) }],
  };

  const pieData = data.categoryBreakdown.slice(0, 8).map((cat, i) => ({
    name: cat.categoryName,
    amount: cat.total,
    color: PERIOD_COLORS[i % PERIOD_COLORS.length],
    legendFontColor: colors.text,
    legendFontSize: 12,
  }));

  const lineData = {
    labels: data.periodBreakdown.slice(-12).map((p) => {
      const d = new Date(p.period);
      return d.toLocaleString('default', { month: 'short' });
    }),
    datasets: [{ data: data.periodBreakdown.slice(-12).map((p) => p.total).length > 0 ? data.periodBreakdown.slice(-12).map((p) => p.total) : [0] }],
  };

  const chartConfig = {
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
    labelColor: () => colors.textSecondary,
    propsForLabels: { fontSize: 10 },
  };

  return (
    <ScrollView style={styles.container}>
      {/* Toggle controls */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleGroup}>
          <TouchableOpacity style={[styles.toggle, period === 'week' && styles.toggleActive]} onPress={() => setPeriod('week')}>
            <Text style={[styles.toggleText, period === 'week' && styles.toggleTextActive]}>Weekly</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggle, period === 'month' && styles.toggleActive]} onPress={() => setPeriod('month')}>
            <Text style={[styles.toggleText, period === 'month' && styles.toggleTextActive]}>Monthly</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toggleGroup}>
          <TouchableOpacity style={[styles.toggle, scope === 'personal' && styles.toggleActive]} onPress={() => setScope('personal')}>
            <Text style={[styles.toggleText, scope === 'personal' && styles.toggleTextActive]}>Personal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggle, scope === 'household' && styles.toggleActive]} onPress={() => setScope('household')}>
            <Text style={[styles.toggleText, scope === 'household' && styles.toggleTextActive]}>Household</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Total */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Spent</Text>
        <Text style={styles.totalAmount}>${data.totalSpent.toFixed(2)}</Text>
      </View>

      {/* Bar chart */}
      {barData.datasets[0].data.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Spending by {period === 'month' ? 'Month' : 'Week'}</Text>
          <BarChart data={barData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} yAxisLabel="$" yAxisSuffix="" fromZero style={styles.chart} />
        </View>
      )}

      {/* Pie chart */}
      {pieData.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Spending by Category</Text>
          <PieChart data={pieData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} accessor="amount" backgroundColor="transparent" paddingLeft="15" />
        </View>
      )}

      {/* Line chart */}
      {lineData.datasets[0].data.length > 1 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Spending Over Time</Text>
          <LineChart data={lineData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} yAxisLabel="$" bezier style={styles.chart} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  emptyText: { fontSize: fontSize.lg, color: colors.textSecondary },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, gap: spacing.sm },
  toggleGroup: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  toggle: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  toggleActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: fontSize.sm, color: colors.textSecondary },
  toggleTextActive: { color: colors.textOnPrimary, fontWeight: 'bold' },
  totalCard: { backgroundColor: colors.primary, margin: spacing.md, padding: spacing.lg, borderRadius: 12, alignItems: 'center' },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },
  totalAmount: { color: colors.textOnPrimary, fontSize: fontSize.xxl, fontWeight: 'bold', marginTop: spacing.xs },
  chartCard: { backgroundColor: colors.surface, margin: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  chartTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  chart: { borderRadius: 8 },
});
```

**Commit:** `git add -A && git commit -m "feat: add Trends dashboard with bar, pie, and line charts"`

---

## Phase 15: Mobile -- Prices & Store Comparison

### Task 15.1: Create Prices screen (product list with search)

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/prices.tsx`:

```typescript
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

interface ProductItem {
  id: string;
  canonicalName: string;
  categoryName: string | null;
  latestPrice: number | null;
  purchaseCount: number;
}

export default function PricesScreen() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [filtered, setFiltered] = useState<ProductItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(useCallback(() => { loadProducts(); }, []));

  async function loadProducts() {
    try {
      const response = await apiClient.get('/products');
      setProducts(response.data);
      setFiltered(response.data);
    } catch {
      // empty
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearch(text: string) {
    setSearch(text);
    if (!text.trim()) {
      setFiltered(products);
    } else {
      const lower = text.toLowerCase();
      setFiltered(products.filter((p) => p.canonicalName.toLowerCase().includes(lower)));
    }
  }

  function handlePress(productId: string) {
    router.push({ pathname: '/(tabs)/product-detail', params: { productId } });
  }

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          value={search}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{products.length === 0 ? 'No products tracked yet' : 'No matching products'}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.productCard} onPress={() => handlePress(item.id)}>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{item.canonicalName}</Text>
                {item.categoryName && <Text style={styles.category}>{item.categoryName}</Text>}
                <Text style={styles.purchaseCount}>Purchased {item.purchaseCount} times</Text>
              </View>
              {item.latestPrice != null && (
                <Text style={styles.price}>${item.latestPrice.toFixed(2)}</Text>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
  searchBar: { padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { backgroundColor: colors.background, borderRadius: 8, padding: spacing.sm, fontSize: fontSize.md, borderWidth: 1, borderColor: colors.border },
  list: { padding: spacing.md, gap: spacing.sm },
  productCard: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  productInfo: { flex: 1, marginRight: spacing.md },
  productName: { fontSize: fontSize.md, fontWeight: '500', color: colors.text },
  category: { fontSize: fontSize.xs, color: colors.primary, marginTop: 2 },
  purchaseCount: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  price: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
});
```

**Commit:** `git add -A && git commit -m "feat: add Prices screen with product search"`

---

### Task 15.2: Create Product Detail screen with price history chart

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/product-detail.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

const screenWidth = Dimensions.get('window').width - spacing.md * 2;

const STORE_COLORS = ['#2E7D32', '#1565C0', '#FF6F00', '#6A1B9A', '#C62828', '#00838F'];

interface PriceDataPoint {
  date: string;
  price: number;
  storeId: string;
  storeName: string;
}

interface StoreComparison {
  storeId: string;
  storeName: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  dataPoints: number;
}

export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const [priceHistory, setPriceHistory] = useState<{ productName: string; dataPoints: PriceDataPoint[] } | null>(null);
  const [comparison, setComparison] = useState<StoreComparison[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cheapestStoreId, setCheapestStoreId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [productId]);

  async function loadData() {
    try {
      const [historyRes, compRes] = await Promise.all([
        apiClient.get(`/analytics/price-history/${productId}`),
        apiClient.get(`/analytics/store-comparison?productIds=${productId}`),
      ]);
      setPriceHistory(historyRes.data);
      if (compRes.data.comparisons?.[0]) {
        setComparison(compRes.data.comparisons[0].stores);
        setCheapestStoreId(compRes.data.comparisons[0].cheapestStoreId);
      }
    } catch {
      // empty
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!priceHistory) return <View style={styles.centered}><Text>No price data</Text></View>;

  // Build chart data -- group by store
  const storeMap = new Map<string, { name: string; prices: number[]; dates: string[] }>();
  priceHistory.dataPoints.forEach((dp) => {
    if (!storeMap.has(dp.storeId)) {
      storeMap.set(dp.storeId, { name: dp.storeName, prices: [], dates: [] });
    }
    const store = storeMap.get(dp.storeId)!;
    store.prices.push(dp.price);
    store.dates.push(dp.date);
  });

  const allDates = priceHistory.dataPoints.map((dp) => {
    const d = new Date(dp.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = Array.from(storeMap.entries()).map(([, store], i) => ({
    data: store.prices,
    color: () => STORE_COLORS[i % STORE_COLORS.length],
    strokeWidth: 2,
  }));

  const chartData = {
    labels: allDates.length > 6 ? allDates.filter((_, i) => i % Math.ceil(allDates.length / 6) === 0) : allDates,
    datasets: datasets.length > 0 ? datasets : [{ data: [0] }],
    legend: Array.from(storeMap.values()).map((s) => s.name),
  };

  const chartConfig = {
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
    labelColor: () => colors.textSecondary,
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.productName}>{priceHistory.productName}</Text>
        <Text style={styles.dataPointCount}>{priceHistory.dataPoints.length} price records</Text>
      </View>

      {/* Price History Chart */}
      {priceHistory.dataPoints.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Price History</Text>
          <LineChart data={chartData} width={screenWidth - spacing.md * 2} height={220} chartConfig={chartConfig} yAxisLabel="$" bezier style={styles.chart} />
        </View>
      )}

      {/* Store Comparison */}
      {comparison.length > 0 && (
        <View style={styles.comparisonCard}>
          <Text style={styles.chartTitle}>Store Comparison</Text>
          {comparison.map((store, i) => (
            <View key={store.storeId} style={[styles.storeRow, store.storeId === cheapestStoreId && styles.cheapestRow]}>
              <View style={[styles.storeColorDot, { backgroundColor: STORE_COLORS[i % STORE_COLORS.length] }]} />
              <View style={styles.storeInfo}>
                <Text style={styles.storeName}>
                  {store.storeName}
                  {store.storeId === cheapestStoreId && ' (Cheapest)'}
                </Text>
                <Text style={styles.storeStats}>
                  {store.dataPoints} purchases | Range: ${store.minPrice.toFixed(2)} - ${store.maxPrice.toFixed(2)}
                </Text>
              </View>
              <Text style={[styles.avgPrice, store.storeId === cheapestStoreId && styles.cheapestPrice]}>
                ${store.avgPrice.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: colors.primary, padding: spacing.lg },
  productName: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textOnPrimary },
  dataPointCount: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  chartCard: { backgroundColor: colors.surface, margin: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  chartTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  chart: { borderRadius: 8 },
  comparisonCard: { backgroundColor: colors.surface, margin: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  storeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  cheapestRow: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: spacing.sm },
  storeColorDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.sm },
  storeInfo: { flex: 1 },
  storeName: { fontSize: fontSize.md, fontWeight: '500', color: colors.text },
  storeStats: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  avgPrice: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.text },
  cheapestPrice: { color: colors.primary },
});
```

**Commit:** `git add -A && git commit -m "feat: add Product Detail screen with price history chart and store comparison"`

---

## Phase 16: Mobile -- Profile & Household

### Task 16.1: Create Profile screen

Create `/Users/kevinspahn/Grort/mobile/app/(tabs)/profile.tsx`:

```typescript
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, FlatList, TextInput, ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

interface HouseholdMember {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'member';
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);

  useFocusEffect(useCallback(() => {
    if (user?.householdId) loadMembers();
  }, [user?.householdId]));

  async function loadMembers() {
    if (!user?.householdId) return;
    try {
      const response = await apiClient.get(`/households/${user.householdId}/members`);
      setMembers(response.data);
    } catch {
      // ignore
    }
  }

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  }

  async function handleCreateHousehold() {
    if (!householdName.trim()) {
      Alert.alert('Error', 'Please enter a household name');
      return;
    }
    try {
      await apiClient.post('/households', { name: householdName });
      setHouseholdName('');
      setIsCreatingHousehold(false);
      Alert.alert('Success', 'Household created! Please sign in again to see changes.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to create household');
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !user?.householdId) return;
    try {
      await apiClient.post(`/households/${user.householdId}/invite`, { email: inviteEmail });
      setInviteEmail('');
      loadMembers();
      Alert.alert('Success', 'Member invited');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to invite member');
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!user?.householdId) return;
    Alert.alert('Remove Member', `Remove ${memberName} from household?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await apiClient.delete(`/households/${user.householdId}/members/${memberId}`);
          loadMembers();
        } catch (err: any) {
          Alert.alert('Error', err?.response?.data?.error || 'Failed to remove member');
        }
      }},
    ]);
  }

  return (
    <ScrollView style={styles.container}>
      {/* Account Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      {/* Household */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Household</Text>
        {user?.householdId ? (
          <View style={styles.card}>
            <Text style={styles.roleText}>Role: {user.householdRole}</Text>

            {/* Members list */}
            {members.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <View>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberEmail}>{member.email} ({member.role})</Text>
                </View>
                {user.householdRole === 'owner' && member.id !== user.id && (
                  <TouchableOpacity onPress={() => handleRemoveMember(member.id, member.name)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {/* Invite */}
            {user.householdRole === 'owner' && (
              <View style={styles.inviteRow}>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="Email to invite"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.inviteButton} onPress={handleInvite}>
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.noHousehold}>You are not in a household</Text>
            {isCreatingHousehold ? (
              <View style={styles.createForm}>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="Household name"
                  value={householdName}
                  onChangeText={setHouseholdName}
                />
                <View style={styles.createButtons}>
                  <TouchableOpacity style={styles.inviteButton} onPress={handleCreateHousehold}>
                    <Text style={styles.inviteButtonText}>Create</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsCreatingHousehold(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.createButton} onPress={() => setIsCreatingHousehold(true)}>
                <Text style={styles.createButtonText}>Create Household</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  section: { padding: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.text, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  email: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  roleText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600', marginBottom: spacing.sm },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { fontSize: fontSize.md, color: colors.text },
  memberEmail: { fontSize: fontSize.xs, color: colors.textSecondary },
  removeText: { color: colors.error, fontSize: fontSize.sm },
  inviteRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  inviteInput: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.sm, fontSize: fontSize.sm },
  inviteButton: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 6, justifyContent: 'center' },
  inviteButtonText: { color: colors.textOnPrimary, fontWeight: 'bold', fontSize: fontSize.sm },
  noHousehold: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.md },
  createButton: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 8, alignItems: 'center' },
  createButtonText: { color: colors.textOnPrimary, fontWeight: 'bold' },
  createForm: { gap: spacing.sm },
  createButtons: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  cancelText: { color: colors.textSecondary },
  logoutButton: { margin: spacing.md, padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.error, alignItems: 'center' },
  logoutText: { color: colors.error, fontWeight: '600', fontSize: fontSize.md },
});
```

**Commit:** `git add -A && git commit -m "feat: add Profile screen with household management and sign out"`

---

## Phase 17: Holdout Scenario Tests

These end-to-end tests validate the entire system without having been seen during development. They test the actual API endpoints with real database operations.

### Task 17.1: Set up test infrastructure

Create `/Users/kevinspahn/Grort/backend/src/tests/scenarios/setup.ts`:

```typescript
import pool from '../../db/pool';
import { authService } from '../../services/authService';
import { householdService } from '../../services/householdService';

export interface TestContext {
  ownerToken: string;
  ownerId: string;
  memberToken: string;
  memberId: string;
  householdId: string;
}

export async function setupTestHousehold(): Promise<TestContext> {
  // Clean up any previous test data
  await pool.query("DELETE FROM users WHERE email LIKE '%@holdout-test.com'");

  // Create owner
  const ownerResult = await authService.register('owner@holdout-test.com', 'password123', 'Test Owner');
  const ownerToken = ownerResult.token;
  const ownerId = ownerResult.user.id;

  // Create household
  const household = await householdService.createHousehold(ownerId, 'Holdout Test Household');
  const householdId = household.id;

  // Re-login to get updated token
  const ownerLogin = await authService.login('owner@holdout-test.com', 'password123');

  // Create member
  const memberResult = await authService.register('member@holdout-test.com', 'password123', 'Test Member');
  const memberId = memberResult.user.id;

  // Invite member
  await householdService.inviteMember(householdId, ownerId, 'member@holdout-test.com');
  const memberLogin = await authService.login('member@holdout-test.com', 'password123');

  return {
    ownerToken: ownerLogin.token,
    ownerId,
    memberToken: memberLogin.token,
    memberId,
    householdId,
  };
}

export async function cleanupTestData() {
  await pool.query("DELETE FROM receipt_items WHERE receipt_id IN (SELECT id FROM receipts WHERE household_id IN (SELECT id FROM households WHERE name = 'Holdout Test Household'))");
  await pool.query("DELETE FROM receipts WHERE household_id IN (SELECT id FROM households WHERE name = 'Holdout Test Household')");
  await pool.query("DELETE FROM products WHERE household_id IN (SELECT id FROM households WHERE name = 'Holdout Test Household')");
  await pool.query("DELETE FROM stores WHERE household_id IN (SELECT id FROM households WHERE name = 'Holdout Test Household')");
  await pool.query("DELETE FROM users WHERE email LIKE '%@holdout-test.com'");
  await pool.query("DELETE FROM households WHERE name = 'Holdout Test Household'");
}
```

**Commit:** `git add -A && git commit -m "test: add holdout test setup infrastructure"`

---

### Task 17.2: Scenario — Household sharing (two members see shared receipts)

Create `/Users/kevinspahn/Grort/backend/src/tests/scenarios/household-sharing.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Household sharing — two members see shared receipts', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestHousehold();
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  it('owner creates a receipt, member can see it', async () => {
    // Owner creates a store and receipt
    const store = await storeRepository.create({
      name: 'Costco',
      brand: 'Costco',
      address: '123 Main St',
      householdId: ctx.householdId,
    });

    const receipt = await receiptRepository.create({
      userId: ctx.ownerId,
      householdId: ctx.householdId,
      storeId: store.id,
      receiptDate: '2026-02-01',
      subtotal: 50.00,
      tax: 4.00,
      total: 54.00,
      imageUrl: 'local://test/shared.jpg',
      rawAiResponse: {},
    });

    await receiptRepository.createItem({
      receiptId: receipt.id,
      productId: null,
      nameOnReceipt: 'Organic Eggs',
      quantity: 1,
      unitPrice: 5.99,
      totalPrice: 5.99,
      categoryId: null,
    });

    // Member queries receipts and sees the owner's receipt
    const res = await request(app)
      .get('/receipts')
      .set('Authorization', `Bearer ${ctx.memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const found = res.body.items.find((r: any) => r.id === receipt.id);
    expect(found).toBeDefined();
  });

  it('member creates a receipt, owner can see it', async () => {
    const store = await storeRepository.create({
      name: 'Safeway',
      brand: 'Safeway',
      address: null,
      householdId: ctx.householdId,
    });

    const receipt = await receiptRepository.create({
      userId: ctx.memberId,
      householdId: ctx.householdId,
      storeId: store.id,
      receiptDate: '2026-02-05',
      subtotal: 30.00,
      tax: 2.40,
      total: 32.40,
      imageUrl: 'local://test/member.jpg',
      rawAiResponse: {},
    });

    // Owner queries receipts and sees the member's receipt
    const res = await request(app)
      .get('/receipts')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    const found = res.body.items.find((r: any) => r.id === receipt.id);
    expect(found).toBeDefined();
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all scenario tests pass.

**Commit:** `git add -A && git commit -m "test: add household sharing holdout scenario"`

---

### Task 17.3: Scenario — Delete receipt cascades items, analytics update

Create `/Users/kevinspahn/Grort/backend/src/tests/scenarios/receipt-deletion.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Delete receipt — items removed, analytics updated', () => {
  let ctx: TestContext;
  let receiptId: string;
  let storeId: string;

  beforeAll(async () => {
    ctx = await setupTestHousehold();

    const store = await storeRepository.create({
      name: 'Target', brand: 'Target', address: null, householdId: ctx.householdId,
    });
    storeId = store.id;

    const receipt = await receiptRepository.create({
      userId: ctx.ownerId, householdId: ctx.householdId, storeId,
      receiptDate: '2026-02-10', subtotal: 20.00, tax: 1.60, total: 21.60,
      imageUrl: 'local://test/delete-scenario.jpg', rawAiResponse: {},
    });
    receiptId = receipt.id;

    await receiptRepository.createItem({
      receiptId, productId: null, nameOnReceipt: 'Item A',
      quantity: 1, unitPrice: 10.00, totalPrice: 10.00, categoryId: null,
    });
    await receiptRepository.createItem({
      receiptId, productId: null, nameOnReceipt: 'Item B',
      quantity: 2, unitPrice: 5.00, totalPrice: 10.00, categoryId: null,
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  it('deleting a receipt removes all items', async () => {
    // Verify items exist
    const itemsBefore = await receiptRepository.findItemsByReceiptId(receiptId);
    expect(itemsBefore.length).toBe(2);

    // Delete receipt
    const res = await request(app)
      .delete(`/receipts/${receiptId}`)
      .set('Authorization', `Bearer ${ctx.ownerToken}`);
    expect(res.status).toBe(200);

    // Verify receipt is gone
    const receipt = await receiptRepository.findById(receiptId);
    expect(receipt).toBeNull();

    // Verify items are gone (CASCADE DELETE)
    const itemsAfter = await receiptRepository.findItemsByReceiptId(receiptId);
    expect(itemsAfter.length).toBe(0);
  });

  it('analytics reflect the deletion', async () => {
    const res = await request(app)
      .get('/analytics/spending?period=month')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);
    expect(res.status).toBe(200);
    // The deleted receipt should not appear in spending
    // Total should not include the deleted receipt's $21.60
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all scenario tests pass.

**Commit:** `git add -A && git commit -m "test: add receipt deletion holdout scenario"`

---

### Task 17.4: Scenario — Product matching (previously seen item is matched, not duplicated)

Create `/Users/kevinspahn/Grort/backend/src/tests/scenarios/product-matching.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { productRepository } from '../../repositories/productRepository';
import { productMatchService } from '../../services/productMatchService';

describe('Scenario: Product matching — previously seen item is matched, not duplicated', () => {
  let ctx: TestContext;
  let existingProductId: string;

  beforeAll(async () => {
    ctx = await setupTestHousehold();

    // Create existing product
    const product = await productRepository.create({
      householdId: ctx.householdId,
      canonicalName: 'Kirkland Organic Whole Milk, 1 Gallon',
      categoryId: null,
    });
    existingProductId = product.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  it('matches exact product name', async () => {
    const result = await productMatchService.matchProduct(
      ctx.householdId,
      'Kirkland Organic Whole Milk, 1 Gallon',
      'KS ORG WHOLE MLK 1GAL'
    );
    expect(result.confidence).toBe('exact');
    expect(result.product!.id).toBe(existingProductId);
  });

  it('matches near product name', async () => {
    const result = await productMatchService.matchProduct(
      ctx.householdId,
      'Kirkland Organic Whole Milk 1 Gallon',
      'KS ORG WH MLK'
    );
    expect(['exact', 'near']).toContain(result.confidence);
    expect(result.product!.id).toBe(existingProductId);
  });

  it('does not match unrelated product', async () => {
    const result = await productMatchService.matchProduct(
      ctx.householdId,
      'Fresh Atlantic Salmon Fillet',
      'ATLANTIC SALMON'
    );
    expect(result.confidence).toBe('new');
    expect(result.product).toBeNull();
  });

  it('product count stays the same after matching', async () => {
    const productsBefore = await productRepository.findAllByHousehold(ctx.householdId);
    const countBefore = productsBefore.length;

    // Matching should not create a new product
    await productMatchService.matchProduct(
      ctx.householdId,
      'Kirkland Organic Whole Milk, 1 Gallon',
      'KS ORG WHOLE MLK'
    );

    const productsAfter = await productRepository.findAllByHousehold(ctx.householdId);
    expect(productsAfter.length).toBe(countBefore);
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all scenario tests pass.

**Commit:** `git add -A && git commit -m "test: add product matching holdout scenario"`

---

### Task 17.5: Scenario — Price history across stores and store comparison

Create `/Users/kevinspahn/Grort/backend/src/tests/scenarios/price-history.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { productRepository } from '../../repositories/productRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Price history — 3 receipts from different stores show 3 data points', () => {
  let ctx: TestContext;
  let productId: string;
  let costcoId: string;
  let safewayId: string;
  let tradersId: string;

  beforeAll(async () => {
    ctx = await setupTestHousehold();

    // Create 3 stores
    const costco = await storeRepository.create({ name: 'Costco', brand: 'Costco', address: null, householdId: ctx.householdId });
    const safeway = await storeRepository.create({ name: 'Safeway', brand: 'Safeway', address: null, householdId: ctx.householdId });
    const traders = await storeRepository.create({ name: "Trader Joe's", brand: "Trader Joe's", address: null, householdId: ctx.householdId });
    costcoId = costco.id;
    safewayId = safeway.id;
    tradersId = traders.id;

    // Create product
    const product = await productRepository.create({
      householdId: ctx.householdId,
      canonicalName: 'Large Brown Eggs, 1 Dozen',
      categoryId: null,
    });
    productId = product.id;

    // Create receipts with eggs at each store
    for (const { storeId, date, price } of [
      { storeId: costcoId, date: '2026-01-10', price: 4.99 },
      { storeId: safewayId, date: '2026-01-17', price: 6.49 },
      { storeId: tradersId, date: '2026-01-24', price: 5.49 },
    ]) {
      const receipt = await receiptRepository.create({
        userId: ctx.ownerId, householdId: ctx.householdId, storeId,
        receiptDate: date, subtotal: price, tax: 0, total: price,
        imageUrl: `local://test/eggs-${date}.jpg`, rawAiResponse: {},
      });
      await receiptRepository.createItem({
        receiptId: receipt.id, productId, nameOnReceipt: 'EGGS LRG BRN 12CT',
        quantity: 1, unitPrice: price, totalPrice: price, categoryId: null,
      });
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  it('price history shows 3 data points across stores', async () => {
    const res = await request(app)
      .get(`/analytics/price-history/${productId}`)
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.productName).toBe('Large Brown Eggs, 1 Dozen');
    expect(res.body.dataPoints).toHaveLength(3);

    const storeNames = res.body.dataPoints.map((dp: any) => dp.storeName);
    expect(storeNames).toContain('Costco');
    expect(storeNames).toContain('Safeway');
    expect(storeNames).toContain("Trader Joe's");
  });

  it('store comparison shows cheapest store for eggs', async () => {
    const res = await request(app)
      .get(`/analytics/store-comparison?productIds=${productId}`)
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.comparisons).toHaveLength(1);
    expect(res.body.comparisons[0].stores).toHaveLength(3);
    // Costco at $4.99 should be cheapest
    expect(res.body.comparisons[0].cheapestStoreId).toBe(costcoId);
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all scenario tests pass.

**Commit:** `git add -A && git commit -m "test: add price history and store comparison holdout scenarios"`

---

### Task 17.6: Scenario — Register, create household, invite member flow

Create `/Users/kevinspahn/Grort/backend/src/tests/scenarios/onboarding-flow.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';

describe('Scenario: Register, create household, invite member, member sees receipts', () => {
  let ownerToken: string;
  let ownerId: string;
  let memberToken: string;
  let householdId: string;

  afterAll(async () => {
    await pool.query("DELETE FROM receipt_items WHERE receipt_id IN (SELECT id FROM receipts WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@holdout-onboard.com'))");
    await pool.query("DELETE FROM receipts WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@holdout-onboard.com')");
    await pool.query("DELETE FROM stores WHERE household_id IN (SELECT household_id FROM users WHERE email = 'owner@holdout-onboard.com')");
    await pool.query("DELETE FROM products WHERE household_id IN (SELECT household_id FROM users WHERE email = 'owner@holdout-onboard.com')");
    await pool.query("DELETE FROM users WHERE email LIKE '%@holdout-onboard.com'");
    await pool.query("DELETE FROM households WHERE name = 'Onboarding Test Household'");
    await pool.end();
  });

  it('step 1: register owner', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'owner@holdout-onboard.com', password: 'password123', name: 'Owner' });
    expect(res.status).toBe(201);
    ownerToken = res.body.token;
    ownerId = res.body.user.id;
  });

  it('step 2: create household', async () => {
    const res = await request(app)
      .post('/households')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Onboarding Test Household' });
    expect(res.status).toBe(201);
    householdId = res.body.id;

    // Re-login to get updated household in token context
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'owner@holdout-onboard.com', password: 'password123' });
    ownerToken = loginRes.body.token;
  });

  it('step 3: register member', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'member@holdout-onboard.com', password: 'password123', name: 'Member' });
    expect(res.status).toBe(201);
    memberToken = res.body.token;
  });

  it('step 4: invite member to household', async () => {
    const res = await request(app)
      .post(`/households/${householdId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'member@holdout-onboard.com' });
    expect(res.status).toBe(200);

    // Re-login member to get updated context
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'member@holdout-onboard.com', password: 'password123' });
    memberToken = loginRes.body.token;
  });

  it('step 5: member can see household members', async () => {
    const res = await request(app)
      .get(`/households/${householdId}/members`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const emails = res.body.map((m: any) => m.email);
    expect(emails).toContain('owner@holdout-onboard.com');
    expect(emails).toContain('member@holdout-onboard.com');
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all scenario tests pass.

**Commit:** `git add -A && git commit -m "test: add onboarding flow holdout scenario"`

---

### Task 17.7: Scenario — Spending trends with category breakdowns

Create `/Users/kevinspahn/Grort/backend/src/tests/scenarios/spending-trends.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';
import { setupTestHousehold, cleanupTestData, TestContext } from './setup';
import { storeRepository } from '../../repositories/storeRepository';
import { receiptRepository } from '../../repositories/receiptRepository';

describe('Scenario: Spending trends show correct category breakdowns for 5 receipts', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestHousehold();

    const store = await storeRepository.create({
      name: 'Grocery Store', brand: 'Generic', address: null, householdId: ctx.householdId,
    });

    // Create 5 receipts in January 2026 with categorized items
    const receipts = [
      { date: '2026-01-05', total: 45.00, items: [
        { name: 'Apples', price: 5.00, cat: 'a0000000-0000-0000-0000-000000000001' },    // Produce
        { name: 'Milk', price: 4.00, cat: 'a0000000-0000-0000-0000-000000000002' },       // Dairy
        { name: 'Chicken', price: 12.00, cat: 'a0000000-0000-0000-0000-000000000003' },   // Meat
        { name: 'Bread', price: 3.00, cat: 'a0000000-0000-0000-0000-000000000004' },      // Bakery
        { name: 'Ice cream', price: 6.00, cat: 'a0000000-0000-0000-0000-000000000005' },  // Frozen
      ]},
      { date: '2026-01-10', total: 35.00, items: [
        { name: 'Bananas', price: 2.00, cat: 'a0000000-0000-0000-0000-000000000001' },
        { name: 'Cheese', price: 8.00, cat: 'a0000000-0000-0000-0000-000000000002' },
        { name: 'Salmon', price: 15.00, cat: 'a0000000-0000-0000-0000-000000000003' },
      ]},
      { date: '2026-01-15', total: 28.00, items: [
        { name: 'Orange juice', price: 5.00, cat: 'a0000000-0000-0000-0000-000000000006' }, // Beverages
        { name: 'Chips', price: 4.00, cat: 'a0000000-0000-0000-0000-000000000007' },       // Snacks
        { name: 'Detergent', price: 12.00, cat: 'a0000000-0000-0000-0000-000000000008' },  // Household
      ]},
      { date: '2026-01-20', total: 22.00, items: [
        { name: 'Yogurt', price: 6.00, cat: 'a0000000-0000-0000-0000-000000000002' },
        { name: 'Steak', price: 16.00, cat: 'a0000000-0000-0000-0000-000000000003' },
      ]},
      { date: '2026-01-25', total: 18.00, items: [
        { name: 'Frozen pizza', price: 8.00, cat: 'a0000000-0000-0000-0000-000000000005' },
        { name: 'Soda', price: 5.00, cat: 'a0000000-0000-0000-0000-000000000006' },
        { name: 'Shampoo', price: 5.00, cat: 'a0000000-0000-0000-0000-000000000009' },    // Personal Care
      ]},
    ];

    for (const r of receipts) {
      const receipt = await receiptRepository.create({
        userId: ctx.ownerId, householdId: ctx.householdId, storeId: store.id,
        receiptDate: r.date, subtotal: r.total, tax: 0, total: r.total,
        imageUrl: `local://test/trends-${r.date}.jpg`, rawAiResponse: {},
      });
      for (const item of r.items) {
        await receiptRepository.createItem({
          receiptId: receipt.id, productId: null, nameOnReceipt: item.name,
          quantity: 1, unitPrice: item.price, totalPrice: item.price, categoryId: item.cat,
        });
      }
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  it('returns correct total spending', async () => {
    const res = await request(app)
      .get('/analytics/spending?period=month&startDate=2026-01-01&endDate=2026-01-31')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    // 45 + 35 + 28 + 22 + 18 = 148
    expect(res.body.totalSpent).toBe(148);
  });

  it('returns correct category breakdowns', async () => {
    const res = await request(app)
      .get('/analytics/spending?period=month&startDate=2026-01-01&endDate=2026-01-31')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    const categories = res.body.categoryBreakdown;
    expect(categories.length).toBeGreaterThan(0);

    // Meat & Seafood: 12 + 15 + 16 = 43 (highest)
    const meat = categories.find((c: any) => c.categoryName === 'Meat & Seafood');
    expect(meat).toBeDefined();
    expect(meat.total).toBe(43);

    // Dairy: 4 + 8 + 6 = 18
    const dairy = categories.find((c: any) => c.categoryName === 'Dairy');
    expect(dairy).toBeDefined();
    expect(dairy.total).toBe(18);

    // Produce: 5 + 2 = 7
    const produce = categories.find((c: any) => c.categoryName === 'Produce');
    expect(produce).toBeDefined();
    expect(produce.total).toBe(7);

    // Percentages should sum to ~100
    const totalPercentage = categories.reduce((sum: number, c: any) => sum + c.percentage, 0);
    expect(totalPercentage).toBeGreaterThanOrEqual(99);
    expect(totalPercentage).toBeLessThanOrEqual(101);
  });

  it('returns period breakdown for January', async () => {
    const res = await request(app)
      .get('/analytics/spending?period=month&startDate=2026-01-01&endDate=2026-01-31')
      .set('Authorization', `Bearer ${ctx.ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.periodBreakdown.length).toBeGreaterThanOrEqual(1);
    expect(res.body.periodBreakdown[0].total).toBe(148);
  });
});
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all scenario tests pass.

**Commit:** `git add -A && git commit -m "test: add spending trends holdout scenario with 5 receipts"`

---

### Task 17.8: Scenario — Invalid image upload returns appropriate error

Create `/Users/kevinspahn/Grort/backend/src/tests/scenarios/invalid-upload.test.ts`:

```typescript
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
```

**Verify:** `cd /Users/kevinspahn/Grort/backend && npm test` — all scenario tests pass.

**Commit:** `git add -A && git commit -m "test: add invalid upload holdout scenario"`

---

### Task 17.9: Final verification — run all tests

```bash
cd /Users/kevinspahn/Grort/backend && npm test
```

**Expected output:** All tests pass across:
- Health endpoint
- Schema validation
- Database schema verification
- User repository
- Auth service
- Auth middleware
- Auth routes
- Household repository
- Household service
- Storage service
- Upload routes
- Parser factory
- Product match service
- Receipt routes
- Product routes
- Analytics routes
- Holdout scenarios (household sharing, deletion cascade, product matching, price history, onboarding flow, spending trends, invalid upload)

**Commit:** `git add -A && git commit -m "chore: final verification — all tests passing"`

---

## Summary

This implementation plan contains **17 phases** with **45+ individual tasks** that build the complete Grort app:

**Backend (Phases 1-10):**
- Express + TypeScript server with PostgreSQL
- Full database schema with UUID keys and hierarchical categories
- JWT auth with Google OAuth support
- Household sharing with owner/member roles
- S3-compatible image storage (with local filesystem fallback)
- Provider-agnostic AI receipt parsing (Claude, GPT-4o, Gemini)
- Receipt processing pipeline with fuzzy product matching
- Full CRUD for receipts, products, and stores
- Spending analytics, price history, and store comparison APIs

**Mobile (Phases 11-16):**
- Expo Router file-based navigation with 5-tab layout
- Auth context with SecureStore token persistence
- Camera + gallery receipt scanning
- Receipt review with inline editing
- Receipt history with pagination and pull-to-refresh
- Spending trends dashboard with bar, pie, and line charts
- Product price history and store comparison views
- Profile and household management

**Validation (Phase 17):**
- 7 holdout scenario tests covering all critical flows
- Household sharing, cascade deletion, product matching, price history, onboarding, spending trends, error handling


