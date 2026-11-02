export type PendingDistrictTransition = {
  id: string;
  contentLabel: string;
  nonce: string;
  createdAt: number;
};

export const DISTRICT_TRANSITION_TIMEOUT_MS = 45_000;

export function matchesDistrictTransition(
  pending: PendingDistrictTransition | null | undefined,
  districtId: unknown,
  nonce: unknown
): pending is PendingDistrictTransition {
  return !!pending && typeof districtId === "string" && typeof nonce === "string" &&
    districtId === pending.id && nonce === pending.nonce;
}

export function isDistrictTransitionExpired(
  pending: PendingDistrictTransition | null | undefined,
  now: number,
  timeoutMs = DISTRICT_TRANSITION_TIMEOUT_MS
): boolean {
  return !!pending && Number.isFinite(now) && Number.isFinite(pending.createdAt) &&
    now - pending.createdAt >= timeoutMs;
}
