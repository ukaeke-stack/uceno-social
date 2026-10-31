-- Audited moderator enforcement. Apply after migrations 011 and 012.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(12) NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active','suspended','disabled')),
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_note VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS moderation_removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_removed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS moderation_removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_removed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES user_reports(id) ON DELETE SET NULL,
  moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_type VARCHAR(12) NOT NULL CHECK (target_type IN ('user','post','comment')),
  target_id UUID NOT NULL,
  action VARCHAR(24) NOT NULL CHECK (action IN ('warn','suspend','disable','remove_content','restore_account','restore_content')),
  reason VARCHAR(1000) NOT NULL DEFAULT '',
  duration_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_actions_target_idx
  ON moderation_actions (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_actions_report_idx
  ON moderation_actions (report_id, created_at DESC);
