-- Durable per-instance relay acknowledgements. A replacement gateway resumes
-- from the last event it successfully handled instead of skipping the backlog.
CREATE TABLE IF NOT EXISTS virtual_world_realtime_consumers (
  instance_id UUID PRIMARY KEY REFERENCES virtual_world_instances(id) ON DELETE CASCADE,
  last_event_id BIGINT NOT NULL DEFAULT 0 CHECK (last_event_id >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
