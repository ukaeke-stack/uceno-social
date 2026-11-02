-- Fencing tokens make each reconnect a newer authoritative player session.
-- Player checkpoints are ordered by session generation and per-session state version.
CREATE TABLE IF NOT EXISTS virtual_world_player_sessions (
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES virtual_world_instances(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  generation BIGINT NOT NULL CHECK (generation > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, user_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_player_sessions_instance_idx
  ON virtual_world_player_sessions (instance_id, updated_at DESC);

ALTER TABLE virtual_world_player_state
  ADD COLUMN IF NOT EXISTS session_generation BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_by_session UUID;

CREATE INDEX IF NOT EXISTS virtual_world_player_state_session_order_idx
  ON virtual_world_player_state (world_id, user_id, session_generation DESC, state_version DESC);
