-- Composite indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_receipts_household_date ON receipts(household_id, receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipts_user_date ON receipts(user_id, receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipt_items_product_id_receipt_id ON receipt_items(product_id, receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_category_total ON receipt_items(category_id, total_price);
