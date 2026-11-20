-- Phase 2: scalable treasure distribution without publishing shared coordinates.
-- Spawn points are imported only from qualified Unity city/interactable exports.
-- This migration does not seed fabricated locations, rewards, or live events.

ALTER TABLE virtual_world_treasure_hunts
  ADD COLUMN IF NOT EXISTS distribution_mode TEXT NOT NULL DEFAULT 'personal'
    CHECK (distribution_mode IN ('personal', 'team', 'global')),
  ADD COLUMN IF NOT EXISTS max_global_winners INTEGER
    CHECK (max_global_winners IS NULL OR max_global_winners BETWEEN 1 AND 1000000),
  ADD COLUMN IF NOT EXISTS max_reward_claims INTEGER
    CHECK (max_reward_claims IS NULL OR max_reward_claims BETWEEN 1 AND 1000000);

-- A hunt can have many qualified spawn candidates for each clue step.
-- Unlike the legacy clue chain, candidates at a sequence are not globally unique:
-- the assignment layer chooses a private route for each player.
CREATE TABLE IF NOT EXISTS virtual_world_treasure_spawn_points (
  id UUID PRIMARY KEY,
  hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 99),
  city_id TEXT NOT NULL CHECK (city_id ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  district_id TEXT NOT NULL CHECK (length(district_id) BETWEEN 1 AND 80),
  interactable_id TEXT NOT NULL CHECK (length(interactable_id) BETWEEN 1 AND 128),
  position_x DOUBLE PRECISION NOT NULL CHECK (position_x BETWEEN -10000 AND 10000),
  position_y DOUBLE PRECISION NOT NULL CHECK (position_y BETWEEN -10000 AND 10000),
  position_z DOUBLE PRECISION NOT NULL CHECK (position_z BETWEEN -10000 AND 10000),
  interaction_radius DOUBLE PRECISION NOT NULL CHECK (interaction_radius BETWEEN 0.5 AND 8),
  clue_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(clue_payload) = 'object'),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hunt_id, sequence, interactable_id),
  UNIQUE (hunt_id, id)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_spawn_candidates_idx
  ON virtual_world_treasure_spawn_points (hunt_id, sequence, city_id, district_id)
  WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS virtual_world_treasure_spawn_location_idx
  ON virtual_world_treasure_spawn_points (city_id, district_id, interactable_id, hunt_id)
  WHERE enabled = TRUE;

-- One route assignment per user/hunt/step. The selected spawn point is never
-- returned in another user's payload. Unique constraints make route creation
-- and concurrent discovery safe under retries.
CREATE TABLE IF NOT EXISTS virtual_world_treasure_assignments (
  hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 99),
  spawn_point_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hunt_id, user_id, sequence),
  UNIQUE (hunt_id, user_id, spawn_point_id),
  FOREIGN KEY (hunt_id, spawn_point_id)
    REFERENCES virtual_world_treasure_spawn_points(hunt_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_assignments_user_idx
  ON virtual_world_treasure_assignments (user_id, assigned_at DESC);

-- Global event claims are separately capped. Personal and team hunts do not
-- consume this pool; all claim writes must lock the hunt row in one transaction.
CREATE TABLE IF NOT EXISTS virtual_world_treasure_global_claims (
  hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hunt_id, user_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_global_claims_recent_idx
  ON virtual_world_treasure_global_claims (hunt_id, claimed_at DESC);
