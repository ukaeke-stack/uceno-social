-- Activity state shares the durable realtime relay stream with player snapshots.
-- Migration 030 originally constrained the stream to player_snapshot only.
ALTER TABLE virtual_world_realtime_events
  DROP CONSTRAINT IF EXISTS virtual_world_realtime_events_event_type_check;

ALTER TABLE virtual_world_realtime_events
  ADD CONSTRAINT virtual_world_realtime_events_event_type_check
  CHECK (event_type IN ('player_snapshot', 'activity_state'));
