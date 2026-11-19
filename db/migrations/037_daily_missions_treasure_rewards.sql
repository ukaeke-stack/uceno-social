-- Phase 1 durable mission, treasure-hunt and Earned Credits foundations.
-- This migration is additive. It is intentionally NOT applied to production here.
-- Schedules/spawn rows are populated only from reviewed live-ops and real authored
-- world content; no placeholder missions or treasure locations are inserted.

CREATE TABLE IF NOT EXISTS virtual_world_daily_mission_templates (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'checkpoint_finished', 'dance_completed', 'sports_completed', 'adventure_objective'
  )),
  target_count INTEGER NOT NULL CHECK (target_count BETWEEN 1 AND 10000),
  reward_earned_credits BIGINT NOT NULL DEFAULT 0 CHECK (reward_earned_credits >= 0),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS virtual_world_daily_mission_instances (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES virtual_world_daily_mission_templates(id) ON DELETE RESTRICT,
  world_id UUID REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  schedule_key TEXT NOT NULL CHECK (length(schedule_key) BETWEEN 1 AND 80),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  UNIQUE (template_id, schedule_key)
);
CREATE INDEX IF NOT EXISTS virtual_world_daily_mission_instances_live_idx
  ON virtual_world_daily_mission_instances (starts_at, ends_at)
  WHERE starts_at < ends_at;

CREATE TABLE IF NOT EXISTS virtual_world_daily_mission_progress (
  mission_instance_id UUID NOT NULL REFERENCES virtual_world_daily_mission_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_count INTEGER NOT NULL DEFAULT 0 CHECK (progress_count >= 0),
  completed_at TIMESTAMPTZ,
  reward_issued_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mission_instance_id, user_id),
  CHECK (reward_issued_at IS NULL OR completed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS virtual_world_daily_mission_progress_user_idx
  ON virtual_world_daily_mission_progress (user_id, updated_at DESC);

-- Every accepted progress event is linked to a persisted, finished activity result.
-- Unique constraints make reconnect/retry replay-safe at both event and result level.
CREATE TABLE IF NOT EXISTS virtual_world_daily_mission_events (
  event_id UUID PRIMARY KEY,
  mission_instance_id UUID NOT NULL REFERENCES virtual_world_daily_mission_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_result_id BIGINT NOT NULL REFERENCES virtual_world_activity_results(id) ON DELETE RESTRICT,
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'checkpoint_finished', 'dance_completed', 'adventure_objective'
  )),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_instance_id, user_id, activity_result_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_daily_mission_events_user_idx
  ON virtual_world_daily_mission_events (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_hunts (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  world_id UUID REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reward_earned_credits BIGINT NOT NULL DEFAULT 0 CHECK (reward_earned_credits >= 0),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_hunts_live_idx
  ON virtual_world_treasure_hunts (starts_at, ends_at)
  WHERE enabled = TRUE;

-- Spawn coordinates and interactable IDs must come from qualified, exported city
-- scenes. The schema does not create any clues or synthetic world locations.
CREATE TABLE IF NOT EXISTS virtual_world_treasure_clues (
  id UUID PRIMARY KEY,
  hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 99),
  city_id TEXT NOT NULL CHECK (city_id ~ '^[a-z0-9][a-z0-9_-]{1,63} CHECK (length(district_id) BETWEEN 1 AND 80),
  interactable_id TEXT NOT NULL CHECK (length(interactable_id) BETWEEN 1 AND 128),
  position_x DOUBLE PRECISION NOT NULL CHECK (position_x BETWEEN -10000 AND 10000),
  position_y DOUBLE PRECISION NOT NULL CHECK (position_y BETWEEN -10000 AND 10000),
  position_z DOUBLE PRECISION NOT NULL CHECK (position_z BETWEEN -10000 AND 10000),
  interaction_radius DOUBLE PRECISION NOT NULL CHECK (interaction_radius BETWEEN 0.5 AND 8),
  clue_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hunt_id, sequence),
  UNIQUE (hunt_id, id),
  UNIQUE (hunt_id, interactable_id)
);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_progress (
  hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  next_sequence INTEGER NOT NULL DEFAULT 0 CHECK (next_sequence BETWEEN 0 AND 100),
  completed_at TIMESTAMPTZ,
  reward_issued_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hunt_id, user_id),
  CHECK (reward_issued_at IS NULL OR completed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_discoveries (
  id UUID PRIMARY KEY,
  hunt_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clue_id UUID NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 99),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (hunt_id, clue_id)
    REFERENCES virtual_world_treasure_clues(hunt_id, id) ON DELETE CASCADE,
  UNIQUE (hunt_id, user_id, sequence),
  UNIQUE (hunt_id, user_id, clue_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_discoveries_user_idx
  ON virtual_world_treasure_discoveries (user_id, discovered_at DESC);

-- This ledger is for gameplay Earned Credits only. Purchased Credits and Cash
-- Rewards must use separate accounting systems and cannot be represented here.
CREATE TABLE IF NOT EXISTS virtual_world_earned_credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ledger_type TEXT NOT NULL DEFAULT 'earned' CHECK (ledger_type = 'earned'),
  currency TEXT NOT NULL DEFAULT 'earned_credits' CHECK (currency = 'earned_credits'),
  amount BIGINT NOT NULL CHECK (amount > 0),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  source_type TEXT NOT NULL CHECK (source_type IN ('activity_result', 'daily_mission', 'treasure_hunt')),
  source_activity_result_id BIGINT REFERENCES virtual_world_activity_results(id) ON DELETE RESTRICT,
  source_mission_instance_id UUID REFERENCES virtual_world_daily_mission_instances(id) ON DELETE RESTRICT,
  source_treasure_hunt_id UUID REFERENCES virtual_world_treasure_hunts(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (source_type = 'activity_result' AND source_activity_result_id IS NOT NULL
      AND source_mission_instance_id IS NULL AND source_treasure_hunt_id IS NULL)
    OR
    (source_type = 'daily_mission' AND source_activity_result_id IS NULL
      AND source_mission_instance_id IS NOT NULL AND source_treasure_hunt_id IS NULL)
    OR
    (source_type = 'treasure_hunt' AND source_activity_result_id IS NULL
      AND source_mission_instance_id IS NULL AND source_treasure_hunt_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS virtual_world_earned_credit_activity_once_idx
  ON virtual_world_earned_credit_ledger (user_id, source_activity_result_id)
  WHERE source_activity_result_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS virtual_world_earned_credit_mission_once_idx
  ON virtual_world_earned_credit_ledger (user_id, source_mission_instance_id)
  WHERE source_mission_instance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS virtual_world_earned_credit_treasure_once_idx
  ON virtual_world_earned_credit_ledger (user_id, source_treasure_hunt_id)
  WHERE source_treasure_hunt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS virtual_world_earned_credit_user_history_idx
  ON virtual_world_earned_credit_ledger (user_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION prevent_virtual_world_earned_credit_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'earned_credit_ledger_is_append_only';
END;
$$;

DROP TRIGGER IF EXISTS virtual_world_earned_credit_ledger_append_only
  ON virtual_world_earned_credit_ledger;
CREATE TRIGGER virtual_world_earned_credit_ledger_append_only
  BEFORE UPDATE OR DELETE ON virtual_world_earned_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_virtual_world_earned_credit_ledger_mutation();
),
  district_id TEXT NOT NULL CHECK (length(district_id) BETWEEN 1 AND 80),
  interactable_id TEXT NOT NULL CHECK (length(interactable_id) BETWEEN 1 AND 128),
  position_x DOUBLE PRECISION NOT NULL CHECK (position_x BETWEEN -10000 AND 10000),
  position_y DOUBLE PRECISION NOT NULL CHECK (position_y BETWEEN -10000 AND 10000),
  position_z DOUBLE PRECISION NOT NULL CHECK (position_z BETWEEN -10000 AND 10000),
  interaction_radius DOUBLE PRECISION NOT NULL CHECK (interaction_radius BETWEEN 0.5 AND 8),
  clue_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hunt_id, sequence),
  UNIQUE (hunt_id, id),
  UNIQUE (hunt_id, interactable_id)
);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_progress (
  hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  next_sequence INTEGER NOT NULL DEFAULT 0 CHECK (next_sequence BETWEEN 0 AND 100),
  completed_at TIMESTAMPTZ,
  reward_issued_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hunt_id, user_id),
  CHECK (reward_issued_at IS NULL OR completed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_discoveries (
  id UUID PRIMARY KEY,
  hunt_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clue_id UUID NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 99),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (hunt_id, clue_id)
    REFERENCES virtual_world_treasure_clues(hunt_id, id) ON DELETE CASCADE,
  UNIQUE (hunt_id, user_id, sequence),
  UNIQUE (hunt_id, user_id, clue_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_discoveries_user_idx
  ON virtual_world_treasure_discoveries (user_id, discovered_at DESC);

-- This ledger is for gameplay Earned Credits only. Purchased Credits and Cash
-- Rewards must use separate accounting systems and cannot be represented here.
CREATE TABLE IF NOT EXISTS virtual_world_earned_credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ledger_type TEXT NOT NULL DEFAULT 'earned' CHECK (ledger_type = 'earned'),
  currency TEXT NOT NULL DEFAULT 'earned_credits' CHECK (currency = 'earned_credits'),
  amount BIGINT NOT NULL CHECK (amount > 0),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  source_type TEXT NOT NULL CHECK (source_type IN ('activity_result', 'daily_mission', 'treasure_hunt')),
  source_activity_result_id BIGINT REFERENCES virtual_world_activity_results(id) ON DELETE RESTRICT,
  source_mission_instance_id UUID REFERENCES virtual_world_daily_mission_instances(id) ON DELETE RESTRICT,
  source_treasure_hunt_id UUID REFERENCES virtual_world_treasure_hunts(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (source_type = 'activity_result' AND source_activity_result_id IS NOT NULL
      AND source_mission_instance_id IS NULL AND source_treasure_hunt_id IS NULL)
    OR
    (source_type = 'daily_mission' AND source_activity_result_id IS NULL
      AND source_mission_instance_id IS NOT NULL AND source_treasure_hunt_id IS NULL)
    OR
    (source_type = 'treasure_hunt' AND source_activity_result_id IS NULL
      AND source_mission_instance_id IS NULL AND source_treasure_hunt_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS virtual_world_earned_credit_activity_once_idx
  ON virtual_world_earned_credit_ledger (user_id, source_activity_result_id)
  WHERE source_activity_result_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS virtual_world_earned_credit_mission_once_idx
  ON virtual_world_earned_credit_ledger (user_id, source_mission_instance_id)
  WHERE source_mission_instance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS virtual_world_earned_credit_treasure_once_idx
  ON virtual_world_earned_credit_ledger (user_id, source_treasure_hunt_id)
  WHERE source_treasure_hunt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS virtual_world_earned_credit_user_history_idx
  ON virtual_world_earned_credit_ledger (user_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION prevent_virtual_world_earned_credit_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'earned_credit_ledger_is_append_only';
END;
$$;

DROP TRIGGER IF EXISTS virtual_world_earned_credit_ledger_append_only
  ON virtual_world_earned_credit_ledger;
CREATE TRIGGER virtual_world_earned_credit_ledger_append_only
  BEFORE UPDATE OR DELETE ON virtual_world_earned_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_virtual_world_earned_credit_ledger_mutation();
