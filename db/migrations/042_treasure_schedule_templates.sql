-- Operator-authored daily, weekly and seasonal treasure schedules.
-- Template spawn points must come from qualified Unity city exports.
CREATE TABLE IF NOT EXISTS virtual_world_treasure_hunt_templates (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  world_id UUID REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'seasonal')),
  time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 80),
  active_from TIMESTAMPTZ,
  active_until TIMESTAMPTZ,
  reward_earned_credits BIGINT NOT NULL DEFAULT 0 CHECK (reward_earned_credits >= 0),
  distribution_mode TEXT NOT NULL CHECK (distribution_mode IN ('personal', 'team', 'global')),
  max_global_winners INTEGER CHECK (max_global_winners IS NULL OR max_global_winners BETWEEN 1 AND 1000000),
  max_reward_claims INTEGER CHECK (max_reward_claims IS NULL OR max_reward_claims BETWEEN 1 AND 1000000),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (active_until IS NULL OR active_from IS NULL OR active_until > active_from),
  CHECK (distribution_mode <> 'global' OR max_global_winners IS NOT NULL),
  CHECK (cadence <> 'seasonal' OR (active_from IS NOT NULL AND active_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_templates_live_idx
  ON virtual_world_treasure_hunt_templates (cadence, active_from, active_until)
  WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS virtual_world_treasure_template_spawn_points (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES virtual_world_treasure_hunt_templates(id) ON DELETE CASCADE,
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
  UNIQUE (template_id, sequence, interactable_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_template_spawn_idx
  ON virtual_world_treasure_template_spawn_points (template_id, sequence)
  WHERE enabled = TRUE;

ALTER TABLE virtual_world_treasure_hunts
  ADD COLUMN IF NOT EXISTS template_id UUID
    REFERENCES virtual_world_treasure_hunt_templates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS schedule_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS virtual_world_treasure_hunt_schedule_once_idx
  ON virtual_world_treasure_hunts (template_id, schedule_key);
