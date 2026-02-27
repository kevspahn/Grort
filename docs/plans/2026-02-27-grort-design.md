# Grort Design

## Overview

Grort is an AI-powered grocery receipt tracker. Snap a photo of a grocery receipt, AI extracts items and prices, and the app tracks spending trends, per-item price history, and cross-store price comparisons.

## Decisions

- **Platform:** React Native (Expo) mobile app — iOS and Android
- **Backend:** Node.js + Express, REST API, JWT auth
- **Database:** PostgreSQL with UUIDs for all primary keys
- **AI:** Provider-agnostic receipt parsing (Claude, GPT-4o, Gemini adapters)
- **Image storage:** S3-compatible object storage for receipt photos
- **Auth:** JWT in httpOnly cookies, Google OAuth + email/password
- **Multi-tenancy:** Household-based sharing — all members see all receipts
- **Build approach:** Spec-driven (dark factory style) — detailed spec + holdout scenario tests, no code review

## Architecture

Three-tier mobile app:

- **Mobile client** — React Native (Expo). Camera integration for receipt scanning, spending dashboards with charts, price history views, store comparison.
- **API server** — Express on Node.js. Handles receipt parsing orchestration, spending analytics queries, user management, household sharing.
- **Database** — PostgreSQL. Receipts, items, stores, products, price history, users, households.
- **AI layer** — Provider-agnostic service with adapter pattern. Accepts receipt image, returns structured JSON (store, items, prices, categories).
- **Image storage** — S3-compatible (AWS S3 or DigitalOcean Spaces) for receipt photos.

**Data flow:** Phone camera → image upload to S3 → AI vision extracts items → structured data saved to PostgreSQL → analytics queries serve spending/price/store dashboards.

## Data Model

All tables use UUID primary keys (`gen_random_uuid()`).

### users
- `id` UUID PK
- `email` VARCHAR UNIQUE NOT NULL
- `password_hash` VARCHAR (nullable for OAuth-only users)
- `name` VARCHAR NOT NULL
- `google_id` VARCHAR UNIQUE (nullable)
- `household_id` UUID FK → households (nullable)
- `household_role` VARCHAR ('owner' | 'member', nullable)
- `created_at` TIMESTAMPTZ DEFAULT now()

### households
- `id` UUID PK
- `name` VARCHAR NOT NULL
- `created_at` TIMESTAMPTZ DEFAULT now()

### stores
- `id` UUID PK
- `name` VARCHAR NOT NULL (display name, e.g. "Costco")
- `brand` VARCHAR (normalized chain name)
- `address` VARCHAR (nullable)
- `household_id` UUID FK → households
- `created_at` TIMESTAMPTZ DEFAULT now()
- UNIQUE(brand, address, household_id)

### categories
- `id` UUID PK
- `name` VARCHAR NOT NULL
- `parent_id` UUID FK → categories (nullable, for hierarchy)

Seeded with standard grocery categories: Produce, Dairy, Meat & Seafood, Bakery, Frozen, Beverages, Snacks, Household, Personal Care, Other.

### products
- `id` UUID PK
- `household_id` UUID FK → households
- `canonical_name` VARCHAR NOT NULL (normalized: "Organic Large Eggs")
- `category_id` UUID FK → categories
- `created_at` TIMESTAMPTZ DEFAULT now()
- UNIQUE(household_id, canonical_name)

### receipts
- `id` UUID PK
- `user_id` UUID FK → users NOT NULL (who scanned it)
- `household_id` UUID FK → households (nullable — personal if no household)
- `store_id` UUID FK → stores
- `receipt_date` DATE NOT NULL
- `subtotal` DECIMAL(10,2)
- `tax` DECIMAL(10,2)
- `total` DECIMAL(10,2) NOT NULL
- `image_url` VARCHAR NOT NULL
- `raw_ai_response` JSONB (full AI extraction for debugging)
- `created_at` TIMESTAMPTZ DEFAULT now()

### receipt_items
- `id` UUID PK
- `receipt_id` UUID FK → receipts NOT NULL (CASCADE DELETE)
- `product_id` UUID FK → products (nullable until matched)
- `name_on_receipt` VARCHAR NOT NULL (raw text from receipt)
- `quantity` DECIMAL(10,3) DEFAULT 1
- `unit_price` DECIMAL(10,2)
- `total_price` DECIMAL(10,2) NOT NULL
- `category_id` UUID FK → categories
- `created_at` TIMESTAMPTZ DEFAULT now()

## API Design

### Auth
- `POST /auth/register` — email, password, name → JWT
- `POST /auth/login` — email, password → JWT
- `POST /auth/google` — Google OAuth token → JWT

### Receipts
- `POST /receipts/scan` — multipart image upload → triggers AI parsing → returns receipt with extracted items
- `GET /receipts` — list receipts (paginated, filterable by date range, store)
- `GET /receipts/:id` — receipt detail with all items
- `DELETE /receipts/:id` — delete receipt and cascade items

### Analytics
- `GET /analytics/spending` — query params: period (week/month), start_date, end_date → spending totals, category breakdowns
- `GET /analytics/price-history/:productId` — price of a product over time, across stores
- `GET /analytics/store-comparison` — query params: productIds[] → average price per product per store

### Products
- `GET /products` — list tracked products (with latest price, purchase frequency)
- `PUT /products/:id` — edit canonical name, category
- `POST /products/merge` — merge two product IDs into one

### Households
- `POST /households` — create household, caller becomes owner
- `POST /households/:id/invite` — invite member by email
- `DELETE /households/:id/members/:userId` — remove member (owner only)
- `GET /households/:id/members` — list members

### Stores
- `GET /stores` — list stores seen in receipts
- `PUT /stores/:id` — edit store name/brand
- `POST /stores/merge` — merge two stores into one

## Mobile Screens

### 1. Scan (Home)
Camera viewfinder with capture button. Snap receipt → loading spinner while AI processes → review screen showing extracted items. User can edit any misread items before saving. This is the default screen — optimized for the primary use case.

### 2. Receipts
Chronological list of past receipts. Each row: store name, date, total, item count. Tap for full item breakdown. Filter by store or date range.

### 3. Trends
Spending dashboard:
- Monthly/weekly totals as bar chart
- Category breakdown as donut chart
- Spending over time as line chart
- Toggle personal vs household view

### 4. Prices
Search or browse products. Tap a product for:
- Price history line chart (x = date, y = price, color-coded by store)
- Cheapest store highlighted
- Average price per store

### 5. Profile
Account settings, household management (invite/remove members), AI provider preference, sign out.

### Supporting Flows
- **Onboarding** — register → create or join household (skippable)
- **Receipt review** — after scan, confirm/edit items before saving
- **Product merge** — when near-duplicates detected, prompt user to merge

## AI Receipt Parsing

### Flow
1. User snaps photo → image uploaded to S3
2. Backend sends image URL to AI vision provider with structured prompt
3. Prompt requests JSON: store name, store address, date, items (name, quantity, unit_price, total_price, suggested_category, suggested_canonical_name), subtotal, tax, total
4. Backend validates JSON structure, checks item totals approximately sum to receipt total
5. Each item fuzzy-matched against existing products in household (Levenshtein distance + AI-suggested canonical name)
6. New products created automatically, near-matches flagged for user review on the receipt review screen

### Provider Adapter Pattern
```
ReceiptParser interface:
  parse(imageUrl: string) → ReceiptExtractionResult

Implementations:
  ClaudeReceiptParser   — Anthropic Messages API with vision
  OpenAIReceiptParser   — GPT-4o vision
  GeminiReceiptParser   — Gemini vision
```

Config determines active provider. All adapters share the same prompt template (kept in a separate file) and return the same ReceiptExtractionResult structure.

### Product Matching
When AI extracts "KS ORG WHOLE MLK 1GAL" from a Costco receipt:
1. AI also suggests canonical_name: "Kirkland Organic Whole Milk, 1 Gallon"
2. Fuzzy match against existing products in household
3. If match score > threshold → link to existing product
4. If close match → flag for user confirmation on review screen
5. If no match → create new product with AI-suggested name

## Auth & Multi-tenancy

- Every user belongs to zero or one household
- Receipts scoped to household (all members see all receipts) or to user (if no household)
- JWT in httpOnly cookies
- Google OAuth as primary auth, email/password as fallback
- Roles: owner (can invite/remove members) and member
- All queries filter by household_id or user_id — resolved from JWT by middleware

## Testing Strategy (Dark Factory Style)

Two separate artifacts:

**1. The spec** — this document plus a detailed implementation spec. Detailed enough for a coding agent to build the entire app from scratch.

**2. Holdout scenarios** — end-to-end behavioral tests written separately, never seen by the agent during development:
- Upload a Costco receipt with 8 items → all 8 items extracted with correct prices → total matches
- Upload 3 receipts from different stores with eggs → price history shows 3 data points across stores
- Two household members each scan a receipt → both receipts appear in shared history
- Scan a receipt with an item seen before → product is matched, not duplicated
- Delete a receipt → items removed, analytics updated
- Spending trends show correct category breakdowns for a month with 5 receipts
- Store comparison shows cheapest store for a product seen at 3 stores
- Invalid image upload → appropriate error, no crash
- Register, create household, invite member → member can see owner's receipts

The agent builds from the spec. Scenarios validate the build. No manual code review.
