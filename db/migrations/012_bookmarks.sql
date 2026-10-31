-- Persistent post bookmarks. Additive migration; does not alter existing post behavior.
CREATE TABLE IF NOT EXISTS post_bookmarks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS post_bookmarks_user_created_idx ON post_bookmarks (user_id, created_at DESC);
