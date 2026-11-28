CREATE TABLE IF NOT EXISTS virtual_world_realtime_events (
  id BIGSERIAL PRIMARY KEY,
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES virtual_world_instances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('player_snapshot')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS virtual_world_realtime_events_world_cursor_idx ON virtual_world_realtime_events (world_id, id);
CREATE INDEX IF NOT EXISTS virtual_world_realtime_events_created_idx ON virtual_world_realtime_events (created_at);
