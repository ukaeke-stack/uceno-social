-- Bind transfer authorization to the activity host generation observed
-- when the ticket was issued. Host takeover invalidates outstanding tickets.
ALTER TABLE virtual_world_activity_transfer_tickets
  ADD COLUMN IF NOT EXISTS host_generation BIGINT NOT NULL DEFAULT 1
  CHECK (host_generation > 0);
