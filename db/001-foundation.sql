CREATE TABLE companies (
  id uuid PRIMARY KEY, slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id),
  email text NOT NULL CHECK (email = lower(email)), name text NOT NULL, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER','AGENT','CUSTOMER')), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,email), UNIQUE(company_id,id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, company_id uuid NOT NULL, user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id) ON DELETE CASCADE
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (
  company_slug text NOT NULL, email text NOT NULL, attempts integer NOT NULL,
  window_started_at timestamptz NOT NULL, PRIMARY KEY(company_slug,email)
);
CREATE TABLE locations (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('WEB','STORE')), shipping_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true, UNIQUE(company_id,id), UNIQUE(company_id,name)
);
CREATE UNIQUE INDEX one_web_location ON locations(company_id) WHERE kind='WEB';
CREATE TABLE agent_locations (
  company_id uuid NOT NULL, user_id uuid NOT NULL, location_id uuid NOT NULL,
  PRIMARY KEY(company_id,user_id,location_id),
  FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id),
  FOREIGN KEY(company_id,location_id) REFERENCES locations(company_id,id)
);
CREATE TABLE products (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), sku text NOT NULL,
  name text NOT NULL, description text NOT NULL DEFAULT '', price_minor bigint NOT NULL CHECK(price_minor >= 0 AND price_minor <= 1000000000000),
  currency text NOT NULL DEFAULT 'CLP' CHECK(currency='CLP'), image_url text,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id), UNIQUE(company_id,sku)
);
CREATE TABLE stock (
  company_id uuid NOT NULL, product_id uuid NOT NULL, location_id uuid NOT NULL,
  on_hand integer NOT NULL DEFAULT 0 CHECK(on_hand >= 0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= on_hand),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,product_id,location_id),
  FOREIGN KEY(company_id,product_id) REFERENCES products(company_id,id),
  FOREIGN KEY(company_id,location_id) REFERENCES locations(company_id,id)
);
CREATE TABLE inventory_operations (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), actor_id uuid NOT NULL,
  idempotency_key text NOT NULL, request_hash text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('RECEIPT','ADJUSTMENT','SALE','TRANSFER')),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,id), UNIQUE(company_id,idempotency_key),
  FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id)
);
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, operation_id uuid NOT NULL,
  product_id uuid NOT NULL, location_id uuid NOT NULL, delta integer NOT NULL CHECK(delta <> 0),
  on_hand_after integer NOT NULL CHECK(on_hand_after >= 0), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,operation_id) REFERENCES inventory_operations(company_id,id),
  FOREIGN KEY(company_id,product_id,location_id) REFERENCES stock(company_id,product_id,location_id)
);
CREATE INDEX stock_movements_history ON stock_movements(company_id,created_at DESC);
-- Application never edits/deletes ledger entries; enforce append-only in PostgreSQL too.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory ledger is append-only'; END; $$;
CREATE TRIGGER operations_immutable BEFORE UPDATE OR DELETE ON inventory_operations FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
