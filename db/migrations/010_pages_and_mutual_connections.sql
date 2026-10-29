-- Distinguish personal profiles from Pages and support mutual-only calling.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'person';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('person','page'));

CREATE TABLE IF NOT EXISTS mutual_connections (
  id TEXT PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS mutual_connections_recipient_status_idx ON mutual_connections (recipient_id, status);
CREATE INDEX IF NOT EXISTS mutual_connections_requester_status_idx ON mutual_connections (requester_id, status);
