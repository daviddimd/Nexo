ALTER TABLE products
  ADD COLUMN minimum_stock integer NOT NULL DEFAULT 5
  CHECK (minimum_stock BETWEEN 0 AND 1000000);
