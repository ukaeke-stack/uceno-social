-- Persistent moderator grants and revocations. Apply after migration 013.
CREATE TABLE IF NOT EXISTS moderator_access (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 granted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 revoked_at TIMESTAMPTZ,
 revoked_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS moderator_access_active_idx ON moderator_access (granted_at DESC) WHERE revoked_at IS NULL;
