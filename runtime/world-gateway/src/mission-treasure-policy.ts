/**
 * Daily mission and treasure-chain domain rules.
 * Inputs must be loaded/verified by the authoritative gateway, never accepted
 * as raw client progress. Durable storage, scheduling and reward issuance are
 * separate integration steps.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSION_EVENT_KINDS = new Set([
  "checkpoint_finished", "dance_completed", "sports_completed", "adventure_objective"
]);

export interface DailyMission {
  id: string;
  eventKind: "checkpoint_finished" | "dance_completed" | "sports_completed" | "adventure_objective";
  targetCount: number;
  startsAt: number;
  endsAt: number;
}
export interface MissionEvent {
  source: "authoritative_gateway";
  eventId: string;
  missionId: string;
  userId: string;
  eventKind: DailyMission["eventKind"];
  occurredAt: number;
}
export interface MissionProgress {
  missionId: string;
  userId: string;
  count: number;
  completedAt: number | null;
  processedEventIds: string[];
}
export function applyDailyMissionEvent(mission: DailyMission, progress: MissionProgress,
  event: MissionEvent): { ok: true; progress: MissionProgress; duplicate: boolean } | { ok: false; code: string } {
  if (!mission || !progress || !event || event.source !== "authoritative_gateway")
    return { ok: false, code: "unverified_mission_event" };
  if (![mission.id, progress.missionId, progress.userId, event.eventId, event.missionId, event.userId]
      .every(value => typeof value === "string" && UUID.test(value)))
    return { ok: false, code: "invalid_mission_identity" };
  if (mission.id !== progress.missionId || event.missionId !== mission.id || event.userId !== progress.userId)
    return { ok: false, code: "mission_subject_mismatch" };
  if (!MISSION_EVENT_KINDS.has(mission.eventKind) || !MISSION_EVENT_KINDS.has(event.eventKind))
    return { ok: false, code: "unsupported_mission_event_kind" };
  if (!Number.isInteger(mission.targetCount) || mission.targetCount < 1 || mission.targetCount > 10000 ||
      !Number.isFinite(mission.startsAt) || !Number.isFinite(mission.endsAt) || mission.endsAt <= mission.startsAt)
    return { ok: false, code: "invalid_mission_schedule" };
  if (!Number.isInteger(progress.count) || progress.count < 0 || progress.count > mission.targetCount ||
      !Array.isArray(progress.processedEventIds) || progress.processedEventIds.length > 10000 ||
      progress.count !== progress.processedEventIds.length ||
      !progress.processedEventIds.every(id => typeof id === "string" && UUID.test(id)) ||
      new Set(progress.processedEventIds).size !== progress.processedEventIds.length)
    return { ok: false, code: "invalid_mission_progress" };
  if (progress.processedEventIds.includes(event.eventId))
    return { ok: true, progress, duplicate: true };
  if (progress.completedAt !== null || progress.count >= mission.targetCount)
    return { ok: false, code: "mission_already_completed" };
  if (event.eventKind !== mission.eventKind) return { ok: false, code: "mission_event_kind_mismatch" };
  if (!Number.isFinite(event.occurredAt) || event.occurredAt < mission.startsAt || event.occurredAt >= mission.endsAt)
    return { ok: false, code: "event_outside_mission_window" };

  const count = progress.count + 1;
  const next = {
    ...progress,
    count,
    completedAt: count === mission.targetCount ? event.occurredAt : null,
    processedEventIds: [...progress.processedEventIds, event.eventId]
  };
  return { ok: true, progress: next, duplicate: false };
}

export interface TreasureClue {
  id: string;
  sequence: number;
}
export interface TreasureDiscovery {
  source: "authoritative_gateway";
  huntId: string;
  userId: string;
  clueId: string;
  sequence: number;
  discoveredAt: number;
}
export interface TreasureProgress {
  huntId: string;
  userId: string;
  nextSequence: number;
  discoveredClueIds: string[];
  completedAt: number | null;
}
export function applyTreasureDiscovery(clues: readonly TreasureClue[], progress: TreasureProgress,
  discovery: TreasureDiscovery): { ok: true; progress: TreasureProgress; completed: boolean } | { ok: false; code: string } {
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery) ||
      discovery.source !== "authoritative_gateway")
    return { ok: false, code: "unverified_treasure_discovery" };
  if (!progress || typeof progress !== "object" || Array.isArray(progress))
    return { ok: false, code: "invalid_treasure_progress" };
  if (![progress.huntId, progress.userId, discovery.huntId, discovery.userId, discovery.clueId]
      .every(value => typeof value === "string" && UUID.test(value)) ||
      progress.huntId !== discovery.huntId || progress.userId !== discovery.userId)
    return { ok: false, code: "invalid_treasure_identity" };
  if (!Array.isArray(clues) || clues.length < 2 || clues.length > 100 ||
      clues.some((clue, index) => !clue || !UUID.test(clue.id) || clue.sequence !== index) ||
      new Set(clues.map(clue => clue.id)).size !== clues.length)
    return { ok: false, code: "invalid_treasure_clue_chain" };
  if (!Number.isInteger(progress.nextSequence) || progress.nextSequence < 0 ||
      progress.nextSequence > clues.length || !Array.isArray(progress.discoveredClueIds) ||
      progress.discoveredClueIds.length !== progress.nextSequence ||
      progress.discoveredClueIds.some((id, index) => id !== clues[index]?.id) ||
      (progress.completedAt !== null && (!Number.isFinite(progress.completedAt) || progress.completedAt <= 0)))
    return { ok: false, code: "invalid_treasure_progress" };
  if (progress.completedAt !== null) return { ok: false, code: "treasure_hunt_completed" };
  if (!Number.isFinite(discovery.discoveredAt) || discovery.discoveredAt <= 0)
    return { ok: false, code: "invalid_discovery_timestamp" };
  if (progress.discoveredClueIds.includes(discovery.clueId))
    return { ok: false, code: "treasure_clue_already_discovered" };
  const expected = clues[progress.nextSequence];
  if (!expected || expected.id !== discovery.clueId || expected.sequence !== discovery.sequence)
    return { ok: false, code: "treasure_clue_out_of_order" };

  const discoveredClueIds = [...progress.discoveredClueIds, discovery.clueId];
  const completed = discoveredClueIds.length === clues.length;
  return {
    ok: true,
    completed,
    progress: {
      ...progress,
      nextSequence: progress.nextSequence + 1,
      discoveredClueIds,
      completedAt: completed ? discovery.discoveredAt : null
    }
  };
}
