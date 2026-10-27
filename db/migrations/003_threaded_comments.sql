-- UCENO threaded comments and per-comment likes.
-- Apply this migration to the Neon database before deploying the matching app changes.
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comments_parent_created_idx
  ON comments (parent_comment_id, created_at ASC)
  WHERE parent_comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS comment_likes_user_created_idx
  ON comment_likes (user_id, created_at DESC);
