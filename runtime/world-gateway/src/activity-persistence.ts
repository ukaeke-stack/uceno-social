import type { ActivitySession, ActivityParticipant, ActivityKind, ActivityPhase } from "./activity-session.js";

export interface PersistedActivitySession {
  id: string; worldId: string; instanceId: string; hostUserId: string;
  hostGeneration: number; raceId: string | null; kind: ActivityKind;
  phase: ActivityPhase; version: number; createdAt: number; startedAt: number | null;
  completedAt: number | null; maxParticipants: number; checkpointCount: number;
  participants: Array<ActivityParticipant>;
}

export function serializeActivitySession(session: ActivitySession, hostUserId: string,
  hostGeneration: number, raceId: string | null): PersistedActivitySession {
  return {
    id: session.id, worldId: session.worldId, instanceId: session.instanceId,
    hostUserId, hostGeneration, raceId, kind: session.kind, phase: session.phase,
    version: session.version, createdAt: session.createdAt, startedAt: session.startedAt,
    completedAt: session.completedAt, maxParticipants: session.maxParticipants,
    checkpointCount: session.checkpointCount,
    participants: [...session.participants.values()].map(p => ({ ...p }))
  };
}

export function restoreActivitySession(value: unknown): { session: ActivitySession; hostUserId: string;
  hostGeneration: number; raceId: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<PersistedActivitySession>;
  const kinds: ActivityKind[] = ["checkpoint_race", "dance", "sports", "adventure"];
  const phases: ActivityPhase[] = ["lobby", "active", "completed", "cancelled"];
  if (typeof v.id !== "string" || !v.id || v.id.length > 128 ||
      typeof v.worldId !== "string" || !/^[0-9a-f-]{36}$/i.test(v.worldId) ||
      typeof v.instanceId !== "string" || !v.instanceId || v.instanceId.length > 128 ||
      typeof v.hostUserId !== "string" || !v.hostUserId || v.hostUserId.length > 128 ||
      !Number.isSafeInteger(v.hostGeneration) || (v.hostGeneration ?? 0) < 1 ||
      !(v.raceId === null || (typeof v.raceId === "string" && v.raceId.length <= 128)) ||
      !kinds.includes(v.kind as ActivityKind) || !phases.includes(v.phase as ActivityPhase) ||
      !Number.isSafeInteger(v.version) || (v.version ?? 0) < 1 ||
      !Number.isFinite(v.createdAt) || (v.createdAt ?? -1) < 0 ||
      !(v.startedAt === null || (Number.isFinite(v.startedAt) && v.startedAt >= v.createdAt)) ||
      !(v.completedAt === null || (Number.isFinite(v.completedAt) && v.completedAt >= v.createdAt)) ||
      !Number.isInteger(v.maxParticipants) || (v.maxParticipants ?? 0) < 2 ||
      (v.maxParticipants ?? 65) > 64 || !Number.isInteger(v.checkpointCount) ||
      (v.checkpointCount ?? 0) < 2 || (v.checkpointCount ?? 101) > 100 ||
      !Array.isArray(v.participants) || v.participants.length > v.maxParticipants!) return null;
  if (v.phase === "lobby" && (v.startedAt !== null || v.completedAt !== null)) return null;
  if (v.phase === "active" && (v.startedAt === null || v.completedAt !== null)) return null;
  if ((v.phase === "completed" || v.phase === "cancelled") && v.completedAt === null) return null;
  const participants = new Map<string, ActivityParticipant>();
  for (const p of v.participants) {
    if (!p || typeof p.userId !== "string" || !p.userId || p.userId.length > 128 ||
        !Number.isFinite(p.joinedAt) || p.joinedAt < v.createdAt! ||
        !Number.isFinite(p.lastActionAt) || p.lastActionAt < 0 ||
        !Number.isInteger(p.checkpointIndex) || p.checkpointIndex < 0 ||
        p.checkpointIndex > v.checkpointCount! ||
        !(p.finishTime === null || (Number.isFinite(p.finishTime) && p.finishTime >= v.startedAt!)) ||
        !["joined", "finished", "dnf", "left"].includes(p.status) ||
        (p.status === "finished" && p.finishTime === null) ||
        (p.status !== "finished" && p.finishTime !== null) ||
        participants.has(p.userId)) return null;
    participants.set(p.userId, { ...p });
  }
  return { session: { id: v.id, worldId: v.worldId, instanceId: v.instanceId,
    kind: v.kind as ActivityKind, phase: v.phase as ActivityPhase, createdAt: v.createdAt!,
    startedAt: v.startedAt ?? null, completedAt: v.completedAt ?? null,
    version: v.version!, maxParticipants: v.maxParticipants!, checkpointCount: v.checkpointCount!,
    participants }, hostUserId: v.hostUserId, hostGeneration: v.hostGeneration!,
    raceId: v.raceId ?? null };
}

export function shouldApplyPersistedActivityVersion(currentVersion: number, incomingVersion: number): boolean {
  return Number.isSafeInteger(incomingVersion) && incomingVersion > currentVersion;
}
