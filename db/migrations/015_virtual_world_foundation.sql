-- UCENO Virtual World durable foundation.
-- Apply manually through the reviewed database migration process; never from an API request.
-- Additive only. Existing UCENO users remain the single identity source.

CREATE TABLE IF NOT EXISTS virtual_worlds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','unlisted')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','maintenance','archived')),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  max_players INTEGER NOT NULL DEFAULT 64 CHECK (max_players BETWEEN 1 AND 500),
  region TEXT NOT NULL DEFAULT 'auto',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS virtual_world_memberships (
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, user_id)
);
CREATE INDEX IF NOT EXISTS virtual_world_memberships_user_idx ON virtual_world_memberships(user_id);

CREATE TABLE IF NOT EXISTS virtual_world_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  endpoint TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning','ready','draining','offline')),
  current_players INTEGER NOT NULL DEFAULT 0 CHECK (current_players >= 0),
  capacity INTEGER NOT NULL DEFAULT 64 CHECK (capacity BETWEEN 1 AND 500),
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS virtual_world_instances_ready_idx ON virtual_world_instances(world_id, status, region);

CREATE TABLE IF NOT EXISTS virtual_world_entry_codes (
  code_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  client_type TEXT NOT NULL CHECK (client_type IN ('unity-android','unity-desktop')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS virtual_world_entry_codes_expiry_idx ON virtual_world_entry_codes(expires_at);

CREATE TABLE IF NOT EXISTS virtual_world_player_state (
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spawn_id TEXT,
  position JSONB NOT NULL DEFAULT '{"x":0,"y":0,"z":0}'::jsonb,
  rotation JSONB NOT NULL DEFAULT '{"x":0,"y":0,"z":0,"w":1}'::jsonb,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, user_id)
);

CREATE TABLE IF NOT EXISTS virtual_homes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  template_id TEXT NOT NULL,
  transform JSONB NOT NULL DEFAULT '{}'::jsonb,
  furnishing JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'invite' CHECK (visibility IN ('private','invite','friends')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS virtual_homes_owner_idx ON virtual_homes(owner_user_id);

CREATE TABLE IF NOT EXISTS virtual_home_members (
  home_id UUID NOT NULL REFERENCES virtual_homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'visitor' CHECK (permission IN ('visitor','decorator','co_owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (home_id, user_id)
);

CREATE TABLE IF NOT EXISTS virtual_world_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(140) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 5000),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS virtual_world_events_schedule_idx ON virtual_world_events(world_id, starts_at) WHERE status='scheduled';

CREATE TABLE IF NOT EXISTS virtual_world_event_attendees (
  event_id UUID NOT NULL REFERENCES virtual_world_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_status TEXT NOT NULL DEFAULT 'going' CHECK (attendance_status IN ('going','interested','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- Two distinct spendable balances; ledger rows are append-only.
CREATE TABLE IF NOT EXISTS uceno_credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  earned_balance BIGINT NOT NULL DEFAULT 0 CHECK (earned_balance >= 0),
  purchased_balance BIGINT NOT NULL DEFAULT 0 CHECK (purchased_balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS uceno_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_type TEXT NOT NULL CHECK (credit_type IN ('earned','purchased')),
  amount BIGINT NOT NULL CHECK (amount <> 0),
  reason TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS uceno_credit_ledger_user_idx ON uceno_credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS virtual_marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id UUID REFERENCES virtual_worlds(id) ON DELETE SET NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  item_type TEXT NOT NULL CHECK (item_type IN ('avatar_item','furniture','art','experience')),
  asset_key TEXT,
  price_purchased_credits BIGINT NOT NULL CHECK (price_purchased_credits >= 0),
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS virtual_marketplace_active_idx ON virtual_marketplace_listings(status, created_at DESC);

CREATE TABLE IF NOT EXISTS virtual_ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id UUID REFERENCES virtual_worlds(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  creative_asset_key TEXT NOT NULL,
  destination_url TEXT,
  payment_source TEXT NOT NULL CHECK (payment_source IN ('real_money','purchased_credits')),
  budget_minor BIGINT NOT NULL CHECK (budget_minor > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','active','paused','completed','rejected')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
