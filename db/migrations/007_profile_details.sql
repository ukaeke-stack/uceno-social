ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio VARCHAR(280) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS location VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website VARCHAR(240) NOT NULL DEFAULT '';

-- Replace the named constraint so this migration remains safe if the profile
-- schema was applied manually before the migration runner reaches this file.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_website_https_check;

ALTER TABLE users
  ADD CONSTRAINT users_website_https_check
  CHECK (website = '' OR website ~ '^https://[^[:space:]]+$');
