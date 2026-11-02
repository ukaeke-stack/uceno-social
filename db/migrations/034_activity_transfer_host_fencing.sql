-- Fence activity gateway transfer tickets to the host generation that
-- owns the persisted session when the ticket is issued. This allows an
-- already-joined participant to resume an active competition without allowing
-- a stale ticket to follow a replacement host.
ALTER TABLE virtual_world_activity_transfer_tickets
  ADD COLUMN IF NOT EXISTS host_generation BIGINT;

UPDATE virtual_world_activity_transfer_tickets ticket
SET host_generation = activity.host_generation
FROM virtual_world_activity_sessions activity
WHERE activity.id = ticket.activity_session_id
  AND ticket.host_generation IS NULL;

ALTER TABLE virtual_world_activity_transfer_tickets
  ALTER COLUMN host_generation SET NOT NULL;

ALTER TABLE virtual_world_activity_transfer_tickets
  ADD CONSTRAINT virtual_world_activity_transfer_ticket_host_generation_positive
  CHECK (host_generation > 0);
