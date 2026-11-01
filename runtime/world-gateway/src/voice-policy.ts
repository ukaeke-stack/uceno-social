export type VoicePeerScope = { worldId: string; homeId: string | null; eventId: string | null; x: number; y: number; z: number };

export function sameSpatialVoiceRoom(a: VoicePeerScope, b: VoicePeerScope): boolean {
  return a.worldId === b.worldId && a.homeId === b.homeId && a.eventId === b.eventId;
}

export function isWithinVoiceRange(a: VoicePeerScope, b: VoicePeerScope, maxDistance = 24): boolean {
  if (![a.x, a.y, a.z, b.x, b.y, b.z, maxDistance].every(Number.isFinite) || maxDistance <= 0) return false;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= maxDistance;
}

export function isValidVoiceSignal(kind: unknown, sdp: unknown, candidate: unknown): boolean {
  if (kind === "offer" || kind === "answer") return typeof sdp === "string" && sdp.length > 0 && sdp.length <= 12000;
  if (kind === "candidate") return typeof candidate === "string" && candidate.length > 0 && candidate.length <= 2048;
  return false;
}