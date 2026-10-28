-- Apply before deploying media-post code.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type VARCHAR(10);
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_media_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_media_type_check
  CHECK (media_type IS NULL OR media_type IN ('image','video'));
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_media_url_pair_check;
ALTER TABLE posts ADD CONSTRAINT posts_media_url_pair_check
  CHECK ((media_url IS NULL AND media_type IS NULL) OR (media_url IS NOT NULL AND media_type IS NOT NULL));
