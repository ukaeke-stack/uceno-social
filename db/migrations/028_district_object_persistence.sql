-- Durable, world-scoped object state. District and object identifiers are authored by the gateway config.
-- Seats are intentionally excluded: occupancy is ephemeral and is released on disconnect.
CREATE TABLE IF NOT EXISTS virtual_world_object_states (
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  district_id TEXT NOT NULL CHECK (district_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  object_id TEXT NOT NULL CHECK (object_id ~ '^[a-zA-Z0-9._:-]{1,80}$'),
  object_kind TEXT NOT NULL CHECK (object_kind IN ('door', 'furniture', 'vehicle', 'object')),
  object_state TEXT NOT NULL CHECK (object_state IN ('open', 'closed', 'active', 'idle', 'engine_on', 'engine_off')),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, district_id, object_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_object_states_updated_idx
  ON virtual_world_object_states (world_id, district_id, updated_at DESC);
