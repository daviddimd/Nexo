-- Existing managed accounts remain exempt; never invent a verified timestamp.
ALTER TABLE users ADD COLUMN email_verification_required boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
-- Public requests are not authenticated administrative actions.
ALTER TABLE administrative_events ALTER COLUMN actor_id DROP NOT NULL;
CREATE TABLE account_tokens (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, user_id uuid NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('VERIFY_EMAIL','RESET_PASSWORD')),
  token_hash text NOT NULL UNIQUE, email text NOT NULL, credential_hash text NOT NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz, invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id),
  UNIQUE(company_id,id), CHECK(expires_at>created_at),
  CHECK(consumed_at IS NULL OR invalidated_at IS NULL)
);
CREATE INDEX account_token_user ON account_tokens(company_id,user_id,purpose);
CREATE TABLE local_mail (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, token_id uuid NOT NULL,
  recipient text NOT NULL, purpose text NOT NULL, encrypted_payload text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(company_id,token_id) REFERENCES account_tokens(company_id,id)
);
CREATE TRIGGER local_mail_immutable BEFORE UPDATE OR DELETE ON local_mail FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TABLE account_rate_limits (
  bucket text PRIMARY KEY, attempts integer NOT NULL CHECK(attempts>0), window_started_at timestamptz NOT NULL
);
CREATE FUNCTION invalidate_account_tokens() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.email,NEW.password_hash,NEW.active,NEW.role) IS DISTINCT FROM ROW(OLD.email,OLD.password_hash,OLD.active,OLD.role) THEN
    UPDATE account_tokens SET invalidated_at=clock_timestamp() WHERE company_id=OLD.company_id AND user_id=OLD.id
      AND consumed_at IS NULL AND invalidated_at IS NULL;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN NEW.email_verified_at=NULL; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER account_token_invalidation BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION invalidate_account_tokens();
CREATE FUNCTION guard_account_token_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.user_id,NEW.purpose,NEW.token_hash,NEW.email,NEW.credential_hash,NEW.expires_at,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.user_id,OLD.purpose,OLD.token_hash,OLD.email,OLD.credential_hash,OLD.expires_at,OLD.created_at)
    OR OLD.consumed_at IS NOT NULL OR OLD.invalidated_at IS NOT NULL
    OR NOT ((NEW.consumed_at IS NOT NULL AND NEW.invalidated_at IS NULL) OR (NEW.consumed_at IS NULL AND NEW.invalidated_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid account token transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER account_token_transitions BEFORE UPDATE ON account_tokens FOR EACH ROW EXECUTE FUNCTION guard_account_token_update();
