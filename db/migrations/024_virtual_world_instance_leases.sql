-- Per-player runtime instance leases for UCENO Unity clients.
-- Apply after migration 023. This selects only externally provisioned, healthy
-- instances; it does not create or deploy game servers.

CREATE TABLE IF NOT EXISTS virtual_world_instance_sessions (
  world_id UUID NOT NULL REFERENCES virtual_worlds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES virtual_world_instances(id) ON DELETE CASCADE,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (world_id, user_id)
);

CREATE INDEX IF NOT EXISTS virtual_world_instance_sessions_capacity_idx
  ON virtual_world_instance_sessions(instance_id, lease_expires_at);

CREATE INDEX IF NOT EXISTS virtual_world_instance_sessions_expiry_idx
  ON virtual_world_instance_sessions(lease_expires_at);

-- Bind ephemeral presence to the assigned runtime so clients do not render
-- players who belong to another instance of the same world.
ALTER TABLE virtual_world_presence
  ADD COLUMN IF NOT EXISTS instance_id UUID
  REFERENCES virtual_world_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS virtual_world_presence_instance_seen_idx
  ON virtual_world_presence(instance_id, last_seen DESC);

CREATE OR REPLACE FUNCTION claim_virtual_world_instance(
  p_world_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  instance_id UUID,
  endpoint TEXT,
  region TEXT,
  lease_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance virtual_world_instances%ROWTYPE;
  v_lease TIMESTAMPTZ := NOW() + INTERVAL '45 seconds';
BEGIN
  -- Serialize claims for this world. A row lock alone does not guarantee
  -- that a concurrent capacity COUNT sees leases inserted by a waiting claim.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_world_id::text, 0));

  -- Prefer a still-healthy instance already assigned to this player.
  SELECT i.* INTO v_instance
  FROM virtual_world_instance_sessions s
  JOIN virtual_world_instances i ON i.id = s.instance_id
  WHERE s.world_id = p_world_id
    AND s.user_id = p_user_id
    AND s.lease_expires_at > NOW()
    AND i.world_id = p_world_id
    AND i.status = 'ready'
    AND i.endpoint IS NOT NULL
    AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
  FOR UPDATE OF i;

  IF FOUND THEN
    UPDATE virtual_world_instance_sessions s
      SET lease_expires_at = v_lease, updated_at = NOW()
      WHERE s.world_id = p_world_id AND s.user_id = p_user_id;
    RETURN QUERY SELECT v_instance.id, v_instance.endpoint, v_instance.region, v_lease;
    RETURN;
  END IF;

  -- Lock one healthy instance before counting leases. Concurrent claims for
  -- the same instance serialize on this row, preventing capacity overbooking.
  SELECT i.* INTO v_instance
  FROM virtual_world_instances i
  WHERE i.world_id = p_world_id
    AND i.status = 'ready'
    AND i.endpoint IS NOT NULL
    AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
    AND (
      SELECT COUNT(*) FROM virtual_world_instance_sessions s
      WHERE s.instance_id = i.id AND s.lease_expires_at > NOW()
    ) < i.capacity
  ORDER BY
    (
      SELECT COUNT(*)::NUMERIC / GREATEST(i.capacity, 1)
      FROM virtual_world_instance_sessions s
      WHERE s.instance_id = i.id AND s.lease_expires_at > NOW()
    ) ASC,
    i.heartbeat_at DESC,
    i.created_at ASC
  FOR UPDATE OF i SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO virtual_world_instance_sessions
    (world_id, user_id, instance_id, lease_expires_at, updated_at)
  VALUES (p_world_id, p_user_id, v_instance.id, v_lease, NOW())
  ON CONFLICT (world_id, user_id) DO UPDATE SET
    instance_id = EXCLUDED.instance_id,
    lease_expires_at = EXCLUDED.lease_expires_at,
    updated_at = NOW();

  RETURN QUERY SELECT v_instance.id, v_instance.endpoint, v_instance.region, v_lease;
END;
$$;

-- Operators should mark a runtime instance ready only after its gateway is
-- reachable and heartbeat_at is being refreshed. Expired player leases are
-- ignored for capacity and may be removed by a scheduled cleanup.
