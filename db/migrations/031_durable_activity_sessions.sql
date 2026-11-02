CREATE TABLE IF NOT EXISTS virtual_world_activity_sessions (
  id UUID PRIMARY KEY,
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES virtual_world_instances(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL,
  host_generation BIGINT NOT NULL DEFAULT 1 CHECK (host_generation > 0),
  race_id TEXT,
  activity_kind TEXT NOT NULL CHECK (activity_kind IN ('checkpoint_race', 'dance', 'sports', 'adventure')),
  phase TEXT NOT NULL CHECK (phase IN ('lobby', 'active', 'completed', 'cancelled')),
  version BIGINT NOT NULL CHECK (version > 0),
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS virtual_world_activity_sessions_discovery_idx
  ON virtual_world_activity_sessions (world_id, phase, created_at DESC);
CREATE INDEX IF NOT EXISTS virtual_world_activity_sessions_instance_idx
  ON virtual_world_activity_sessions (instance_id, phase);
CREATE TABLE IF NOT EXISTS virtual_world_activity_results (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES virtual_world_activity_sessions(id) ON DELETE CASCADE,
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  placement INTEGER,
  status TEXT NOT NULL CHECK (status IN ('finished', 'dnf', 'left')),
  checkpoint_index INTEGER NOT NULL CHECK (checkpoint_index >= 0),
  finish_time BIGINT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_activity_results_world_user_idx
  ON virtual_world_activity_results (world_id, user_id, recorded_at DESC);
