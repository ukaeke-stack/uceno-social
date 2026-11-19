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
  resultId: "42",
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
    "activity-result:42:earned-credits");
});

test("rejects client-originated, unfinished, malformed and zero-value reward claims", () => {
  assert.equal(calculateEarnedCreditGrant(rewardResult({ source: "client" }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ status: "dnf" }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ placement: 0 }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ resultId: "0" }), rewardRule).ok, false);
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

import { applyDailyMissionEvent, applyTreasureDiscovery } from "../dist/mission-treasure-policy.js";

const idA = "123e4567-e89b-42d3-a456-426614174010";
const idB = "123e4567-e89b-42d3-a456-426614174011";
const idC = "123e4567-e89b-42d3-a456-426614174012";
const idD = "123e4567-e89b-42d3-a456-426614174013";
const mission = { id: idA, eventKind: "checkpoint_finished", targetCount: 2,
  startsAt: 1_000, endsAt: 10_000 };
const missionProgress = () => ({ missionId: idA, userId: idB, count: 0,
  completedAt: null, processedEventIds: [] });
const missionEvent = (eventId, overrides = {}) => ({ source: "authoritative_gateway",
  eventId, missionId: idA, userId: idB, eventKind: "checkpoint_finished",
  occurredAt: 2_000, ...overrides });

test("daily mission progress is authoritative, windowed and replay-safe", () => {
  const first = applyDailyMissionEvent(mission, missionProgress(), missionEvent(idC));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.progress.count, 1);
  const replay = applyDailyMissionEvent(mission, first.progress, missionEvent(idC));
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.duplicate, true);
  const second = applyDailyMissionEvent(mission, first.progress, missionEvent(idD, { occurredAt: 3_000 }));
  assert.equal(second.ok, true);
  if (second.ok) {
    assert.equal(second.progress.count, 2);
    assert.equal(second.progress.completedAt, 3_000);
  }
});

test("daily missions reject client claims, wrong event kinds and out-of-window events", () => {
  assert.equal(applyDailyMissionEvent(mission, missionProgress(),
    missionEvent(idC, { source: "client" })).ok, false);
  assert.equal(applyDailyMissionEvent(mission, missionProgress(),
    missionEvent(idC, { eventKind: "dance_completed" })).ok, false);
  assert.equal(applyDailyMissionEvent(mission, missionProgress(),
    missionEvent(idC, { occurredAt: 10_000 })).ok, false);
});

const clues = [
  { id: idA, sequence: 0 },
  { id: idB, sequence: 1 },
  { id: idC, sequence: 2 }
];
const treasureProgress = () => ({ huntId: idD, userId: idA, nextSequence: 0,
  discoveredClueIds: [], completedAt: null });
const treasureDiscovery = (clueId, sequence, overrides = {}) => ({
  source: "authoritative_gateway", huntId: idD, userId: idA, clueId, sequence,
  discoveredAt: 2_000, ...overrides
});

test("treasure hunt enforces ordered clues and completes once the chain is solved", () => {
  const outOfOrder = applyTreasureDiscovery(clues, treasureProgress(), treasureDiscovery(idB, 1));
  assert.equal(outOfOrder.ok, false);
  const first = applyTreasureDiscovery(clues, treasureProgress(), treasureDiscovery(idA, 0));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = applyTreasureDiscovery(clues, first.progress, treasureDiscovery(idB, 1));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const final = applyTreasureDiscovery(clues, second.progress, treasureDiscovery(idC, 2));
  assert.equal(final.ok, true);
  if (final.ok) {
    assert.equal(final.completed, true);
    assert.equal(final.progress.completedAt, 2_000);
  }
});

test("treasure hunt rejects client discoveries and duplicate clue claims", () => {
  assert.equal(applyTreasureDiscovery(clues, treasureProgress(),
    treasureDiscovery(idA, 0, { source: "client" })).ok, false);
  const first = applyTreasureDiscovery(clues, treasureProgress(), treasureDiscovery(idA, 0));
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(applyTreasureDiscovery(clues, first.progress,
    treasureDiscovery(idA, 0)).ok, false);
});

import { readFileSync } from "node:fs";

test("daily mission, treasure and Earned Credits schema is durable and replay-safe", () => {
  const migration = readFileSync(new URL("../../../db/migrations/037_daily_missions_treasure_rewards.sql", import.meta.url), "utf8");
  for (const marker of [
    "virtual_world_daily_mission_templates",
    "virtual_world_daily_mission_instances",
    "virtual_world_daily_mission_progress",
    "virtual_world_daily_mission_events",
    "UNIQUE (mission_instance_id, user_id, activity_result_id)",
    "virtual_world_treasure_hunts",
    "virtual_world_treasure_clues",
    "virtual_world_treasure_progress",
    "virtual_world_treasure_discoveries",
    "UNIQUE (hunt_id, user_id, sequence)",
    "virtual_world_earned_credit_ledger",
    "idempotency_key TEXT NOT NULL UNIQUE",
    "earned_credit_ledger_is_append_only",
    "virtual_world_daily_mission_active_lookup_idx",
    "virtual_world_daily_mission_template_event_idx",
    "virtual_world_treasure_hunt_active_lookup_idx",
    "virtual_world_treasure_clue_location_lookup_idx"
  ]) assert.ok(migration.includes(marker), "migration missing " + marker);
  assert.match(migration, /REFERENCES virtual_world_activity_results\(id\)/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON virtual_world_earned_credit_ledger/);
  assert.match(migration, /CHECK \(ledger_type = 'earned'\)/);
  assert.match(migration, /CHECK \(currency = 'earned_credits'\)/);
  assert.doesNotMatch(migration, /INSERT INTO virtual_world_(daily_mission|treasure)/);
});

test("reward source identity matches the database BIGSERIAL activity result key", () => {
  assert.equal(calculateEarnedCreditGrant(rewardResult({ resultId: "42" }), rewardRule).ok, true);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ resultId: "0" }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ resultId: "1.5" }), rewardRule).ok, false);
  assert.equal(calculateEarnedCreditGrant(rewardResult({ resultId: "9223372036854775808" }), rewardRule).ok, false);
});

test("daily mission policy accepts verified sports completions", () => {
  const sportsMission = { ...mission, eventKind: "sports_completed", targetCount: 1 };
  const result = applyDailyMissionEvent(sportsMission, missionProgress(),
    missionEvent("123e4567-e89b-42d3-a456-426614174014", { eventKind: "sports_completed" }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.progress.completedAt, 2_000);
});

const HUNT = "123e4567-e89b-12d3-a456-426614174010";
const TREASURE_USER = "123e4567-e89b-12d3-a456-426614174011";
const CLUES = [
  { id: "123e4567-e89b-12d3-a456-426614174012", sequence: 0 },
  { id: "123e4567-e89b-12d3-a456-426614174013", sequence: 1 },
  { id: "123e4567-e89b-12d3-a456-426614174014", sequence: 2 }
];
function treasureProgress(overrides = {}) {
  return { huntId: HUNT, userId: TREASURE_USER, nextSequence: 0,
    discoveredClueIds: [], completedAt: null, ...overrides };
}
function treasureDiscovery(clue = CLUES[0], overrides = {}) {
  return { source: "authoritative_gateway", huntId: HUNT, userId: TREASURE_USER,
    clueId: clue.id, sequence: clue.sequence, discoveredAt: 2_000, ...overrides };
}

test("treasure discovery requires the next clue and rejects out-of-order attempts", () => {
  const rejected = applyTreasureDiscovery(CLUES, treasureProgress(),
    treasureDiscovery(CLUES[1]));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "treasure_clue_out_of_order");
  assert.equal(applyTreasureDiscovery(CLUES, treasureProgress(),
    treasureDiscovery(CLUES[0])).ok, true);
});

test("treasure discovery is idempotently rejected after a clue is already recorded", () => {
  const progress = treasureProgress({ nextSequence: 1, discoveredClueIds: [CLUES[0].id] });
  const duplicate = applyTreasureDiscovery(CLUES, progress, treasureDiscovery(CLUES[0]));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "treasure_clue_already_discovered");
});

test("treasure completion occurs only after the final ordered clue", () => {
  const progress = treasureProgress({ nextSequence: 2,
    discoveredClueIds: [CLUES[0].id, CLUES[1].id] });
  const result = applyTreasureDiscovery(CLUES, progress, treasureDiscovery(CLUES[2]));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.completed, true);
    assert.equal(result.progress.nextSequence, 3);
    assert.equal(result.progress.completedAt, 2_000);
  }
});

test("treasure discovery rejects malformed chains and unauthoritative sources", () => {
  const gap = [CLUES[0], { ...CLUES[2], sequence: 2 }];
  assert.equal(applyTreasureDiscovery(gap, treasureProgress(), treasureDiscovery()).ok, false);
  assert.equal(applyTreasureDiscovery(CLUES, treasureProgress(),
    treasureDiscovery(CLUES[0], { source: "client" })).ok, false);
});
