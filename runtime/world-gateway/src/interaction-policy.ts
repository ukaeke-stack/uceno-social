export type InteractableKind = "door" | "seat" | "object";
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
      (target.kind === "object" && action !== "use") ||
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

  return {
    ok: true,
    state: target.state === "active" ? "idle" : "active",
    occupantId: target.occupantId,
    seated: false
  };
}
