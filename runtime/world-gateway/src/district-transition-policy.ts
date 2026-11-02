export type PendingDistrictTransition = {
  id: string;
  contentLabel: string;
  nonce: string;
  createdAt: number;
};
export type DistrictTransitionTarget = { id: string; contentLabel: string; name?: string };
export type DistrictTransitionCancellationReason =
  | "transition_timeout" | "left_boundary" | "superseded" | "returned_to_active_district";
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
    Number.isFinite(timeoutMs) && timeoutMs >= 0 && now - pending.createdAt >= timeoutMs;
}

export type DistrictTransitionPlan = {
  pending: PendingDistrictTransition | null;
  cancellation: { transition: PendingDistrictTransition; reason: DistrictTransitionCancellationReason } | null;
  exitedDistrictId: string | null;
  request: PendingDistrictTransition | null;
};

/** Purely plans the next transition without mutating player state. */
export function planDistrictTransition(
  activeDistrictId: string | null,
  pending: PendingDistrictTransition | null,
  target: DistrictTransitionTarget | null,
  now: number,
  createNonce: () => string
): DistrictTransitionPlan {
  let nextPending = pending;
  let cancellation: DistrictTransitionPlan["cancellation"] = null;
  if (isDistrictTransitionExpired(nextPending, now)) {
    cancellation = { transition: nextPending!, reason: "transition_timeout" };
    nextPending = null;
  }
  if ((target?.id ?? null) === activeDistrictId) {
    if (nextPending) cancellation = { transition: nextPending, reason: "returned_to_active_district" };
    return { pending: null, cancellation, exitedDistrictId: null, request: null };
  }
  if (!target) {
    if (nextPending) cancellation = { transition: nextPending, reason: "left_boundary" };
    return { pending: null, cancellation, exitedDistrictId: activeDistrictId, request: null };
  }
  if (nextPending?.id === target.id)
    return { pending: nextPending, cancellation, exitedDistrictId: null, request: null };
  if (nextPending) cancellation = { transition: nextPending, reason: "superseded" };
  const request = {
    id: target.id, contentLabel: target.contentLabel,
    nonce: createNonce(), createdAt: now
  };
  return { pending: request, cancellation, exitedDistrictId: null, request };
}
