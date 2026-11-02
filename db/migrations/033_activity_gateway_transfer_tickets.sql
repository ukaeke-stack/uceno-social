-- Short-lived, single-use authorization for moving a connected player to
-- the gateway that owns a cross-instance activity lobby.
CREATE TABLE IF NOT EXISTS virtual_world_activity_transfer_tickets (
  id UUID PRIMARY KEY,
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_session_id UUID NOT NULL REFERENCES virtual_world_activity_sessions(id) ON DELETE CASCADE,
  source_instance_id UUID NOT NULL REFERENCES virtual_world_instances(id) ON DELETE CASCADE,
  target_instance_id UUID NOT NULL REFERENCES virtual_world_instances(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_instance_id <> target_instance_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_activity_transfer_tickets_expiry_idx
  ON virtual_world_activity_transfer_tickets (expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS virtual_world_activity_transfer_tickets_user_idx
  ON virtual_world_activity_transfer_tickets (world_id, user_id, created_at DESC);
