-- Carry the user's selected gateway destination through the one-time handoff.
ALTER TABLE virtual_world_entry_codes
  ADD COLUMN IF NOT EXISTS entry_kind TEXT NOT NULL DEFAULT 'world'
    CHECK (entry_kind IN ('world','home','event')),
  ADD COLUMN IF NOT EXISTS entry_target_id UUID;
