CREATE TABLE installation_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  installation_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER installation_immutable BEFORE UPDATE OR DELETE ON installation_identity
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TABLE license_imports (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id),
  installation_id uuid NOT NULL REFERENCES installation_identity(installation_id),
  revision integer NOT NULL CHECK(revision>0), license_id uuid NOT NULL UNIQUE,
  commercial_id uuid NOT NULL REFERENCES commercial_revisions(id),
  effective_at timestamptz NOT NULL, envelope jsonb NOT NULL, document_hash text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,revision)
);
CREATE INDEX license_imports_company ON license_imports(company_id,revision DESC);
CREATE TRIGGER license_imports_immutable BEFORE UPDATE OR DELETE ON license_imports
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE FUNCTION guard_license_import() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous integer;
BEGIN
  PERFORM id FROM companies WHERE id=NEW.company_id FOR UPDATE;
  SELECT COALESCE(max(revision),0) INTO previous FROM license_imports WHERE company_id=NEW.company_id;
  IF NEW.revision<=previous THEN RAISE EXCEPTION 'License revision rollback' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM commercial_revisions WHERE id=NEW.commercial_id AND company_id=NEW.company_id AND revision=NEW.revision)
    THEN RAISE EXCEPTION 'Commercial binding mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER license_import_guard BEFORE INSERT ON license_imports FOR EACH ROW EXECUTE FUNCTION guard_license_import();
