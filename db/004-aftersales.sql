-- Receipts of money and goods are independent, append-only records.
CREATE TABLE refunds (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, order_id uuid NOT NULL, capture_id uuid,
  actor_id uuid NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0), currency text NOT NULL,
  source text NOT NULL CHECK(source IN ('SIMULATOR','MANUAL')),
  reference text NOT NULL, reason text NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,id), UNIQUE(company_id,idempotency_key), UNIQUE(company_id,reference),
  FOREIGN KEY(company_id,order_id) REFERENCES orders(company_id,id),
  FOREIGN KEY(company_id,capture_id) REFERENCES payment_captures(company_id,id),
  FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id),
  CHECK((source='SIMULATOR' AND capture_id IS NOT NULL) OR (source='MANUAL' AND capture_id IS NULL))
);
CREATE INDEX refunds_order ON refunds(company_id,order_id);
CREATE INDEX refunds_capture ON refunds(company_id,capture_id);
CREATE TABLE capture_resolutions (
  company_id uuid NOT NULL, capture_id uuid NOT NULL, actor_id uuid NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('REFUNDED','NO_FUNDS')), reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(company_id,capture_id),
  FOREIGN KEY(company_id,capture_id) REFERENCES payment_captures(company_id,id),
  FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id)
);
CREATE TABLE return_receipts (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, order_id uuid NOT NULL, location_id uuid NOT NULL,
  actor_id uuid NOT NULL, operation_id uuid, reason text NOT NULL,
  kind text NOT NULL DEFAULT 'RETURN' CHECK(kind IN ('RETURN','WITHDRAWAL')),
  idempotency_key text NOT NULL, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,id), UNIQUE(company_id,idempotency_key), UNIQUE(company_id,operation_id),
  FOREIGN KEY(company_id,order_id) REFERENCES orders(company_id,id),
  FOREIGN KEY(company_id,location_id) REFERENCES locations(company_id,id),
  FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id),
  FOREIGN KEY(company_id,operation_id) REFERENCES inventory_operations(company_id,id)
);
CREATE INDEX returns_order ON return_receipts(company_id,order_id);
CREATE TABLE return_items (
  company_id uuid NOT NULL, receipt_id uuid NOT NULL, product_id uuid NOT NULL,
  restock_quantity integer NOT NULL CHECK(restock_quantity BETWEEN 0 AND 1000000),
  damaged_quantity integer NOT NULL CHECK(damaged_quantity BETWEEN 0 AND 1000000),
  CHECK(restock_quantity+damaged_quantity BETWEEN 1 AND 1000000),
  PRIMARY KEY(company_id,receipt_id,product_id),
  FOREIGN KEY(company_id,receipt_id) REFERENCES return_receipts(company_id,id),
  FOREIGN KEY(company_id,product_id) REFERENCES products(company_id,id)
);
ALTER TABLE inventory_operations DROP CONSTRAINT inventory_operations_kind_check;
ALTER TABLE inventory_operations ADD CONSTRAINT inventory_operations_kind_check
  CHECK(kind IN ('RECEIPT','ADJUSTMENT','SALE','TRANSFER','RETURN'));
ALTER TABLE order_events DROP CONSTRAINT order_events_type_check;
ALTER TABLE order_events ADD CONSTRAINT order_events_type_check
  CHECK(type IN ('RESERVED','PAYMENT_RECORDED','CANCELLED','EXPIRED','FULFILLED','REFUND_RECORDED','RETURN_RECEIVED','CAPTURE_RESOLVED'));
CREATE TRIGGER refunds_immutable BEFORE UPDATE OR DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER resolutions_immutable BEFORE UPDATE OR DELETE ON capture_resolutions FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER returns_immutable BEFORE UPDATE OR DELETE ON return_receipts FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER return_items_immutable BEFORE UPDATE OR DELETE ON return_items FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE FUNCTION guard_refund_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE maximum bigint; previous numeric; expected_currency text; target_order uuid;
BEGIN
  PERFORM id FROM companies WHERE id=NEW.company_id FOR UPDATE;
  IF NEW.capture_id IS NOT NULL THEN
    SELECT c.amount_minor,c.currency,i.order_id INTO maximum,expected_currency,target_order
      FROM payment_captures c JOIN payment_intents i ON i.company_id=c.company_id AND i.id=c.intent_id
      WHERE c.company_id=NEW.company_id AND c.id=NEW.capture_id;
    SELECT COALESCE(sum(amount_minor),0) INTO previous FROM refunds WHERE company_id=NEW.company_id AND capture_id=NEW.capture_id;
  ELSE
    SELECT total_minor,currency,id INTO maximum,expected_currency,target_order FROM orders
      WHERE company_id=NEW.company_id AND id=NEW.order_id AND payment_source='MANUAL' AND status IN ('PAID','FULFILLED');
    SELECT COALESCE(sum(amount_minor),0) INTO previous FROM refunds WHERE company_id=NEW.company_id AND order_id=NEW.order_id AND capture_id IS NULL;
  END IF;
  IF maximum IS NULL OR target_order IS DISTINCT FROM NEW.order_id OR expected_currency IS DISTINCT FROM NEW.currency
    OR previous+NEW.amount_minor>maximum THEN RAISE EXCEPTION 'Invalid refund balance or payment'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER refund_balance BEFORE INSERT ON refunds FOR EACH ROW EXECUTE FUNCTION guard_refund_insert();
CREATE FUNCTION guard_resolution_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capture payment_captures%ROWTYPE; total numeric;
BEGIN
  PERFORM id FROM companies WHERE id=NEW.company_id FOR UPDATE;
  SELECT * INTO capture FROM payment_captures WHERE company_id=NEW.company_id AND id=NEW.capture_id;
  SELECT COALESCE(sum(amount_minor),0) INTO total FROM refunds WHERE company_id=NEW.company_id AND capture_id=NEW.capture_id;
  IF capture.id IS NULL OR capture.disposition<>'REVIEW' OR
    NOT ((NEW.outcome='NO_FUNDS' AND capture.amount_minor=0) OR
      (NEW.outcome='REFUNDED' AND capture.amount_minor>0 AND total=capture.amount_minor)) THEN
    RAISE EXCEPTION 'Resolution requires recorded financial outcome';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER resolution_proof BEFORE INSERT ON capture_resolutions FOR EACH ROW EXECUTE FUNCTION guard_resolution_insert();
CREATE FUNCTION guard_return_item_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_order uuid; sold integer; previous numeric;
BEGIN
  PERFORM id FROM companies WHERE id=NEW.company_id FOR UPDATE;
  SELECT r.order_id INTO target_order FROM return_receipts r JOIN orders o ON o.company_id=r.company_id AND o.id=r.order_id
    WHERE r.company_id=NEW.company_id AND r.id=NEW.receipt_id AND
      ((r.kind='RETURN' AND o.status='FULFILLED') OR (r.kind='WITHDRAWAL' AND o.status='PAID'));
  SELECT quantity INTO sold FROM order_items WHERE company_id=NEW.company_id AND order_id=target_order AND product_id=NEW.product_id;
  SELECT COALESCE(sum(i.restock_quantity::bigint+i.damaged_quantity),0) INTO previous FROM return_items i
    JOIN return_receipts r ON r.company_id=i.company_id AND r.id=i.receipt_id
    WHERE r.company_id=NEW.company_id AND r.order_id=target_order AND i.product_id=NEW.product_id;
  IF sold IS NULL OR previous+NEW.restock_quantity+NEW.damaged_quantity>sold THEN RAISE EXCEPTION 'Return exceeds sold quantity'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER return_quantity BEFORE INSERT ON return_items FOR EACH ROW EXECUTE FUNCTION guard_return_item_insert();
