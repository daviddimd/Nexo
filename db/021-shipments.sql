-- Despacho de envíos: una ficha por pedido con envío a domicilio.
-- El pedido sigue su ciclo (PAID -> FULFILLED); la ficha agrega las etapas físicas:
-- PREPARING (se arma el paquete) -> DISPATCHED (entregado al transportista) -> DELIVERED (confirmado).
-- Un pedido sin ficha y en PAID está "por preparar". Los pedidos FULFILLED anteriores a esta migración
-- no tienen ficha y se muestran como despachados sin datos del transportista.
CREATE TABLE shipments (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  order_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PREPARING' CHECK (status IN ('PREPARING', 'DISPATCHED', 'DELIVERED')),
  carrier text CHECK (carrier IS NULL OR length(carrier) BETWEEN 2 AND 80),
  tracking_code text CHECK (tracking_code IS NULL OR length(tracking_code) BETWEEN 3 AND 80),
  estimated_delivery date,
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  dispatched_by uuid,
  dispatched_at timestamptz,
  delivered_by uuid,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, order_id),
  FOREIGN KEY (company_id, order_id) REFERENCES orders(company_id, id),
  FOREIGN KEY (company_id, prepared_by) REFERENCES users(company_id, id),
  FOREIGN KEY (company_id, dispatched_by) REFERENCES users(company_id, id),
  FOREIGN KEY (company_id, delivered_by) REFERENCES users(company_id, id),
  CHECK (
    (status = 'PREPARING' AND carrier IS NULL AND tracking_code IS NULL AND estimated_delivery IS NULL
      AND dispatched_at IS NULL AND dispatched_by IS NULL AND delivered_at IS NULL AND delivered_by IS NULL)
    OR (status = 'DISPATCHED' AND carrier IS NOT NULL AND dispatched_at IS NOT NULL AND dispatched_by IS NOT NULL
      AND delivered_at IS NULL AND delivered_by IS NULL)
    OR (status = 'DELIVERED' AND carrier IS NOT NULL AND dispatched_at IS NOT NULL AND dispatched_by IS NOT NULL
      AND delivered_at IS NOT NULL AND delivered_by IS NOT NULL)
  )
);
CREATE INDEX shipments_status ON shipments(company_id, status, updated_at DESC);

ALTER TABLE order_events DROP CONSTRAINT order_events_type_check;
ALTER TABLE order_events ADD CONSTRAINT order_events_type_check
  CHECK (type IN ('RESERVED','PAYMENT_RECORDED','CANCELLED','EXPIRED','FULFILLED','REFUND_RECORDED','RETURN_RECEIVED','CAPTURE_RESOLVED',
    'SHIPMENT_PREPARING','SHIPMENT_UPDATED','SHIPMENT_DELIVERED'));

CREATE FUNCTION guard_shipment_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent orders%ROWTYPE;
BEGIN
  SELECT * INTO parent FROM orders WHERE company_id = NEW.company_id AND id = NEW.order_id;
  IF NOT FOUND OR parent.fulfillment <> 'SHIP' OR parent.status NOT IN ('PAID', 'FULFILLED') THEN
    RAISE EXCEPTION 'Shipments require a paid order with home delivery';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shipments_insert_guard BEFORE INSERT ON shipments FOR EACH ROW EXECUTE FUNCTION guard_shipment_insert();

CREATE FUNCTION guard_shipment_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.company_id, NEW.order_id, NEW.prepared_by, NEW.prepared_at, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.company_id, OLD.order_id, OLD.prepared_by, OLD.prepared_at, OLD.created_at) THEN
    RAISE EXCEPTION 'Shipment identity is immutable';
  END IF;
  IF OLD.status = 'DELIVERED' THEN RAISE EXCEPTION 'A delivered shipment cannot change'; END IF;
  IF NEW.status <> OLD.status AND NOT ((OLD.status = 'PREPARING' AND NEW.status = 'DISPATCHED')
    OR (OLD.status = 'DISPATCHED' AND NEW.status = 'DELIVERED')) THEN
    RAISE EXCEPTION 'Invalid shipment transition';
  END IF;
  IF OLD.status = 'DISPATCHED' AND NEW.status = 'DELIVERED'
    AND ROW(NEW.dispatched_by, NEW.dispatched_at) IS DISTINCT FROM ROW(OLD.dispatched_by, OLD.dispatched_at) THEN
    RAISE EXCEPTION 'Dispatch data is immutable once delivered';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shipments_transitions BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION guard_shipment_update();
CREATE TRIGGER shipments_no_delete BEFORE DELETE ON shipments FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
