-- Support picture moments and missed-call history.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS media_type VARCHAR(10);
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_media_type_check;
ALTER TABLE stories ADD CONSTRAINT stories_media_type_check
  CHECK (media_type IS NULL OR media_type = 'image');
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_media_url_pair_check;
ALTER TABLE stories ADD CONSTRAINT stories_media_url_pair_check
  CHECK ((media_url IS NULL AND media_type IS NULL) OR (media_url IS NOT NULL AND media_type IS NOT NULL));

ALTER TABLE call_invitations DROP CONSTRAINT IF EXISTS call_invitations_status_check;
ALTER TABLE call_invitations ADD CONSTRAINT call_invitations_status_check
  CHECK (status IN ('pending','accepted','rejected','cancelled','missed'));
