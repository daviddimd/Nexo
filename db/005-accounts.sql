ALTER TABLE companies ADD COLUMN logo_url text;
ALTER TABLE companies ADD COLUMN primary_color text NOT NULL DEFAULT '#2563eb' CHECK(primary_color ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE companies ADD COLUMN contact_email text;
ALTER TABLE companies ADD COLUMN contact_phone text;
ALTER TABLE companies ADD COLUMN about text NOT NULL DEFAULT '';
CREATE TABLE administrative_events (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), actor_id uuid NOT NULL,
  action text NOT NULL, entity_id uuid NOT NULL, details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(company_id,actor_id) REFERENCES users(company_id,id)
);
CREATE INDEX administrative_history ON administrative_events(company_id,created_at DESC,id);
CREATE TRIGGER administrative_events_immutable BEFORE UPDATE OR DELETE ON administrative_events
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE FUNCTION guard_account_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM companies WHERE id=OLD.company_id FOR UPDATE;
  IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.company_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Account identity is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.role='OWNER' AND OLD.active AND (TG_OP='DELETE' OR NEW.role<>'OWNER' OR NOT NEW.active) AND
    NOT EXISTS(SELECT 1 FROM users WHERE company_id=OLD.company_id AND id<>OLD.id AND role='OWNER' AND active) THEN
    RAISE EXCEPTION 'Company requires an active owner' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF (NEW.role='CUSTOMER')<>(OLD.role='CUSTOMER') THEN
    RAISE EXCEPTION 'Customer and staff accounts are separate' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.email,NEW.role,NEW.active,NEW.password_hash) IS DISTINCT FROM ROW(OLD.email,OLD.role,OLD.active,OLD.password_hash) THEN
    DELETE FROM sessions WHERE company_id=OLD.company_id AND user_id=OLD.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER account_security BEFORE UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION guard_account_update();
CREATE FUNCTION guard_assignment_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE company uuid; account uuid;
BEGIN
  IF TG_OP='DELETE' THEN company=OLD.company_id; account=OLD.user_id; ELSE company=NEW.company_id; account=NEW.user_id; END IF;
  PERFORM id FROM companies WHERE id=company FOR UPDATE;
  IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM users u JOIN locations l ON l.company_id=u.company_id
    WHERE u.company_id=company AND u.id=account AND u.role='AGENT' AND l.id=NEW.location_id AND l.active) THEN
    RAISE EXCEPTION 'Only agents can be assigned active locations' USING ERRCODE='23514';
  END IF;
  DELETE FROM sessions WHERE company_id=company AND user_id=account;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER assignment_security BEFORE INSERT OR DELETE ON agent_locations FOR EACH ROW EXECUTE FUNCTION guard_assignment_change();
-- Assignment keys cannot be edited to move a grant between accounts/companies.
CREATE TRIGGER assignment_keys_immutable BEFORE UPDATE ON agent_locations FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
