# UCENO World Gateway

Standalone WebSocket runtime for an already-provisioned UCENO world instance.

## What it currently implements

- Verifies UCENO world JWTs using HS256, issuer `uceno-social`, audience
  `uceno-world-gateway`, expiry, world scope, client type and instance claim.
- Re-checks account moderation, world publication/visibility, membership,
  owner-block state and the live instance lease against PostgreSQL at connect.
- Accepts authenticated WebSocket connections at `/world`.
- Accepts sequenced movement input (move axes, yaw, sprint, jump, seated state and wave/cheer gesture state), rejects
  malformed or excessive input, and simulates horizontal movement, gravity,
  jump and ground contact at 20 ticks/second on the server.
- Broadcasts server-generated world snapshots to connected players.\n- Sends the current authoritative state of all configured doors, seats and usable objects to every newly connected/reconnected client, so late joiners do not render stale default states.
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
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (optional until spatial voice is provisioned; server-only credentials for pair-scoped audio rooms)
- `WORLD_COLLISION_BOXES` (optional JSON array of up to 500 static axis-aligned boxes; each box has numeric `minX`, `maxX`, `minY`, `maxY`, `minZ`, `maxZ` world coordinates)\n- `WORLD_DISTRICT_MAP_MANIFEST_FILE` (optional path to the Unity-generated district collision manifest; requires `WORLD_DISTRICTS` / `WORLD_DISTRICTS_FILE` to match exactly)\n- `WORLD_DISTRICTS` or `WORLD_DISTRICTS_FILE` (optional operator-authored district rectangles; each district has a unique `id`, display `name`, Addressables `contentLabel`, and `minX`, `maxX`, `minZ`, `maxZ`)

Build with `npm install && npm run build`; run with `npm start`. The Dockerfile
builds and runs the service as a non-root user.

## District streaming and server-gated boundaries

District metadata is operator-authored per world-gateway instance. Configure
`WORLD_DISTRICTS` as JSON or `WORLD_DISTRICTS_FILE` as a path to a JSON file.
Use the canonical configuration file
`runtime/world-gateway/config/world-districts.json` as
`WORLD_DISTRICTS_FILE`. It is covered by a gateway test that verifies its
IDs, labels, and X/Z boundaries against the four generated Unity district
scenes. If deployment injects `WORLD_DISTRICTS` directly instead, keep it
byte-for-byte aligned with that file.

Districts are axis-aligned X/Z rectangles in the same coordinate system as the
Unity scene. IDs must be unique, rectangles may not overlap, coordinates must
stay within `WORLD_BOUNDS`, and content labels must use the
`world-city-district-<name>` namespace. The gateway rejects invalid configuration
at startup. Gaps between rectangles are valid and represent the base/shared area.

The Unity scene builder partitions generated city objects into four
additive scenes (south, central-south, central-north and north), registers each
scene in the `UCENO Remote District Scenes` Addressables group, uses the
content label as the scene address, and packs each district separately. The
example rectangles above match those generated scene partitions. The base
boot scene retains shared road/terrain, player, camera and session systems.

### District-specific collision maps

The Unity Editor command **UCENO → World → Export Loaded District Maps** generates
`runtime/world-gateway/data/districts/manifest.json` and one JSON collision map
per district. After loading and validating every district scene, export those
files and deploy the manifest and all referenced map files together.

Set `WORLD_DISTRICT_MAP_MANIFEST_FILE` to the absolute path of the deployed
manifest. The gateway validates at startup that every configured district
appears exactly once, labels and X/Z boundaries match `WORLD_DISTRICTS`, map
filenames cannot escape the manifest directory, and each map contains 1–500
valid collision boxes.

When a player enters a district, the gateway switches that player's authoritative
X/Z collision queries to that district's map only after the server accepts the
district content handshake. On leaving all configured districts, it falls back
to the legacy global map. Keep the global map configured for shared/base-world
geometry and gaps between district rectangles.

This setting is optional for backward compatibility. If omitted, the gateway
continues using the legacy global collision map. Do not enable the manifest
until all district scenes have been exported and deployed together; missing,
stale or mismatched files intentionally prevent gateway startup. Persistent
object state remains keyed by world, district and object ID independently of
collision-map selection.

At a district boundary, the authoritative simulation pauses the player's
horizontal movement and sends `district_content_required` with the server-chosen
district ID, label and one-time nonce. Unity downloads the label, then loads
its matching additive Addressables scene and replies with
`district_content_ready` only after scene activation succeeds. The gateway
validates the pending district and nonce before allowing movement into that
district. If the player turns back while downloading, the gateway cancels the
pending transition. Clients cannot choose district geometry, labels or IDs.

This is source-level behavior. The scene builder requires Addressables Settings
and assigns generated scenes to remote build/load path variables. Operators
must configure a real HTTPS remote profile, build and publish the catalog and
bundles, and deploy matching gateway rectangles. Browser builds need their own
WebGL-compatible scene bundles and catalog. No CDN or production catalog is
provisioned by this code change.


## Activity sessions and checkpoint races

The gateway coordinates activity sessions over the authenticated `/world`
WebSocket. Session state is persisted in PostgreSQL and restored by the instance
that currently owns the session:

- `activity_create` with kind `dance`, `sports`, or `adventure`
- `activity_join`, `activity_start`, `activity_leave`, and `activity_cancel`
- `activity_state` broadcasts participant status and race progress
- Only the creator can start or cancel a session. The server marks active
  participants as did-not-finish when their socket disconnects.
- Durable session state and relay events are written transactionally. Activity
  ownership includes an instance ID and monotonically increasing host generation;
  stale hosts cannot overwrite a newer generation or publish a state event through
  the guarded persistence path.
- Stale activity hosts can be taken over by a healthy replacement instance. Transfer
  tickets are single-use, expiring and authorization-checked; player-session fencing
  similarly prevents an older connection from replacing a newer session.
- On startup, an instance restores only activity sessions assigned to that instance.
  This is activity-session recovery, not recovery of the full live player simulation.
- The gateway caps total sessions at 256 and nonterminal sessions at 32 per world;
  idle lobbies expire after 30 minutes, active sessions after 2 hours, and terminal
  session summaries are retained in memory for 30 minutes. Durable activity storage,
  takeover and fencing are implemented in source; multi-process WebSocket failover
  and production recovery still require runtime verification. Actual sports/adventure
  gameplay remains outstanding.

Checkpoint races require operator-authored server geometry. Configure either
`WORLD_ACTIVITY_RACES` as JSON or `WORLD_ACTIVITY_RACES_FILE` as a path to a
JSON file. Example:

```json
{
  "races": [
    {
      "id": "city-loop",
      "checkpoints": [
        { "x": 0, "y": 1.15, "z": 0, "radius": 2.5 },
        { "x": 20, "y": 1.15, "z": 0, "radius": 2.5 },
        { "x": 20, "y": 1.15, "z": 20, "radius": 2.5 }
      ]
    }
  ]
}
```

Each race needs 2–100 checkpoints. Coordinates must use the same world coordinate
system as Unity; checkpoint radius defaults to 2.5 units and can be configured
from 0.5 to 20 units. A client creates a race by sending
`{ "type": "activity_create", "kind": "checkpoint_race", "raceId": "city-loop" }`.
The gateway checks progress using server-simulated positions and the next
configured checkpoint only. Clients cannot submit checkpoint indexes or finish
times. If no race definitions are configured, race creation is rejected with
`race_not_configured`.

This is source-level functionality until the gateway is deployed with the race
configuration. The Unity UI still needs to expose race creation, lobby state,
countdown, checkpoint indicators, and results. CI verifies the gateway source and
database fencing tests; it does not establish live race behavior or multi-process
WebSocket failover on deployed infrastructure.

## Provisioning and deployment sequence

1. Apply database migrations 015–025 in numeric order.
2. Create a runtime instance record with the target world, region, reachable
   WebSocket URL in `endpoint`, capacity and status `provisioning`.
3. Deploy this service with the matching `WORLD_INSTANCE_ID` and secrets.
4. Confirm `/health` responds and the service can reach PostgreSQL.
5. Mark the database instance `ready` only after the service is reachable.
   The process updates its heartbeat every ten seconds and derives its active
   player count from connected clients.
6. The entry-code allocator can then issue leases and return the endpoint.

Collision-box coordinates must match the Unity world's coordinate system. The gateway validates the JSON and refuses to start on malformed or out-of-bounds boxes. The current resolver uses a 0.4-unit horizontal player radius and 1.8-unit player height; it resolves horizontal X/Z movement against static boxes, but does not provide slopes, stairs, moving platforms, dynamic rigidbodies or vertical obstacle response.

The service does not create cloud infrastructure, register its own database
record, configure DNS/TLS, or deploy itself. Those are operator/orchestration
tasks. Do not expose `DATABASE_URL` or `WORLD_TOKEN_SECRET` to Unity.

## Current simulation limits

This is an initial authoritative kinematic simulation, not a full game-physics
engine. It supports optional server-side axis-aligned collision boxes configured through `WORLD_COLLISION_BOXES`. This is a basic static-blocker system, not imported Unity mesh collision or terrain. It has no collision meshes, terrain/obstacle queries, vehicles,
prediction/reconciliation, lag compensation, durable distributed player simulation,
sharding, or anti-cheat heuristics beyond input validation/rate limits. Activity
sessions have separate durable persistence, host-generation fencing and stale-host
takeover; this does not migrate the live movement simulation or its connected
players. All players on one instance share one in-memory movement simulation
process. Multiple replicas must not use the same instance ID.

The Unity client now connects to this WebSocket protocol, sends sequenced input
at 20 Hz and applies server snapshots to the local and remote avatars. HTTP
presence remains as a low-frequency lease/session heartbeat; it is no longer
used to render remote movement. End-to-end multiplayer is not yet verified:
the gateway must be deployed, the database migrations applied, and two physical
devices tested against the same ready instance.


## Proximity voice signaling status

The gateway provides an authenticated, proximity- and spatial-context-scoped WebSocket signaling relay for WebRTC offers, answers and ICE candidates. Both users must opt in; the server enforces same-world/same-home-or-event scope, 24-metre range, block checks, bounded payloads and rate limits.

The gateway reconciles active voice peers once per second. When either player moves out of range or changes spatial context, both clients receive inactive presence; when two opted-in players become eligible peers again, presence is re-announced after a server-side block check. Existing nearby pairs have their block relationship rechecked at least every five seconds, so a newly created block revokes voice presence without querying PostgreSQL on every position reconciliation. Reconciliation is source-implemented; runtime behavior and database load have not been tested.

This is only the signaling plane. A WebRTC media implementation, microphone permissions, STUN/TURN service configuration, audio playback, spatial attenuation and physical-device testing are still required before voice chat works end to end.


## Pair-scoped LiveKit media authorization

When all three LiveKit environment variables are configured, the gateway exposes
`GET /voice/token?peerUserId=<uuid>`. It requires the caller's existing UCENO
world-session bearer token. The gateway validates the token and checks that both
accounts are currently connected to this exact instance, have explicitly opted
into voice, are in the same world/home/event context, are within 24 metres, and
are not blocked. It then issues a 30-second LiveKit token for a private room
whose name is derived server-side from the pair and a fresh room generation.
Clients cannot choose the room or participant identity.

Each pair gets a separate room, so a third nearby or distant player is not
automatically admitted to another pair's media. Pair-room deletion is requested
when voice eligibility ends, a block is detected, or either participant leaves.
This server implementation requires a LiveKit deployment and server-only
credentials. LiveKit token expiry is 30 seconds; teardown behavior and token
revocation semantics must be tested against the selected LiveKit deployment.
The 30-second token lifetime is a fallback bound, not proof of instantaneous
revocation for a client already holding a token.

The Next.js `POST /api/worlds/[worldId]/voice-token` route proxies to the
user's assigned healthy gateway using the existing bearer token and a
server-derived instance endpoint. The request body contains only
`peerUserId`; all authorization decisions are made by the gateway.

This is still not end-to-end voice chat: Unity microphone capture, LiveKit room
connection, remote audio playback, positional attenuation, mute controls and
Android audio lifecycle integration remain to be implemented and tested.

## District-aware object persistence

Set WORLD_INTERACTABLES_FILE to the JSON map exported by Unity's
UCENO/World/Export Current Scene Collision Map command, or use
WORLD_COLLISION_BOXES_FILE for the same combined map. The file contains both
static collision boxes and an interactables array. WORLD_INTERACTABLES may
instead provide the interactables JSON directly.

Each exported interactable has a stable object ID, kind, and authoritative
world-space interaction anchor. The gateway derives district ownership from
the anchor coordinates and WORLD_DISTRICTS; clients cannot submit or override
the district. Supported durable kinds are door, furniture, vehicle and object.
Seats remain temporary and are released on disconnect.

Apply db/migrations/028_district_object_persistence.sql after migrations
015–027. PostgreSQL stores state by world, district and object ID. Runtime
instances load state before admitting a WebSocket session, use version-checked
writes, and refresh newer versions every 2.5 seconds so separate instances
converge. A district's object state is sent after its content-ready handshake.
Do not enable the gateway against a database that has not received migration
028.

Unity's GameObject/UCENO authoring menu can mark selected scene objects as
doors, seats, usable objects, furniture or vehicles. Assign the actual door
pivot where applicable, keep object IDs stable, and export the scene map after
authoring. The editor source change does not itself place markers on every
furnished/city asset.
