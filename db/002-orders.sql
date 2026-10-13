ALTER TABLE companies ADD COLUMN reservation_minutes integer NOT NULL DEFAULT 15
  CHECK (reservation_minutes BETWEEN 1 AND 60);

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  customer_id uuid,
  created_by uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('ONLINE', 'LOCAL')),
  fulfillment text NOT NULL CHECK (fulfillment IN ('PICKUP', 'SHIP', 'LOCAL')),
  location_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED', 'PAID', 'CANCELLED', 'EXPIRED', 'FULFILLED')),
  currency text NOT NULL DEFAULT 'CLP' CHECK (currency = 'CLP'),
  total_minor bigint NOT NULL CHECK (total_minor BETWEEN 0 AND 1000000000000000),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  payment_method text CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER')),
  payment_reference text,
  paid_by uuid,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  cancellation_reason text,
  sale_operation_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, idempotency_key),
  FOREIGN KEY (company_id, customer_id) REFERENCES users(company_id, id),
  FOREIGN KEY (company_id, created_by) REFERENCES users(company_id, id),
  FOREIGN KEY (company_id, paid_by) REFERENCES users(company_id, id),
  FOREIGN KEY (company_id, location_id) REFERENCES locations(company_id, id),
  FOREIGN KEY (company_id, sale_operation_id) REFERENCES inventory_operations(company_id, id),
  CHECK ((channel = 'ONLINE' AND fulfillment IN ('PICKUP', 'SHIP') AND customer_id IS NOT NULL)
      OR (channel = 'LOCAL' AND fulfillment = 'LOCAL' AND customer_id IS NULL)),
  CHECK ((status IN ('PAID', 'FULFILLED') AND paid_at IS NOT NULL AND paid_by IS NOT NULL
      AND payment_method IS NOT NULL AND payment_reference IS NOT NULL AND sale_operation_id IS NOT NULL)
      OR (status NOT IN ('PAID', 'FULFILLED') AND paid_at IS NULL AND paid_by IS NULL
      AND payment_method IS NULL AND payment_reference IS NULL AND sale_operation_id IS NULL)),
  CHECK ((status = 'FULFILLED') = (fulfilled_at IS NOT NULL))
);
CREATE UNIQUE INDEX orders_payment_reference ON orders(company_id, payment_reference)
  WHERE payment_reference IS NOT NULL;
CREATE INDEX orders_expiration ON orders(company_id, expires_at) WHERE status = 'RESERVED';
CREATE INDEX orders_customer ON orders(company_id, customer_id, created_at DESC);
CREATE INDEX orders_location ON orders(company_id, location_id, created_at DESC);

CREATE TABLE order_items (
  company_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor BETWEEN 0 AND 1000000000000),
  line_total_minor bigint NOT NULL CHECK (line_total_minor = unit_price_minor * quantity),
  PRIMARY KEY (company_id, order_id, product_id),
  FOREIGN KEY (company_id, order_id) REFERENCES orders(company_id, id),
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id)
);
CREATE TABLE order_events (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  order_id uuid NOT NULL,
  actor_id uuid,
  type text NOT NULL CHECK (type IN ('RESERVED', 'PAYMENT_RECORDED', 'CANCELLED', 'EXPIRED', 'FULFILLED')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (company_id, order_id) REFERENCES orders(company_id, id),
  FOREIGN KEY (company_id, actor_id) REFERENCES users(company_id, id)
);
CREATE INDEX order_events_history ON order_events(company_id, order_id, created_at);
CREATE TRIGGER order_items_immutable BEFORE UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER order_events_immutable BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE FUNCTION guard_order_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.company_id, NEW.customer_id, NEW.created_by, NEW.channel,
      NEW.fulfillment, NEW.location_id, NEW.currency, NEW.total_minor, NEW.idempotency_key,
      NEW.request_hash, NEW.expires_at, NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.company_id, OLD.customer_id, OLD.created_by, OLD.channel,
      OLD.fulfillment, OLD.location_id, OLD.currency, OLD.total_minor, OLD.idempotency_key,
      OLD.request_hash, OLD.expires_at, OLD.created_at) THEN
    RAISE EXCEPTION 'Order commercial snapshot is immutable';
  END IF;
  IF NOT ((OLD.status = 'RESERVED' AND NEW.status IN ('PAID', 'CANCELLED', 'EXPIRED'))
       OR (OLD.status = 'PAID' AND NEW.status = 'FULFILLED')) THEN
    RAISE EXCEPTION 'Invalid order transition';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER order_transitions BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_update();
