import test from "node:test";
import assert from "node:assert/strict";
import { createActivitySession, joinActivity } from "../dist/activity-session.js";
import { serializeActivitySession, restoreActivitySession, shouldApplyPersistedActivityVersion } from "../dist/activity-persistence.js";
const world = "123e4567-e89b-12d3-a456-426614174000";
test("activity sessions round-trip participants and host fencing metadata", () => {
  const made = createActivitySession({ id: "persist-race-01", worldId: world, instanceId: "inst-a", kind: "checkpoint_race", now: 100, checkpointCount: 3 });
  assert.equal(made.ok, true);
  if (!made.ok) return;
  joinActivity(made.session, "123e4567-e89b-12d3-a456-426614174001", 110);
  const stored = serializeActivitySession(made.session, "123e4567-e89b-12d3-a456-426614174001", 2, "city-race");
  const restored = restoreActivitySession(JSON.parse(JSON.stringify(stored)));
  assert.ok(restored);
  assert.equal(restored.session.version, made.session.version);
  assert.equal(restored.session.participants.size, 1);
  assert.equal(restored.hostGeneration, 2);
  assert.equal(restored.raceId, "city-race");
});
test("rejects malformed persisted state and stale versions", () => {
  assert.equal(restoreActivitySession({ id: "x", participants: [] }), null);
  assert.equal(shouldApplyPersistedActivityVersion(4, 4), false);
  assert.equal(shouldApplyPersistedActivityVersion(4, 5), true);
  assert.equal(shouldApplyPersistedActivityVersion(4, 3), false);
});

test("rejects impossible activity phase timestamps and invalid checkpoint bounds", () => {
  const base = {
    id: "persist-race-02", worldId: world, instanceId: "inst-a",
    hostUserId: "host-user", hostGeneration: 1, raceId: null,
    kind: "checkpoint_race", phase: "active", version: 3,
    createdAt: 100, startedAt: 110, completedAt: null,
    maxParticipants: 8, checkpointCount: 3,
    participants: [{
      userId: "participant-1", joinedAt: 105, lastActionAt: 110,
      checkpointIndex: 1, finishTime: null, status: "joined"
    }]
  };
  assert.ok(restoreActivitySession(base));
  assert.equal(restoreActivitySession({ ...base, startedAt: 90 }), null);
  assert.equal(restoreActivitySession({ ...base, phase: "lobby", startedAt: 110 }), null);
  assert.equal(restoreActivitySession({ ...base, phase: "completed", completedAt: null }), null);
  assert.equal(restoreActivitySession({
    ...base, participants: [{ ...base.participants[0], checkpointIndex: 4 }]
  }), null);
  assert.equal(restoreActivitySession({
    ...base, participants: [{ ...base.participants[0], status: "finished", finishTime: null }]
  }), null);
  assert.equal(restoreActivitySession({
    ...base, participants: [{ ...base.participants[0], status: "left", finishTime: 120 }]
  }), null);
  assert.equal(restoreActivitySession({ ...base, maxParticipants: 65 }), null);
  assert.equal(restoreActivitySession({ ...base, checkpointCount: 101 }), null);
});
