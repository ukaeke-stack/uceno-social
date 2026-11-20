-- Account-backed avatar appearance, shared across worlds and devices.
CREATE TABLE IF NOT EXISTS user_avatar_appearances (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_avatar_appearance_size CHECK (pg_column_size(appearance) <= 4096)
);
