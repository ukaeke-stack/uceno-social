-- Short-lived multiplayer presence. Durable checkpoints remain in virtual_world_player_state.
-- Presence rows are ephemeral and are removed by clients on leave; stale rows are filtered by last_seen.
CREATE TABLE IF NOT EXISTS virtual_world_presence (
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position JSONB NOT NULL,
  rotation JSONB NOT NULL DEFAULT '{"x":0,"y":0,"z":0,"w":1}'::jsonb,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, user_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_presence_fresh_idx
  ON virtual_world_presence(world_id, last_seen DESC);
