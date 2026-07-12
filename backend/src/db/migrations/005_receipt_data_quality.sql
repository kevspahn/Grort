-- Receipt data-quality fields.
-- Lets the extraction represent discounts, weighted items, and provenance
-- (captured vs. estimated), and flags receipts whose items don't reconcile.

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS discount_total DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS total_estimated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_estimated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE receipt_items
  ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20),
  ADD COLUMN IF NOT EXISTS weight DECIMAL(10,3),
  ADD COLUMN IF NOT EXISTS is_discount BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
