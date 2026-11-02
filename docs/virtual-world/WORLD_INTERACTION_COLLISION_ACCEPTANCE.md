# UCENO World Interaction and Collision Acceptance

This document records the server-authoritative interaction contract implemented in the world gateway.

## Runtime authority

- Unity sends an interaction request containing an object ID and action; it does not decide the resulting object state.
- The gateway validates the object ID/action shape, resolves the target from the server's loaded interactable registry, measures the player's server-side 3D distance, and applies the shared reach/cooldown policy.
- Default interaction reach is 4.25 metres. The boundary is inclusive.
- Default per-player interaction cooldown is 250 ms. Requests before the boundary are rejected; the boundary itself is accepted.
- The policy rejects non-finite values, negative distance/time, invalid reach, and invalid cooldown values.
- Doors accept only `toggle`; usable objects accept only `use`; seats accept only `sit` or `stand`.
- A seat can have one occupant. Only that occupant can stand. Disconnect releases the seat and broadcasts the available state.
- Rejected requests do not mutate object state or consume the interaction cooldown.
- Durable non-seat object state is persisted before the gateway broadcasts the updated state. Persistence failure restores state, actor, and occupant values and returns a rejection.
- Joining clients receive the current state of registered interactables.

## Geometry workflow

1. Author collision geometry in the Unity scene using actual colliders on static environment objects.
2. Use the Unity editor's collision geometry exporter to produce `uceno-city-collision-boxes.json`.
3. Place the exported collision map at the configured gateway collision-map path.
4. The gateway loads and validates the box data and resolves player movement against those boxes.
5. In the saved Unity scene, select the actual hinged door mesh/pivot and use **GameObject → UCENO → Mark Selected as Door**. Select actual chairs/seats and furniture and use the matching Seat/Furniture authoring command. Each marker receives a stable hash of its Unity GlobalObjectId; display names are not used as identity.
6. Run **UCENO → World → Validate Loaded District Scenes** to reject duplicate IDs and out-of-district objects.
7. Run **UCENO → World → Export Scene Interactables to Gateway Registry**. This exports the real marked scene positions, yaw, kind and stable IDs to `runtime/world-gateway/config/world-interactables.json`. Export fails rather than writing an empty registry, and rejects missing colliders or an unassigned door pivot.
8. Configure the gateway process with `WORLD_INTERACTABLES_FILE=/app/config/world-interactables.json` (or the deployed path). The file must be mounted into the gateway container. The gateway loads the registry at process start, restores durable state from PostgreSQL before admitting a player, and sends the current district's object states to each joining client.
9. Re-export the registry whenever the authored scene object's identity, position, kind or district changes. Restart/redeploy the gateway after replacing the mounted registry file.

The current exporter uses collider world-space bounds and the gateway resolves axis-aligned boxes. This is a conservative approximation for rotated/curved meshes; it is not a substitute for a baked navigation mesh or full physics simulation.

## Automated checks

The gateway test suite covers:
- door state transitions and invalid actions;
- usable-object state transitions and invalid actions;
- exclusive seat occupancy and occupant-only stand;
- missing identity and unsupported actions;
- exact reach/cooldown boundaries and invalid numeric values.

Source-contract CI additionally checks the Unity authoring/exporter wiring, gateway collision loading, interaction transport, state synchronization, and home/event clients.

## Not yet verified

- Unity Editor compilation and scene execution.
- Whether every production city collider is authored and exported correctly.
- Physical Android movement/interactions on low-, mid-, and high-range devices.
- Two-device multiplayer synchronization under latency and reconnect.
- Rotated/complex collider accuracy and large-world collision performance.

A passing source test or TypeScript build does not establish any of these device/Unity checks.


## Scene registration boundary

The exporter and gateway transport are source-implemented, but the current repository does not contain a generated, designer-authored city scene with door/furniture markers or an exported production `world-interactables.json`. Therefore no actual door or furniture instance is yet proven registered. A Unity Editor scene-authoring/export pass is still required before gateway interaction can be exercised against real props.