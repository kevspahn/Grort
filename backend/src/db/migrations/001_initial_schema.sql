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
