export type InteractableKind = "door" | "seat" | "object" | "furniture" | "vehicle";
export type InteractableAction = "toggle" | "use" | "sit" | "stand";

export type InteractableState = {
  kind: InteractableKind;
  state: string;
  occupantId: string | null;
};

export type InteractionResult =
  | { ok: true; state: string; occupantId: string | null; seated: boolean }
  | { ok: false; code: "unknown_or_invalid_object" | "seat_occupied" | "seat_not_occupied_by_player" };

/**
 * Pure authoritative interaction transition. Geometry, distance and rate limits
 * are checked by the gateway before this function is called.
 */
export function resolveInteraction(
  target: InteractableState,
  userId: string,
  action: unknown
): InteractionResult {
  if (!userId || (target.kind === "door" && action !== "toggle") ||
      ((target.kind === "object" || target.kind === "furniture" || target.kind === "vehicle") && action !== "use") ||
      (target.kind === "seat" && action !== "sit" && action !== "stand")) {
    return { ok: false, code: "unknown_or_invalid_object" };
  }

  if (target.kind === "seat") {
    if (action === "sit") {
      if (target.occupantId && target.occupantId !== userId)
        return { ok: false, code: "seat_occupied" };
      return { ok: true, state: "occupied", occupantId: userId, seated: true };
    }
    if (target.occupantId !== userId)
      return { ok: false, code: "seat_not_occupied_by_player" };
    return { ok: true, state: "available", occupantId: null, seated: false };
  }

  if (target.kind === "door") {
    return {
      ok: true,
      state: target.state === "open" ? "closed" : "open",
      occupantId: target.occupantId,
      seated: false
    };
  }

  if (target.kind === "vehicle") {
    return { ok: true, state: target.state === "engine_on" ? "engine_off" : "engine_on",
      occupantId: target.occupantId, seated: false };
  }
  return {
    ok: true,
    state: target.state === "active" ? "idle" : "active",
    occupantId: target.occupantId,
    seated: false
  };
}

/** Server-side reach and interaction-frequency gate. */
export function isInteractionAllowed(
  distance: number,
  elapsedSincePreviousMs: number,
  maxDistance = 4.25,
  cooldownMs = 250
): boolean {
  return Number.isFinite(distance) && Number.isFinite(elapsedSincePreviousMs) &&
    Number.isFinite(maxDistance) && Number.isFinite(cooldownMs) &&
    distance >= 0 && elapsedSincePreviousMs >= 0 &&
    maxDistance > 0 && cooldownMs >= 0 &&
    distance <= maxDistance && elapsedSincePreviousMs >= cooldownMs;
}
