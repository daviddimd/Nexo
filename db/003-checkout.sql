CREATE TABLE shipping_quotes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  customer_id uuid NOT NULL,
  location_id uuid NOT NULL,
  address jsonb NOT NULL CHECK (jsonb_typeof(address)='object'),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','REJECTED','USED','EXPIRED')),
  shipping_minor bigint CHECK (shipping_minor BETWEEN 0 AND 1000000000000),
  goods_minor bigint CHECK (goods_minor BETWEEN 0 AND 1000000000000000),
  priced_items jsonb,
  approved_by uuid,
  approved_at timestamptz,
  expires_at timestamptz,
  note text,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,id), UNIQUE(company_id,idempotency_key),
  FOREIGN KEY(company_id,customer_id) REFERENCES users(company_id,id),
  FOREIGN KEY(company_id,location_id) REFERENCES locations(company_id,id),
  FOREIGN KEY(company_id,approved_by) REFERENCES users(company_id,id),
  CHECK ((status IN ('APPROVED','USED','EXPIRED') AND shipping_minor IS NOT NULL AND goods_minor IS NOT NULL
    AND priced_items IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND expires_at IS NOT NULL)
    OR (status IN ('REQUESTED','REJECTED') AND shipping_minor IS NULL AND goods_minor IS NULL
    AND priced_items IS NULL AND approved_by IS NULL AND approved_at IS NULL AND expires_at IS NULL))
);
CREATE INDEX shipping_quotes_customer ON shipping_quotes(company_id,customer_id,created_at DESC);
CREATE INDEX shipping_quotes_expiry ON shipping_quotes(company_id,expires_at) WHERE status='APPROVED';
CREATE TABLE shipping_quote_items (
  company_id uuid NOT NULL, quote_id uuid NOT NULL, product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
  PRIMARY KEY(company_id,quote_id,product_id),
  FOREIGN KEY(company_id,quote_id) REFERENCES shipping_quotes(company_id,id),
  FOREIGN KEY(company_id,product_id) REFERENCES products(company_id,id)
);
CREATE TRIGGER quote_items_immutable BEFORE UPDATE OR DELETE ON shipping_quote_items
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE FUNCTION guard_quote_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.customer_id,NEW.location_id,NEW.address,NEW.idempotency_key,NEW.request_hash,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.customer_id,OLD.location_id,OLD.address,OLD.idempotency_key,OLD.request_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'Shipping request is immutable';
  END IF;
  IF NOT ((OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED'))
    OR (OLD.status='APPROVED' AND NEW.status IN ('USED','EXPIRED'))) THEN RAISE EXCEPTION 'Invalid quote transition'; END IF;
  IF OLD.status='APPROVED' AND ROW(NEW.shipping_minor,NEW.goods_minor,NEW.priced_items,NEW.approved_by,NEW.approved_at,NEW.expires_at,NEW.note)
    IS DISTINCT FROM ROW(OLD.shipping_minor,OLD.goods_minor,OLD.priced_items,OLD.approved_by,OLD.approved_at,OLD.expires_at,OLD.note) THEN
    RAISE EXCEPTION 'Approved quote is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER shipping_quote_transitions BEFORE UPDATE ON shipping_quotes FOR EACH ROW EXECUTE FUNCTION guard_quote_update();

-- Upgrade existing orders without rewriting either earlier migration.
DROP TRIGGER order_transitions ON orders;
ALTER TABLE orders ADD COLUMN shipping_quote_id uuid;
ALTER TABLE orders ADD COLUMN shipping_address jsonb;
ALTER TABLE orders ADD COLUMN goods_minor bigint;
ALTER TABLE orders ADD COLUMN shipping_minor bigint NOT NULL DEFAULT 0 CHECK(shipping_minor BETWEEN 0 AND 1000000000000);
ALTER TABLE orders ADD COLUMN payment_source text CHECK(payment_source IN ('MANUAL','SIMULATOR'));
UPDATE orders SET goods_minor=total_minor,
  payment_source=CASE WHEN status IN ('PAID','FULFILLED') THEN 'MANUAL' ELSE NULL END;
ALTER TABLE orders ALTER COLUMN goods_minor SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT order_total_parts CHECK(goods_minor>=0 AND total_minor=goods_minor+shipping_minor);
ALTER TABLE orders ADD CONSTRAINT order_quote_fk FOREIGN KEY(company_id,shipping_quote_id) REFERENCES shipping_quotes(company_id,id);
CREATE UNIQUE INDEX order_quote_used_once ON orders(company_id,shipping_quote_id) WHERE shipping_quote_id IS NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK(payment_method IN ('CASH','CARD','TRANSFER','GATEWAY'));
ALTER TABLE orders DROP CONSTRAINT orders_check1;
ALTER TABLE orders ADD CONSTRAINT orders_payment_integrity CHECK (
  (status IN ('PAID','FULFILLED') AND paid_at IS NOT NULL AND payment_reference IS NOT NULL AND sale_operation_id IS NOT NULL
    AND payment_source IS NOT NULL AND payment_method IS NOT NULL
    AND ((payment_source='MANUAL' AND paid_by IS NOT NULL AND payment_method IN ('CASH','CARD','TRANSFER'))
      OR (payment_source='SIMULATOR' AND paid_by IS NULL AND payment_method='GATEWAY')))
  OR (status NOT IN ('PAID','FULFILLED') AND paid_at IS NULL AND paid_by IS NULL AND payment_source IS NULL
    AND payment_method IS NULL AND payment_reference IS NULL AND sale_operation_id IS NULL)
);
ALTER TABLE inventory_operations ALTER COLUMN actor_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION guard_order_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.customer_id,NEW.created_by,NEW.channel,NEW.fulfillment,NEW.location_id,
      NEW.currency,NEW.total_minor,NEW.idempotency_key,NEW.request_hash,NEW.expires_at,NEW.created_at,
      NEW.shipping_quote_id,NEW.shipping_address,NEW.goods_minor,NEW.shipping_minor)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.customer_id,OLD.created_by,OLD.channel,OLD.fulfillment,OLD.location_id,
      OLD.currency,OLD.total_minor,OLD.idempotency_key,OLD.request_hash,OLD.expires_at,OLD.created_at,
      OLD.shipping_quote_id,OLD.shipping_address,OLD.goods_minor,OLD.shipping_minor) THEN
    RAISE EXCEPTION 'Order commercial snapshot is immutable';
  END IF;
  IF NOT ((OLD.status='RESERVED' AND NEW.status IN ('PAID','CANCELLED','EXPIRED'))
    OR (OLD.status='PAID' AND NEW.status='FULFILLED')) THEN RAISE EXCEPTION 'Invalid order transition'; END IF;
  IF OLD.status='PAID' AND ROW(NEW.payment_method,NEW.payment_reference,NEW.payment_source,NEW.paid_by,NEW.paid_at,NEW.sale_operation_id)
    IS DISTINCT FROM ROW(OLD.payment_method,OLD.payment_reference,OLD.payment_source,OLD.paid_by,OLD.paid_at,OLD.sale_operation_id) THEN
    RAISE EXCEPTION 'Recorded payment is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER order_transitions BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION guard_order_update();

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, order_id uuid NOT NULL, customer_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'SIMULATOR' CHECK(provider='SIMULATOR'),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','FAILED','SUCCEEDED','REVIEW')),
  amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000000000),
  currency text NOT NULL CHECK(currency='CLP'),
  idempotency_key text NOT NULL, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,id), UNIQUE(company_id,order_id), UNIQUE(company_id,idempotency_key),
  FOREIGN KEY(company_id,order_id) REFERENCES orders(company_id,id),
  FOREIGN KEY(company_id,customer_id) REFERENCES users(company_id,id)
);
CREATE TABLE payment_captures (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, intent_id uuid NOT NULL,
  transaction_id text NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>=0), currency text NOT NULL,
  disposition text NOT NULL CHECK(disposition IN ('APPLIED','REVIEW')), reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,id), UNIQUE(company_id,transaction_id),
  FOREIGN KEY(company_id,intent_id) REFERENCES payment_intents(company_id,id)
);
CREATE UNIQUE INDEX one_applied_capture ON payment_captures(company_id,intent_id) WHERE disposition='APPLIED';
CREATE TABLE payment_events (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, intent_id uuid NOT NULL, event_id text NOT NULL,
  payload_hash text NOT NULL, status text NOT NULL CHECK(status IN ('SUCCEEDED','FAILED')),
  transaction_id text NOT NULL, result text NOT NULL CHECK(result IN ('APPLIED','REVIEW','IGNORED')),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,event_id), FOREIGN KEY(company_id,intent_id) REFERENCES payment_intents(company_id,id)
);
CREATE TRIGGER captures_immutable BEFORE UPDATE OR DELETE ON payment_captures FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER payment_events_immutable BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE FUNCTION guard_intent_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.order_id,NEW.customer_id,NEW.provider,NEW.amount_minor,NEW.currency,NEW.idempotency_key,NEW.request_hash,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.order_id,OLD.customer_id,OLD.provider,OLD.amount_minor,OLD.currency,OLD.idempotency_key,OLD.request_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'Payment intent is immutable';
  END IF;
  IF NOT ((OLD.status='PENDING' AND NEW.status IN ('FAILED','SUCCEEDED','REVIEW'))
    OR (OLD.status='FAILED' AND NEW.status IN ('SUCCEEDED','REVIEW'))
    OR (OLD.status='REVIEW' AND NEW.status='SUCCEEDED')) THEN RAISE EXCEPTION 'Invalid intent transition'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER intent_transitions BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION guard_intent_update();
