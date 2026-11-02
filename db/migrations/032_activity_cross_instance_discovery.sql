ALTER TABLE virtual_world_realtime_events
  DROP CONSTRAINT IF EXISTS virtual_world_realtime_events_event_type_check;
ALTER TABLE virtual_world_realtime_events
  ADD CONSTRAINT virtual_world_realtime_events_event_type_check
  CHECK (event_type IN ('player_snapshot', 'activity_state'));
CREATE INDEX IF NOT EXISTS virtual_world_activity_sessions_live_discovery_idx
  ON virtual_world_activity_sessions (world_id, updated_at DESC)
  WHERE phase IN ('lobby', 'active');
