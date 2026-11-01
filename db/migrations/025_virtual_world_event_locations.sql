-- Spatial event destinations and activity categories.
-- Apply after migration 024 through the reviewed UCENO database migration process.
-- This adds metadata only; event admission and movement remain server-authoritative.

ALTER TABLE virtual_world_events
  ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'social',
  ADD COLUMN IF NOT EXISTS location_label VARCHAR(120) NOT NULL DEFAULT 'Main Plaza',
  ADD COLUMN IF NOT EXISTS location JSONB NOT NULL
    DEFAULT '{"x":0,"y":1.15,"z":0,"yaw":0}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'virtual_world_events_activity_type_check'
      AND conrelid = 'virtual_world_events'::regclass
  ) THEN
    ALTER TABLE virtual_world_events
      ADD CONSTRAINT virtual_world_events_activity_type_check
      CHECK (activity_type IN (
        'social','dance','sports','racing','adventure','concert',
        'education','cinema','workshop','community'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'virtual_world_events_location_object_check'
      AND conrelid = 'virtual_world_events'::regclass
  ) THEN
    ALTER TABLE virtual_world_events
      ADD CONSTRAINT virtual_world_events_location_object_check
      CHECK (jsonb_typeof(location) = 'object');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS virtual_world_events_activity_schedule_idx
  ON virtual_world_events(world_id, activity_type, starts_at)
  WHERE status = 'scheduled';
