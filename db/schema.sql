CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name VARCHAR(70) NOT NULL,
  handle VARCHAR(24) NOT NULL UNIQUE,
  email VARCHAR(254) UNIQUE,
  phone VARCHAR(16) UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_contact_exactly_one CHECK ((email IS NOT NULL) <> (phone IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);
