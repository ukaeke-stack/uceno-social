-- Persist the city identity on each virtual world so gateway admission can
-- resolve district geometry and content against a server-owned city selection.
-- Existing worlds remain in Meridian Prime; clients cannot choose city_id in
-- a gateway ticket or override this value at runtime.

ALTER TABLE virtual_worlds
  ADD COLUMN IF NOT EXISTS city_id TEXT NOT NULL DEFAULT 'meridian';

ALTER TABLE virtual_worlds
  DROP CONSTRAINT IF EXISTS virtual_worlds_city_id_check;

ALTER TABLE virtual_worlds
  ADD CONSTRAINT virtual_worlds_city_id_check
  CHECK (city_id IN (
    'meridian', 'solstice', 'verdant', 'nexus', 'aurora',
    'saffron', 'monsoon', 'eclipse', 'origin', 'atlas'
  ));

CREATE INDEX IF NOT EXISTS virtual_worlds_city_status_idx
  ON virtual_worlds(city_id, status);
