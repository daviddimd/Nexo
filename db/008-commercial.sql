CREATE TABLE commercial_revisions (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), revision integer NOT NULL CHECK(revision>0),
  mode text NOT NULL CHECK(mode IN ('SUBSCRIPTION','PERPETUAL')),
  status text NOT NULL CHECK(status IN ('ENABLED','CANCELLED')),
  effective_at timestamptz NOT NULL, starts_at timestamptz NOT NULL, access_until timestamptz,
  updates_until timestamptz NOT NULL, support_until timestamptz NOT NULL,
  operator_label text NOT NULL, reference text NOT NULL, reason text NOT NULL,
  idempotency_key text NOT NULL, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,revision), UNIQUE(company_id,idempotency_key),
  CHECK((mode='SUBSCRIPTION' AND access_until IS NOT NULL AND access_until>starts_at)
    OR (mode='PERPETUAL' AND access_until IS NULL)),
  CHECK(updates_until>=starts_at AND support_until>=starts_at)
);
CREATE INDEX commercial_effective ON commercial_revisions(company_id,effective_at,revision DESC);
CREATE TRIGGER commercial_immutable BEFORE UPDATE OR DELETE ON commercial_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE FUNCTION guard_commercial_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous integer;
BEGIN
  PERFORM id FROM companies WHERE id=NEW.company_id FOR UPDATE;
  SELECT COALESCE(max(revision),0) INTO previous FROM commercial_revisions WHERE company_id=NEW.company_id;
  IF NEW.revision<>previous+1 THEN RAISE EXCEPTION 'Commercial revision conflict' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER commercial_sequence BEFORE INSERT ON commercial_revisions FOR EACH ROW EXECUTE FUNCTION guard_commercial_revision();
