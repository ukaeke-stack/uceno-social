export type PersistentObjectKind = "door" | "furniture" | "vehicle" | "object";
export type PersistentObjectState =
  | "open" | "closed" | "active" | "idle" | "engine_on" | "engine_off";

/** Stable composite scope prevents an object ID in one district/world from aliasing another. */
export function districtObjectKey(worldId: string, districtId: string, objectId: string): string {
  return [worldId, districtId, objectId].join(":");
}

export function isPersistentObjectState(
  kind: PersistentObjectKind,
  state: unknown
): state is PersistentObjectState {
  if (kind === "door") return state === "open" || state === "closed";
  if (kind === "vehicle") return state === "engine_on" || state === "engine_off";
  return state === "active" || state === "idle";
}

export function defaultPersistentObjectState(kind: PersistentObjectKind): PersistentObjectState {
  if (kind === "door") return "closed";
  if (kind === "vehicle") return "engine_off";
  return "idle";
}
