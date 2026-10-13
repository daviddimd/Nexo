CREATE TABLE staff_invitations (
  id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), invited_by uuid NOT NULL,
  email text NOT NULL CHECK(email=lower(email)), role text NOT NULL CHECK(role IN ('AGENT','OWNER')),
  location_ids uuid[] NOT NULL, token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  expires_at timestamptz NOT NULL, accepted_user_id uuid, closed_at timestamptz,
  idempotency_key text NOT NULL, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(company_id,id), UNIQUE(company_id,idempotency_key),
  FOREIGN KEY(company_id,invited_by) REFERENCES users(company_id,id),
  FOREIGN KEY(company_id,accepted_user_id) REFERENCES users(company_id,id),
  CHECK(expires_at>created_at), CHECK(role='AGENT' OR cardinality(location_ids)=0),
  CHECK((status='PENDING' AND closed_at IS NULL AND accepted_user_id IS NULL) OR
    (status='ACCEPTED' AND closed_at IS NOT NULL AND accepted_user_id IS NOT NULL) OR
    (status IN ('REVOKED','EXPIRED') AND closed_at IS NOT NULL AND accepted_user_id IS NULL))
);
CREATE UNIQUE INDEX one_pending_staff_invitation ON staff_invitations(company_id,email) WHERE status='PENDING';
CREATE FUNCTION guard_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['status','closed_at','accepted_user_id']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','closed_at','accepted_user_id']) OR OLD.status<>'PENDING' OR NEW.status='PENDING' THEN
      RAISE EXCEPTION 'Invitation snapshot is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.status='EXPIRED' AND NEW.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Invitation has not expired' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='INSERT' OR NEW.status='ACCEPTED' THEN
    PERFORM id FROM companies WHERE id=NEW.company_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM users WHERE company_id=NEW.company_id AND id=NEW.invited_by AND active AND role='OWNER'
      AND (NOT email_verification_required OR email_verified_at IS NOT NULL))
      OR (SELECT count(*) FROM locations WHERE company_id=NEW.company_id AND id=ANY(NEW.location_ids) AND active)<>cardinality(NEW.location_ids) THEN
      RAISE EXCEPTION 'Invalid invitation authorization or locations' USING ERRCODE='23514';
    END IF;
    IF NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Invitation expired' USING ERRCODE='23514'; END IF;
    IF NEW.status='ACCEPTED' AND NOT EXISTS(SELECT 1 FROM users WHERE company_id=NEW.company_id AND id=NEW.accepted_user_id
      AND email=NEW.email AND role=NEW.role AND active) THEN RAISE EXCEPTION 'Invitation account mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER invitation_transitions BEFORE INSERT OR UPDATE ON staff_invitations FOR EACH ROW EXECUTE FUNCTION guard_invitation();
CREATE TRIGGER invitations_no_delete BEFORE DELETE ON staff_invitations FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE FUNCTION revoke_staff_invitations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.active AND OLD.role='OWNER' AND (NOT NEW.active OR NEW.role<>'OWNER') THEN
    UPDATE staff_invitations SET status='REVOKED',closed_at=clock_timestamp()
      WHERE company_id=OLD.company_id AND invited_by=OLD.id AND status='PENDING';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER inviter_authority BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION revoke_staff_invitations();
ALTER TABLE local_mail ALTER COLUMN token_id DROP NOT NULL;
ALTER TABLE local_mail ADD COLUMN invitation_id uuid;
ALTER TABLE local_mail ADD CONSTRAINT mail_invitation_fk FOREIGN KEY(company_id,invitation_id) REFERENCES staff_invitations(company_id,id);
ALTER TABLE local_mail ADD CONSTRAINT mail_one_source CHECK((token_id IS NULL)<>(invitation_id IS NULL));
CREATE VIEW available_local_mail AS
 SELECT m.* FROM local_mail m LEFT JOIN account_tokens t ON t.company_id=m.company_id AND t.id=m.token_id
 LEFT JOIN staff_invitations i ON i.company_id=m.company_id AND i.id=m.invitation_id
 WHERE (t.consumed_at IS NULL AND t.invalidated_at IS NULL AND t.expires_at>clock_timestamp())
 OR (i.status='PENDING' AND i.expires_at>clock_timestamp());
