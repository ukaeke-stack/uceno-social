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
5. The generated playable city builder now places two imported chair seats and an imported table in Central South, plus a hinged service door with a separate leaf collider and pivot. It attaches the server-interactable marker to those actual scene objects.
6. After the builder extracts and saves the four additive district scenes, it automatically runs **Export Scene Interactables to Gateway Registry**. The exporter hashes each final scene object's Unity GlobalObjectId, saves the IDs into the scene components, validates colliders, door pivots and district ownership, and writes `runtime/world-gateway/config/world-interactables.json`. It refuses to export an empty registry.
7. For additional imported props, use **GameObject → UCENO → Mark Selected as Door/Seat/Usable Object/Furniture/Vehicle**, then rerun the registry export. For doors, assign the actual hinged leaf/pivot; never mark an entire building as a door.
8. Configure the gateway process with `WORLD_INTERACTABLES_FILE=/app/config/world-interactables.json`. The file must be present in the deployed gateway image or mounted at that path. The gateway loads it at process start, restores durable object state from PostgreSQL before admitting a player, and sends the current district's object states to each joining client.
9. Re-export the registry whenever scene object identity, position, kind or district changes. Commit the generated registry together with the generated Unity scene assets, then restart/redeploy the gateway after replacing the registry file.

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

The scene builder now generates concrete door, seat and furniture objects, attaches markers, saves the final district scenes, and invokes the exporter. The GitHub source checks verify that wiring, and gateway registry parser tests cover the exported document contract. However, Unity Editor has not yet executed the scene builder in this session, so the generated `world-interactables.json` and scene assets have not been produced or tested. The actual runtime interaction still requires a Unity-generated registry committed/deployed with the gateway, then a live gateway test.