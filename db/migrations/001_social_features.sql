-- Apply this migration to the UCENO Neon database before deploying these routes.
CREATE TABLE IF NOT EXISTS post_reposts (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_reposts_user_created_idx ON post_reposts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_reposts_post_created_idx ON post_reposts (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  CONSTRAINT stories_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS stories_active_created_idx ON stories (expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_user_created_idx ON stories (user_id, created_at DESC);
