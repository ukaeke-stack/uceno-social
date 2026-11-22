import test from "node:test";
import assert from "node:assert/strict";
import { applyDailyMissionEvent, applyTreasureDiscovery } from "../dist/mission-treasure-policy.js";

const a = "123e4567-e89b-42d3-a456-426614174010";
const b = "123e4567-e89b-42d3-a456-426614174011";
const c = "123e4567-e89b-42d3-a456-426614174012";
const d = "123e4567-e89b-42d3-a456-426614174013";
const mission = { id: a, eventKind: "checkpoint_finished", targetCount: 2, startsAt: 1000, endsAt: 9000 };
const event = (id, overrides = {}) => ({ source: "authoritative_gateway", eventId: id,
  missionId: a, userId: b, eventKind: "checkpoint_finished", occurredAt: 2000, ...overrides });
const progress = (overrides = {}) => ({ missionId: a, userId: b, count: 0,
  completedAt: null, processedEventIds: [], ...overrides });

test("mission rejects unsupported event kinds even when mission and event match", () => {
  assert.deepEqual(applyDailyMissionEvent({ ...mission, eventKind: "arbitrary" }, progress(),
    event(c, { eventKind: "arbitrary" })), { ok: false, code: "unsupported_mission_event_kind" });
});

test("mission rejects corrupt replay history rather than incrementing from it", () => {
  assert.equal(applyDailyMissionEvent(mission, progress({ count: 1, processedEventIds: [c, c] }), event(d)).ok, false);
  assert.equal(applyDailyMissionEvent(mission, progress({ count: 1, processedEventIds: ["not-a-uuid"] }), event(d)).ok, false);
  assert.equal(applyDailyMissionEvent(mission, progress({ count: 1, processedEventIds: [c] }), event(c)).ok, true);
});

const clues = [{ id: a, sequence: 0 }, { id: b, sequence: 1 }, { id: c, sequence: 2 }];
const huntProgress = (overrides = {}) => ({ huntId: d, userId: a, nextSequence: 0,
  discoveredClueIds: [], completedAt: null, ...overrides });
const discovery = (clueId, sequence) => ({ source: "authoritative_gateway",
  huntId: d, userId: a, clueId, sequence, discoveredAt: 2000 });

test("treasure discovery rejects null, primitive and array progress without throwing", () => {
  for (const malformed of [null, undefined, "progress", 7, []]) {
    assert.deepEqual(applyTreasureDiscovery(clues, malformed, discovery(a, 0)),
      { ok: false, code: "invalid_treasure_progress" });
  }
});

test("treasure discovery rejects non-object discovery payloads without throwing", () => {
  for (const malformed of [null, undefined, "discovery", 7, []]) {
    assert.deepEqual(applyTreasureDiscovery(clues, huntProgress(), malformed),
      { ok: false, code: "unverified_treasure_discovery" });
  }
});

test("treasure chain rejects duplicate clue identities", () => {
  const duplicateIds = [{ id: a, sequence: 0 }, { id: a, sequence: 1 }];
  assert.equal(applyTreasureDiscovery(duplicateIds, huntProgress(), discovery(a, 0)).ok, false);
});

test("treasure progress rejects malformed completion timestamps", () => {
  for (const completedAt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "completed"]) {
    assert.deepEqual(applyTreasureDiscovery(clues, huntProgress({ completedAt }), discovery(a, 0)),
      { ok: false, code: "invalid_treasure_progress" });
  }
});

test("treasure progress must be the exact ordered prefix of the configured clue chain", () => {
  assert.deepEqual(applyTreasureDiscovery(clues, huntProgress({
    nextSequence: 1, discoveredClueIds: [b]
  }), discovery(b, 1)), { ok: false, code: "invalid_treasure_progress" });
});

test("valid ordered treasure progress continues and completes", () => {
  const first = applyTreasureDiscovery(clues, huntProgress(), discovery(a, 0));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = applyTreasureDiscovery(clues, first.progress, discovery(b, 1));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const third = applyTreasureDiscovery(clues, second.progress, discovery(c, 2));
  assert.equal(third.ok, true);
  if (third.ok) assert.equal(third.completed, true);
});
