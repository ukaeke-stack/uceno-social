-- Durable, user-owned return destination for the UCENO World Entry Gateway.
-- Position values are written only from trusted server checkpoints; the client may
-- request a save but cannot submit an arbitrary transform.
CREATE TABLE IF NOT EXISTS virtual_world_last_locations (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  city_id TEXT NOT NULL CHECK (city_id IN (
    'meridian','solstice','verdant','nexus','aurora',
    'saffron','monsoon','eclipse','origin','atlas'
  )),
  district_id TEXT,
  location_kind TEXT NOT NULL DEFAULT 'world'
    CHECK (location_kind IN ('world','home','event','social')),
  target_id UUID,
  position JSONB NOT NULL DEFAULT '{"x":0,"y":1.15,"z":0}'::jsonb,
  rotation JSONB NOT NULL DEFAULT '{"x":0,"y":0,"z":0,"w":1}'::jsonb,
  activity_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS virtual_world_last_locations_world_idx
  ON virtual_world_last_locations(world_id, city_id);
