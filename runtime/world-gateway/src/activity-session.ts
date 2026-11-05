/**
 * UCENO activity-session domain model.
 *
 * This module intentionally has no database or transport dependency. The gateway
 * can use it to validate activity transitions; durable storage and WebSocket
 * integration must be implemented and tested before activities are advertised
 * as production-ready.
 */
export type ActivityPhase = "lobby" | "active" | "completed" | "cancelled";
export type ActivityKind = "checkpoint_race" | "dance" | "sports" | "adventure";

export interface ActivityParticipant {
  userId: string;
  joinedAt: number;
  lastActionAt: number;
  checkpointIndex: number;
  finishTime: number | null;
  status: "joined" | "finished" | "dnf" | "left";
}

export interface ActivitySession {
  id: string;
  worldId: string;
  instanceId: string;
  kind: ActivityKind;
  phase: ActivityPhase;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  version: number;
  maxParticipants: number;
  participants: Map<string, ActivityParticipant>;
  checkpointCount: number;
}

export type ActivityResult =
  | { ok: true; session: ActivitySession }
  | { ok: false; code: string };

const MAX_PARTICIPANTS = 64;
const MIN_CHECKPOINTS = 2;
const MAX_CHECKPOINTS = 100;
const ACTION_COOLDOWN_MS = 100;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const WORLD_ID_PATTERN = /^[0-9a-f-]{36}$/i;

export function createActivitySession(input: {
  id: string;
  worldId: string;
  instanceId: string;
  kind: ActivityKind;
  now?: number;
  maxParticipants?: number;
  checkpointCount?: number;
}): ActivityResult {
  const now = input.now ?? Date.now();
  const maxParticipants = input.maxParticipants ?? MAX_PARTICIPANTS;
  const checkpointCount = input.checkpointCount ?? MIN_CHECKPOINTS;

  if (!SESSION_ID_PATTERN.test(input.id)) return { ok: false, code: "invalid_session_id" };
  if (!WORLD_ID_PATTERN.test(input.worldId)) return { ok: false, code: "invalid_world_id" };
  if (!input.instanceId || input.instanceId.length > 128) return { ok: false, code: "invalid_instance_id" };
  if (!["checkpoint_race", "dance", "sports", "adventure"].includes(input.kind))
    return { ok: false, code: "invalid_activity_kind" };
  if (!Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > MAX_PARTICIPANTS)
    return { ok: false, code: "invalid_capacity" };
  if (!Number.isInteger(checkpointCount) || checkpointCount < MIN_CHECKPOINTS || checkpointCount > MAX_CHECKPOINTS)
    return { ok: false, code: "invalid_checkpoint_count" };
  if (!Number.isFinite(now)) return { ok: false, code: "invalid_timestamp" };

  return {
    ok: true,
    session: {
      id: input.id, worldId: input.worldId, instanceId: input.instanceId,
      kind: input.kind, phase: "lobby", createdAt: now, startedAt: null,
      completedAt: null, version: 1, maxParticipants, participants: new Map(),
      checkpointCount
    }
  };
}

export function joinActivity(session: ActivitySession, userId: string, now = Date.now()): ActivityResult {
  if (!userId || userId.length > 128) return { ok: false, code: "invalid_user_id" };
  if (!Number.isFinite(now)) return { ok: false, code: "invalid_timestamp" };
  const existing = session.participants.get(userId);
  if (existing && existing.status !== "left" && existing.status !== "dnf")
    return { ok: true, session }; // idempotent join
  if (session.phase !== "lobby") return { ok: false, code: "session_not_accepting_participants" };
  const activeCount = [...session.participants.values()].filter(p => p.status !== "left" && p.status !== "dnf").length;
  if (activeCount >= session.maxParticipants) return { ok: false, code: "session_full" };

  session.participants.set(userId, {
    userId, joinedAt: now, lastActionAt: 0, checkpointIndex: 0,
    finishTime: null, status: "joined"
  });
  session.version++;
  return { ok: true, session };
}

export function startActivity(session: ActivitySession, actorIsAuthorizedHost: boolean, now = Date.now()): ActivityResult {
  if (!actorIsAuthorizedHost) return { ok: false, code: "host_required" };
  if (session.phase !== "lobby") return { ok: false, code: "invalid_phase_transition" };
  const participants = [...session.participants.values()].filter(p => p.status === "joined");
  if (participants.length < 2) return { ok: false, code: "not_enough_participants" };
  if (!Number.isFinite(now) || now < session.createdAt) return { ok: false, code: "invalid_timestamp" };

  session.phase = "active";
  session.startedAt = now;
  session.version++;
  return { ok: true, session };
}

/**
 * Accepts only the next sequential checkpoint. The caller must separately
 * verify server-side proximity to the authored checkpoint volume.
 */
export function recordCheckpoint(session: ActivitySession, userId: string, checkpointIndex: number, now = Date.now()): ActivityResult {
  if (session.kind !== "checkpoint_race") return { ok: false, code: "wrong_activity_kind" };
  if (session.phase !== "active" || session.startedAt === null) return { ok: false, code: "session_not_active" };
  if (!Number.isInteger(checkpointIndex) || checkpointIndex < 0 || checkpointIndex >= session.checkpointCount)
    return { ok: false, code: "invalid_checkpoint" };
  const participant = session.participants.get(userId);
  if (!participant || participant.status !== "joined") return { ok: false, code: "participant_not_active" };
  if (!Number.isFinite(now) || now < session.startedAt) return { ok: false, code: "invalid_timestamp" };
  if (now - participant.lastActionAt < ACTION_COOLDOWN_MS) return { ok: false, code: "action_rate_limited" };
  if (checkpointIndex !== participant.checkpointIndex) return { ok: false, code: "checkpoint_out_of_order" };

  participant.lastActionAt = now;
  participant.checkpointIndex++;
  session.version++;
  if (participant.checkpointIndex === session.checkpointCount) {
    participant.status = "finished";
    participant.finishTime = now;
    if ([...session.participants.values()].every(p => p.status !== "joined")) {
      session.phase = "completed";
      session.completedAt = now;
    }
  }
  return { ok: true, session };
}

export function leaveActivity(session: ActivitySession, userId: string, now = Date.now()): ActivityResult {
  const participant = session.participants.get(userId);
  if (!participant || participant.status === "left") return { ok: true, session };
  if (participant.status === "finished") return { ok: false, code: "participant_already_finished" };
  if (!Number.isFinite(now)) return { ok: false, code: "invalid_timestamp" };
  participant.status = session.phase === "active" ? "dnf" : "left";
  participant.lastActionAt = now;
  session.version++;
  if (session.phase === "active" &&
      [...session.participants.values()].every(p => p.status !== "joined")) {
    session.phase = "completed";
    session.completedAt = now;
  }
  return { ok: true, session };
}

export function cancelActivity(session: ActivitySession, actorIsAuthorizedHost: boolean, now = Date.now()): ActivityResult {
  if (!actorIsAuthorizedHost) return { ok: false, code: "host_required" };
  if (session.phase === "completed" || session.phase === "cancelled")
    return { ok: false, code: "session_already_terminal" };
  if (!Number.isFinite(now)) return { ok: false, code: "invalid_timestamp" };
  session.phase = "cancelled";
  session.completedAt = now;
  session.version++;
  return { ok: true, session };
}

/** Selects a deterministic replacement host after the current host leaves. */
export function selectNextActivityHost(session: ActivitySession, departingHostId: string): string | null {
  const candidates = [...session.participants.values()]
    .filter(participant => participant.userId !== departingHostId && participant.status === "joined")
    .sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
  return candidates[0]?.userId ?? null;
}
