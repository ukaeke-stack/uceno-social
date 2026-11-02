# UCENO district object persistence

## Runtime contract

The gateway treats each authored interactable as a stable object identity inside a world district. Its district is derived from the object's configured world-space X/Z coordinates using the same non-overlapping WORLD_DISTRICTS rectangles used by district streaming. An object outside every configured district is assigned to unassigned.

WORLD_INTERACTABLES (or WORLD_INTERACTABLES_FILE) must contain an interactables array. Each entry uses:

- id: stable ID, unique within the gateway's authored object set; do not generate a new ID on each scene build.
- kind: door, seat, furniture, vehicle, or object.
- x, y, z: authoritative interaction anchor in Unity world units.
- yaw: optional rotation in radians.

The client sends only an object ID and an allowlisted action. The gateway checks the player's server-side district, spatial context, distance and interaction cooldown. The client cannot select the district, object state, transform, owner or persistence key.

## Durable state

Migration 027_district_object_persistence.sql creates virtual_world_object_states, keyed by (world_id, district_id, object_id). PostgreSQL is the durable source of truth; the old optional local JSON file is not the cross-instance persistence mechanism.

- Doors persist open / closed.
- Furniture and generic objects persist active / idle.
- Vehicles persist engine_on / engine_off.
- Seats remain ephemeral. Occupancy is released on disconnect and is never written as durable object state.
- Writes use optimistic version checks. A stale runtime cannot silently overwrite a newer state.
- Active gateway instances refresh the world's durable object rows every 2.5 seconds and broadcast newer versions only to players currently in that district.
- When a player finishes district content loading, the gateway sends that district's latest object states. Re-entering the district therefore restores the saved state.

## Required configuration and verification

1. Review and apply migrations 015–027 to the separate UCENO database in order; migration 027 has not been applied by this source change.
2. Provision each gateway with the matching district and interactable configuration. Object coordinates must correspond to the actual Unity scene; do not copy sample coordinates blindly.
3. Confirm the instance is registered and healthy before attempting a world session.
4. Run the gateway build and policy tests, then database integration tests for concurrent writes, stale-version rejection, world isolation, district re-entry and cross-instance refresh.
5. Compile in Unity Editor and verify door pivots, furniture markers and vehicle state visuals on the generated scenes.

This change is implemented in source only. It does not claim the migration has been applied, that interactables have been placed on every generated city asset, or that Unity/runtime/device behavior has been verified.
