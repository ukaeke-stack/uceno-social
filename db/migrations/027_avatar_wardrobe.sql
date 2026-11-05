-- Modular avatar wardrobe catalogue, owned inventory and equipped slots.
-- Catalogue rows are populated only after real licensed Unity prefabs are imported and reviewed.
CREATE TABLE IF NOT EXISTS avatar_wardrobe_items (
  item_id TEXT PRIMARY KEY CHECK (item_id ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  slot TEXT NOT NULL CHECK (slot IN ('hair','top','outerwear','bottom','shoes','accessory')),
  prefab_key TEXT NOT NULL CHECK (prefab_key ~ '^[A-Za-z0-9_/-]{1,160}$'),
  asset_version INTEGER NOT NULL DEFAULT 1 CHECK (asset_version > 0),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_avatar_wardrobe_inventory (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES avatar_wardrobe_items(item_id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS user_avatar_wardrobe_equipped (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('hair','top','outerwear','bottom','shoes','accessory')),
  item_id TEXT NOT NULL,
  equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, slot),
  FOREIGN KEY (user_id, item_id)
    REFERENCES user_avatar_wardrobe_inventory(user_id, item_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS avatar_wardrobe_items_enabled_slot_idx
  ON avatar_wardrobe_items(slot, item_id) WHERE enabled = TRUE;
