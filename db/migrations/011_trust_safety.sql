-- Additive trust and safety foundation. Apply through the normal migration process.
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id, blocker_id);

CREATE TABLE IF NOT EXISTS user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(12) NOT NULL CHECK (target_type IN ('user','post','comment')),
  target_id UUID NOT NULL,
  reason VARCHAR(40) NOT NULL CHECK (reason IN ('spam','harassment','hate','violence','nudity','scam','impersonation','other')),
  details VARCHAR(1000) NOT NULL DEFAULT '',
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','actioned','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS user_reports_queue_idx ON user_reports (status, created_at ASC);
CREATE INDEX IF NOT EXISTS user_reports_target_idx ON user_reports (target_type, target_id, created_at DESC);
