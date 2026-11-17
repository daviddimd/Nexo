ALTER TABLE demo_requests
  ADD COLUMN contact_name text CHECK (length(contact_name) BETWEEN 1 AND 120),
  ADD COLUMN consent_at timestamptz;
