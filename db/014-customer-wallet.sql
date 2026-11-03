CREATE TABLE customer_addresses (
 id uuid PRIMARY KEY, company_id uuid NOT NULL, user_id uuid NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 60),
 address jsonb NOT NULL CHECK(jsonb_typeof(address)='object'),
 is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,user_id,id),
 FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id)
);
CREATE UNIQUE INDEX customer_one_default_address ON customer_addresses(company_id,user_id) WHERE is_default;
-- Preserve every existing saved address as the first address in its owner's book.
INSERT INTO customer_addresses(id,company_id,user_id,label,address,is_default)
 SELECT gen_random_uuid(),company_id,user_id,'Principal',default_address,true FROM customer_profiles WHERE default_address IS NOT NULL;
ALTER TABLE test_payment_cards ADD COLUMN holder text CHECK(holder IS NULL OR length(holder) BETWEEN 2 AND 100);
ALTER TABLE test_payment_cards ADD COLUMN expiry_month integer CHECK(expiry_month BETWEEN 1 AND 12);
ALTER TABLE test_payment_cards ADD COLUMN expiry_year integer CHECK(expiry_year BETWEEN 2000 AND 2199);
ALTER TABLE test_payment_cards ADD CONSTRAINT card_detail_completeness CHECK(
 (holder IS NULL AND expiry_month IS NULL AND expiry_year IS NULL) OR
 (holder IS NOT NULL AND expiry_month IS NOT NULL AND expiry_year IS NOT NULL)
);
