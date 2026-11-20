-- Persist discoveries made against private per-player spawn routes.
-- The legacy shared clue table remains readable for already-authored pilot hunts.
CREATE TABLE IF NOT EXISTS virtual_world_treasure_route_discoveries (
  id UUID PRIMARY KEY,
  hunt_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 99),
  spawn_point_id UUID NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (hunt_id, spawn_point_id)
    REFERENCES virtual_world_treasure_spawn_points(hunt_id, id) ON DELETE RESTRICT,
  UNIQUE (hunt_id, user_id, sequence),
  UNIQUE (hunt_id, user_id, spawn_point_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_treasure_route_discoveries_user_idx
  ON virtual_world_treasure_route_discoveries (user_id, discovered_at DESC);
