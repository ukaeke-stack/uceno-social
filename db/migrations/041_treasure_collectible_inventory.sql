-- Collectible inventory and finite-supply treasure rewards.
-- Catalog rows are operator-authored; this migration seeds no invented rewards.
CREATE TABLE IF NOT EXISTS virtual_world_collectible_catalog (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  category TEXT NOT NULL CHECK (category IN ('badge', 'trophy', 'gem', 'avatar_cosmetic', 'furniture')),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  max_supply BIGINT CHECK (max_supply IS NULL OR max_supply > 0),
  minted_count BIGINT NOT NULL DEFAULT 0 CHECK (minted_count >= 0),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_supply IS NULL OR minted_count <= max_supply)
);
CREATE INDEX IF NOT EXISTS virtual_world_collectible_catalog_live_idx
  ON virtual_world_collectible_catalog (category, rarity, code)
  WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS virtual_world_treasure_reward_items (
  hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE CASCADE,
  collectible_id UUID NOT NULL REFERENCES virtual_world_collectible_catalog(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
  PRIMARY KEY (hunt_id, collectible_id)
);

CREATE TABLE IF NOT EXISTS virtual_world_user_collectibles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  collectible_id UUID NOT NULL REFERENCES virtual_world_collectible_catalog(id) ON DELETE RESTRICT,
  source_treasure_hunt_id UUID NOT NULL REFERENCES virtual_world_treasure_hunts(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, collectible_id, source_treasure_hunt_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_user_collectibles_inventory_idx
  ON virtual_world_user_collectibles (user_id, awarded_at DESC, id DESC);
