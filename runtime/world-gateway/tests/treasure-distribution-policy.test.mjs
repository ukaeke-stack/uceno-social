import test from "node:test";
import assert from "node:assert/strict";
import { selectPersonalTreasureRoute, validateTreasureRewardPlan } from "../dist/treasure-distribution-policy.js";

const hunt = "123e4567-e89b-42d3-a456-426614174010";
const userA = "123e4567-e89b-42d3-a456-426614174011";
const userB = "123e4567-e89b-42d3-a456-426614174012";
const secret = "test-only-secret-that-is-at-least-32-characters";
const candidates = Array.from({ length: 12 }, (_, i) => ({
  id: `123e4567-e89b-42d3-a456-4266141740${String(20+i).padStart(2,"0")}`,
  sequence: Math.floor(i / 3), cityId: "solsticebay", districtId: "central",
  interactableId: `asset-${i}`
}));

test("personal routes are stable for retries and contain one authored point per step", () => {
  const a = selectPersonalTreasureRoute(hunt, userA, candidates, 4, secret);
  assert.deepEqual(selectPersonalTreasureRoute(hunt, userA, candidates, 4, secret), a);
  assert.deepEqual(a.map(x => x.sequence), [0,1,2,3]);
  assert.equal(new Set(a.map(x => x.spawnPointId)).size, 4);
});

test("different users receive independently keyed routes", () => {
  const a = selectPersonalTreasureRoute(hunt, userA, candidates, 4, secret);
  const b = selectPersonalTreasureRoute(hunt, userB, candidates, 4, secret);
  assert.notDeepEqual(a, b);
});

test("route selection rejects missing sequence pools and weak secrets", () => {
  assert.throws(() => selectPersonalTreasureRoute(hunt, userA, candidates.slice(0, 9), 4, secret),
    /treasure_spawn_sequence_unavailable/);
  assert.throws(() => selectPersonalTreasureRoute(hunt, userA, candidates, 4, "short"),
    /treasure_assignment_secret_too_short/);
});

test("assignment secrets are measured by UTF-8 bytes and reject non-strings", () => {
  assert.throws(() => selectPersonalTreasureRoute(hunt, userA, candidates, 4, "a".repeat(31)),
    /treasure_assignment_secret_too_short/);
  assert.equal(selectPersonalTreasureRoute(hunt, userA, candidates, 4, "é".repeat(16)).length, 4);
  assert.throws(() => selectPersonalTreasureRoute(hunt, userA, candidates, 4, null),
    /treasure_assignment_secret_too_short/);
});

test("global reward plans require a finite winner cap", () => {
  assert.equal(validateTreasureRewardPlan({mode:"global",rewardEarnedCredits:5n,maxGlobalWinners:null,maxRewardClaims:null}), false);
  assert.equal(validateTreasureRewardPlan({mode:"global",rewardEarnedCredits:5n,maxGlobalWinners:100,maxRewardClaims:null}), true);
  assert.equal(validateTreasureRewardPlan({mode:"personal",rewardEarnedCredits:5n,maxGlobalWinners:null,maxRewardClaims:null}), true);
});

test("player-facing clue payload strips coordinates and internal spawn identifiers", async () => {
  const { sanitizeTreasureCluePayload } = await import("../dist/treasure-distribution-policy.js");
  assert.deepEqual(sanitizeTreasureCluePayload({
    title: "Old fountain", hint: "Look near the water", difficulty: 2,
    position_x: 100, position_y: 4, position_z: 20,
    interactable_id: "secret-object", spawnPointId: "private-id"
  }), { title: "Old fountain", hint: "Look near the water", difficulty: 2 });
});

test("a private route never repeats an interactable when alternatives exist", () => {
  const repeatedInteractableCandidates = Array.from({ length: 8 }, (_, i) => ({
    id: `223e4567-e89b-42d3-a456-4266141740${String(i + 20).padStart(2,"0")}`,
    sequence: Math.floor(i / 2), cityId: "solsticebay", districtId: "central",
    interactableId: i % 2 === 0 ? "shared-object" : `unique-object-${Math.floor(i / 2)}`
  }));
  const route = selectPersonalTreasureRoute(hunt, userA, repeatedInteractableCandidates, 4, secret);
  assert.equal(new Set(route.map(item => item.sequence)).size, 4);
  const selectedIds = route.map(item => repeatedInteractableCandidates.find(
    candidate => candidate.id === item.spawnPointId
  ).interactableId);
  assert.equal(new Set(selectedIds).size, 4);
});

test("personal routes reject repeated in-world interactables across clue steps", () => {
  assert.throws(() => selectPersonalTreasureRoute(hunt, userA, [
    { id: "223e4567-e89b-42d3-a456-426614174031", sequence: 0, cityId: "solstice", districtId: "central", interactableId: "same-object" },
    { id: "223e4567-e89b-42d3-a456-426614174032", sequence: 1, cityId: "solstice", districtId: "central", interactableId: "same-object" }
  ], 2, secret), /treasure_route_repeats_interactable/);
});
