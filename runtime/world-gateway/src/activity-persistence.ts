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
  if (typeof v.id !== "string" || typeof v.worldId !== "string" || typeof v.instanceId !== "string" ||
      typeof v.hostUserId !== "string" || !Number.isSafeInteger(v.hostGeneration) || (v.hostGeneration ?? 0) < 1 ||
      (v.raceId !== null && typeof v.raceId !== "string") || !kinds.includes(v.kind as ActivityKind) ||
      !phases.includes(v.phase as ActivityPhase) || !Number.isSafeInteger(v.version) || (v.version ?? 0) < 1 ||
      !Number.isFinite(v.createdAt) || !Number.isInteger(v.maxParticipants) ||
      !Number.isInteger(v.checkpointCount) || !Array.isArray(v.participants) ||
      v.participants.length > 64) return null;
  const participants = new Map<string, ActivityParticipant>();
  for (const p of v.participants) {
    if (!p || typeof p.userId !== "string" || !Number.isFinite(p.joinedAt) ||
        !Number.isFinite(p.lastActionAt) || !Number.isInteger(p.checkpointIndex) ||
        !(p.finishTime === null || Number.isFinite(p.finishTime)) ||
        !["joined", "finished", "dnf", "left"].includes(p.status) || participants.has(p.userId)) return null;
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
