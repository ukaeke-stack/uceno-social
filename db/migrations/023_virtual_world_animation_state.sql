-- Additive animation replication metadata for ephemeral world presence.
-- This does not make client transforms authoritative; it records validated client state.
ALTER TABLE virtual_world_presence
  ADD COLUMN IF NOT EXISTS animation_state JSONB NOT NULL
    DEFAULT '{"locomotion":"idle","seated":false,"gesture":"none","gestureSequence":0}'::jsonb,
  ADD COLUMN IF NOT EXISTS client_sequence BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS virtual_world_presence_sequence_idx
  ON virtual_world_presence(world_id, user_id, client_sequence);
