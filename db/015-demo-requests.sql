CREATE TABLE demo_requests (
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  plan text NOT NULL CHECK (plan IN ('esencial','profesional','empresa','permanente','a-medida')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, plan)
);
