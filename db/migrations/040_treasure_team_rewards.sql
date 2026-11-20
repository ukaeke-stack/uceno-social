-- Team treasure hunts share a route and reward pool, but retain auditable contribution.
CREATE TABLE IF NOT EXISTS virtual_world_treasure_teams (
  id UUID PRIMARY KEY,
  hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'forming' CHECK (status IN ('forming', 'active', 'completed', 'cancelled')),
  max_members INTEGER NOT NULL DEFAULT 5 CHECK (max_members BETWEEN 2 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hunt_id, id)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_teams_hunt_idx
  ON virtual_world_treasure_teams (hunt_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_team_members (
  hunt_id UUID NOT NULL,
  team_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contribution_points INTEGER NOT NULL DEFAULT 0 CHECK (contribution_points BETWEEN 0 AND 1000000),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id),
  UNIQUE (hunt_id, user_id),
  FOREIGN KEY (hunt_id, team_id)
    REFERENCES virtual_world_treasure_teams(hunt_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_team_members_rank_idx
  ON virtual_world_treasure_team_members (team_id, contribution_points DESC, user_id);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_team_assignments (
  hunt_id UUID NOT NULL,
  team_id UUID NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 99),
  spawn_point_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, sequence),
  FOREIGN KEY (hunt_id, team_id)
    REFERENCES virtual_world_treasure_teams(hunt_id, id) ON DELETE CASCADE,
  FOREIGN KEY (hunt_id, spawn_point_id)
    REFERENCES virtual_world_treasure_spawn_points(hunt_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_team_assignments_spawn_idx
  ON virtual_world_treasure_team_assignments (hunt_id, spawn_point_id);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_team_progress (
  hunt_id UUID NOT NULL,
  team_id UUID NOT NULL,
  next_sequence INTEGER NOT NULL DEFAULT 0 CHECK (next_sequence BETWEEN 0 AND 100),
  completed_at TIMESTAMPTZ,
  reward_issued_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id),
  FOREIGN KEY (hunt_id, team_id)
    REFERENCES virtual_world_treasure_teams(hunt_id, id) ON DELETE CASCADE,
  CHECK (reward_issued_at IS NULL OR completed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_team_discoveries (
  id UUID PRIMARY KEY,
  hunt_id UUID NOT NULL,
  team_id UUID NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 99),
  spawn_point_id UUID NOT NULL,
  discovered_by UUID NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (hunt_id, team_id)
    REFERENCES virtual_world_treasure_teams(hunt_id, id) ON DELETE CASCADE,
  FOREIGN KEY (hunt_id, spawn_point_id)
    REFERENCES virtual_world_treasure_spawn_points(hunt_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (team_id, discovered_by)
    REFERENCES virtual_world_treasure_team_members(team_id, user_id) ON DELETE RESTRICT,
  UNIQUE (team_id, sequence)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_team_discoveries_member_idx
  ON virtual_world_treasure_team_discoveries (team_id, discovered_by, discovered_at DESC);

CREATE TABLE IF NOT EXISTS virtual_world_treasure_team_reward_allocations (
  team_id UUID NOT NULL REFERENCES virtual_world_treasure_teams(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contribution_points INTEGER NOT NULL CHECK (contribution_points > 0),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id, user_id)
    REFERENCES virtual_world_treasure_team_members(team_id, user_id) ON DELETE RESTRICT
);
