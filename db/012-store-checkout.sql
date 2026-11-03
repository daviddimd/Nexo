CREATE TABLE shipping_rates (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id),
 city text NOT NULL CHECK(length(city) BETWEEN 2 AND 100), region text NOT NULL CHECK(length(region) BETWEEN 2 AND 100),
 city_key text NOT NULL, region_key text NOT NULL,
 fee_minor bigint NOT NULL CHECK(fee_minor BETWEEN 0 AND 1000000000000), active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,id), UNIQUE(company_id,region_key,city_key)
);
CREATE TABLE customer_profiles (
 company_id uuid NOT NULL, user_id uuid NOT NULL, phone text NOT NULL DEFAULT '',
 default_address jsonb CHECK(default_address IS NULL OR jsonb_typeof(default_address)='object'),
 payment_preference text CHECK(payment_preference IN ('CARD','TRANSFER')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(company_id,user_id), FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id)
);
-- A separate trigger protects automatic-shipping metadata without changing historical migrations.
ALTER TABLE orders ADD COLUMN shipping_rate_id uuid;
ALTER TABLE orders ADD CONSTRAINT order_shipping_rate_fk FOREIGN KEY(company_id,shipping_rate_id) REFERENCES shipping_rates(company_id,id);
ALTER TABLE orders ADD CONSTRAINT order_rate_mode CHECK(shipping_rate_id IS NULL OR (fulfillment='SHIP' AND shipping_quote_id IS NULL AND shipping_address IS NOT NULL));
CREATE FUNCTION guard_order_rate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.shipping_rate_id IS DISTINCT FROM OLD.shipping_rate_id THEN RAISE EXCEPTION 'Order shipping snapshot is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER order_rate_immutable BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION guard_order_rate();
