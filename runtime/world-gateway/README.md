# UCENO World Gateway

Standalone WebSocket runtime for an already-provisioned UCENO world instance.

## What it currently implements

- Verifies UCENO world JWTs using HS256, issuer `uceno-social`, audience
  `uceno-world-gateway`, expiry, world scope, client type and instance claim.
- Re-checks account moderation, world publication/visibility, membership,
  owner-block state and the live instance lease against PostgreSQL at connect.
- Accepts authenticated WebSocket connections at `/world`.
- Accepts sequenced movement input (move axes, yaw, sprint and jump), rejects
  malformed or excessive input, and simulates horizontal movement, gravity,
  jump and ground contact at 20 ticks/second on the server.
- Broadcasts server-generated world snapshots to connected players.
- Stops movement when input goes stale, bounds world coordinates and limits
  players to the configured instance capacity.
- Writes durable player checkpoints every five seconds. The live simulation
  itself is held in memory and is lost when the process restarts.
- Exposes an unauthenticated, non-sensitive `/health` response for platform
  health checks.

## Required environment

- `PORT` (default 8080)
- `WORLD_INSTANCE_ID` (UUID registered in `virtual_world_instances`)
- `DATABASE_URL` (server-only PostgreSQL connection string)
- `WORLD_TOKEN_SECRET` (same server-only secret used to sign world JWTs)
- `WORLD_INSTANCE_CAPACITY` (optional, default 64; keep consistent with DB capacity)
- `WORLD_BOUNDS` (optional, default 10000 world units)

Build with `npm install && npm run build`; run with `npm start`. The Dockerfile
builds and runs the service as a non-root user.

## Provisioning and deployment sequence

1. Apply database migrations 015–024 in numeric order.
2. Create a runtime instance record with the target world, region, reachable
   WebSocket URL in `endpoint`, capacity and status `provisioning`.
3. Deploy this service with the matching `WORLD_INSTANCE_ID` and secrets.
4. Confirm `/health` responds and the service can reach PostgreSQL.
5. Mark the database instance `ready` only after the service is reachable.
   The process updates its heartbeat every ten seconds and derives its active
   player count from connected clients.
6. The entry-code allocator can then issue leases and return the endpoint.

The service does not create cloud infrastructure, register its own database
record, configure DNS/TLS, or deploy itself. Those are operator/orchestration
tasks. Do not expose `DATABASE_URL` or `WORLD_TOKEN_SECRET` to Unity.

## Current simulation limits

This is an initial authoritative kinematic simulation, not a full game-physics
engine. It has no collision meshes, terrain/obstacle queries, vehicles,
prediction/reconciliation, lag compensation, durable distributed simulation,
sharding, anti-cheat heuristics beyond input validation/rate limits, or
cross-instance migration. All players on one instance share one in-memory
simulation process. Multiple replicas must not use the same instance ID.

The current Unity client still uses HTTP presence polling; it does not yet
connect to this WebSocket protocol. Do not treat multiplayer as end-to-end
complete until a Unity WebSocket client is added and two physical devices are
tested against a deployed gateway.
