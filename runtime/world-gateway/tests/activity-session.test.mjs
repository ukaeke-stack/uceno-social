import test from "node:test";
import assert from "node:assert/strict";
import {
  createActivitySession, joinActivity, startActivity, recordCheckpoint,
  leaveActivity, cancelActivity, selectNextActivityHost
} from "../dist/activity-session.js";

const WORLD = "123e4567-e89b-12d3-a456-426614174000";
function race(now = 1_000) {
  const created = createActivitySession({
    id: "race-test-001", worldId: WORLD, instanceId: "instance-test",
    kind: "checkpoint_race", checkpointCount: 2, now
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error(created.code);
  return created.session;
}
function joinTwo(session, now = 1_100) {
  assert.equal(joinActivity(session, "user-a", now).ok, true);
  assert.equal(joinActivity(session, "user-b", now + 1).ok, true);
}

test("rejects invalid session identifiers and checkpoint counts", () => {
  assert.equal(createActivitySession({
    id: "x", worldId: WORLD, instanceId: "i", kind: "checkpoint_race"
  }).ok, false);
  assert.equal(createActivitySession({
    id: "race-test-001", worldId: WORLD, instanceId: "i",
    kind: "checkpoint_race", checkpointCount: 101
  }).ok, false);
});

test("join is idempotent and session requires two participants to start", () => {
  const session = race();
  assert.equal(startActivity(session, true, 1_050).ok, false);
  assert.equal(joinActivity(session, "user-a", 1_100).ok, true);
  const version = session.version;
  assert.equal(joinActivity(session, "user-a", 1_101).ok, true);
  assert.equal(session.version, version);
  assert.equal(joinActivity(session, "user-b", 1_102).ok, true);
  assert.equal(startActivity(session, true, 1_200).ok, true);
  assert.equal(session.phase, "active");
});

test("rejects unauthorized host and out-of-order checkpoint claims", () => {
  const session = race();
  joinTwo(session);
  assert.equal(startActivity(session, false, 1_200).ok, false);
  assert.equal(startActivity(session, true, 1_200).ok, true);
  assert.equal(recordCheckpoint(session, "user-a", 1, 1_300).ok, false);
  assert.equal(recordCheckpoint(session, "unknown-user", 0, 1_301).ok, false);
  assert.equal(recordCheckpoint(session, "user-a", 0, 1_400).ok, true);
});

test("race completes only after all active participants finish", () => {
  const session = race();
  joinTwo(session);
  assert.equal(startActivity(session, true, 1_200).ok, true);
  assert.equal(recordCheckpoint(session, "user-a", 0, 1_300).ok, true);
  assert.equal(recordCheckpoint(session, "user-a", 1, 1_400).ok, true);
  assert.equal(session.phase, "active");
  assert.equal(recordCheckpoint(session, "user-b", 0, 1_500).ok, true);
  assert.equal(recordCheckpoint(session, "user-b", 1, 1_600).ok, true);
  assert.equal(session.phase, "completed");
  assert.equal(session.completedAt, 1_600);
  assert.equal(recordCheckpoint(session, "user-a", 1, 1_700).ok, false);
});

test("disconnect during an active race marks DNF and can close the session", () => {
  const session = race();
  joinTwo(session);
  assert.equal(startActivity(session, true, 1_200).ok, true);
  assert.equal(leaveActivity(session, "user-a", 1_300).ok, true);
  assert.equal(session.participants.get("user-a")?.status, "dnf");
  assert.equal(leaveActivity(session, "user-b", 1_301).ok, true);
  assert.equal(session.phase, "completed");
});

test("only an authorized host can cancel a non-terminal session", () => {
  const session = race();
  assert.equal(cancelActivity(session, false, 1_100).ok, false);
  assert.equal(cancelActivity(session, true, 1_100).ok, true);
  assert.equal(session.phase, "cancelled");
  assert.equal(cancelActivity(session, true, 1_200).ok, false);
});


test("host departure transfers ownership to the earliest remaining active participant", () => {
  const session = race();
  assert.equal(joinActivity(session, "host-user", 1_100).ok, true);
  assert.equal(joinActivity(session, "later-user", 1_200).ok, true);
  assert.equal(joinActivity(session, "earlier-user", 1_150).ok, true);
  assert.equal(leaveActivity(session, "host-user", 1_300).ok, true);
  assert.equal(selectNextActivityHost(session, "host-user"), "earlier-user");
});

test("host departure returns no replacement when no active participant remains", () => {
  const session = race();
  assert.equal(joinActivity(session, "host-user", 1_100).ok, true);
  assert.equal(leaveActivity(session, "host-user", 1_200).ok, true);
  assert.equal(selectNextActivityHost(session, "host-user"), null);
});

import { calculateEarnedCreditGrant } from "../dist/activity-reward-policy.js";

const rewardResult = (overrides = {}) => ({
  source: "authoritative_gateway",
  resultId: "123e4567-e89b-42d3-a456-426614174001",
  sessionId: "123e4567-e89b-42d3-a456-426614174002",
  userId: "123e4567-e89b-42d3-a456-426614174003",
  activityKind: "checkpoint_race",
  status: "finished",
  placement: 1,
  recordedAt: 1_700_000_000_000,
  ...overrides
});
const rewardRule = {
  baseCredits: 10,
  placementBonus: { 1: 5, 2: 3, 3: 1 },
  maximumCreditsPerResult: 12
};

test("earned credit reward is derived only from an authoritative completed result and is capped", () => {
  const result = calculateEarnedCreditGrant(rewardResult(), rewardRule);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.grant.amount, 12);
  assert.equal(result.grant.currency, "earned_credits");
  assert.equal(result.grant.ledgerType, "earned");
  assert.equal(result.grant.idempotencyKey,
    "activity-result:123e4567-e89b-42d3-a456-426614174001:earned-credits");
});

test("rejects client-originated, unfinished, malformed and zero-value reward claims", () => {
  assert.equal(calculateEarnedCreditGrant(rewardResult({ source: "client" }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ status: "dnf" }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ placement: 0 }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ userId: "not-a-uuid" }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult(), {
    ...rewardRule, baseCredits: 0, placementBonus: {}, maximumCreditsPerResult: 0
  }).ok, false);
});

test("reward policy cannot create Purchased Credits or cash payouts", () => {
  const result = calculateEarnedCreditGrant(rewardResult({ placement: 2 }), rewardRule);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(Object.keys(result.grant).sort(),
    ["amount", "currency", "idempotencyKey", "ledgerType", "sessionId", "sourceResultId", "userId"].sort());
  assert.equal(result.grant.currency, "earned_credits");
});
