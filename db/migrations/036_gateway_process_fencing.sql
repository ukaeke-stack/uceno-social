-- A runtime instance UUID identifies a logical shard, not a single OS process.
-- Every gateway process must acquire a short database lease with a monotonically
-- increasing generation before it can become ready or accept WebSocket sessions.
ALTER TABLE virtual_world_instances
  ADD COLUMN IF NOT EXISTS owner_process_id UUID,
  ADD COLUMN IF NOT EXISTS owner_generation BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS virtual_world_instances_process_lease_idx
  ON virtual_world_instances(owner_lease_expires_at);

CREATE OR REPLACE FUNCTION claim_world_instance_process(
  p_instance_id UUID,
  p_process_id UUID,
  p_lease_seconds INTEGER DEFAULT 12
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_generation BIGINT;
BEGIN
  IF p_lease_seconds < 5 OR p_lease_seconds > 60 THEN
    RAISE EXCEPTION 'invalid_process_lease_duration';
  END IF;

  UPDATE virtual_world_instances
  SET owner_process_id = p_process_id,
      owner_generation = owner_generation + 1,
      owner_lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
      heartbeat_at = NOW(),
      current_players = 0
  WHERE id = p_instance_id
    AND status IN ('ready', 'draining')
    AND (owner_process_id IS NULL OR owner_lease_expires_at IS NULL
         OR owner_lease_expires_at <= NOW())
  RETURNING owner_generation INTO v_generation;

  RETURN v_generation;
END;
$$;

CREATE OR REPLACE FUNCTION renew_world_instance_process(
  p_instance_id UUID,
  p_process_id UUID,
  p_generation BIGINT,
  p_current_players INTEGER,
  p_lease_seconds INTEGER DEFAULT 12
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_lease_seconds < 5 OR p_lease_seconds > 60
     OR p_current_players < 0 THEN
    RAISE EXCEPTION 'invalid_process_lease_renewal';
  END IF;

  UPDATE virtual_world_instances
  SET heartbeat_at = NOW(),
      current_players = p_current_players,
      owner_lease_expires_at = NOW() + make_interval(secs => p_lease_seconds)
  WHERE id = p_instance_id
    AND status IN ('ready', 'draining')
    AND owner_process_id = p_process_id
    AND owner_generation = p_generation
    AND owner_lease_expires_at > NOW();

  RETURN FOUND;
END;
$$;
