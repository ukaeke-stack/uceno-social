import { findWorldDistrict, type WorldDistrict } from "./district-policy.js";
import { defaultPersistentObjectState } from "./district-object-policy.js";

export type RegisteredInteractableKind = "door" | "seat" | "object" | "furniture" | "vehicle";
export type RegisteredInteractable = {
  id: string;
  districtId: string;
  kind: RegisteredInteractableKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: string;
  version: number;
  actorId: string | null;
  occupantId: string | null;
};

function finiteCoordinate(value: unknown, bound: number): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= -bound && value <= bound;
}

/** Parse the Unity scene export; no client-supplied registry entries are accepted. */
/** Load the authoritative scene registry, optionally refusing an empty configuration. */
export function loadInteractableRegistry(
  raw: string | undefined,
  districts: WorldDistrict[],
  worldBounds: number,
  required = false
): Map<string, RegisteredInteractable> {
  if (!raw || raw.trim().length === 0) {
    if (required)
      throw new Error("WORLD_REQUIRE_INTERACTABLE_REGISTRY is enabled but no world interactable registry was provided");
    return new Map();
  }
  return parseInteractableRegistry(raw, districts, worldBounds);
}

export function parseInteractableRegistry(
  raw: string,
  districts: WorldDistrict[],
  worldBounds: number
): Map<string, RegisteredInteractable> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("World interactables must be valid JSON"); }
  if (!parsed || typeof parsed !== "object" ||
      !Array.isArray((parsed as { interactables?: unknown }).interactables))
    throw new Error("World interactables must contain an interactables array");

  const values = (parsed as { interactables: unknown[] }).interactables;
  if (values.length > 500) throw new Error("World interactables cannot exceed 500 entries");
  const result = new Map<string, RegisteredInteractable>();
  for (const [index, value] of values.entries()) {
    if (!value || typeof value !== "object")
      throw new Error(`Interactable ${index} is invalid`);
    const item = value as Record<string, unknown>;
    const kind = item.kind;
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9._:-]{1,80}$/.test(item.id) ||
        (kind !== "door" && kind !== "seat" && kind !== "object" &&
          kind !== "furniture" && kind !== "vehicle") ||
        !finiteCoordinate(item.x, worldBounds) ||
        !finiteCoordinate(item.y, worldBounds) ||
        !finiteCoordinate(item.z, worldBounds) ||
        (item.yaw !== undefined &&
          (typeof item.yaw !== "number" || !Number.isFinite(item.yaw) ||
            item.yaw < -Math.PI * 4 || item.yaw > Math.PI * 4)) ||
        result.has(item.id))
      throw new Error(`Interactable ${index} has invalid or duplicate fields`);

    const owningDistrict = findWorldDistrict(districts, item.x, item.z);
    if (districts.length > 0 && !owningDistrict)
      throw new Error(`Interactable ${item.id} is outside every configured world district`);
    result.set(item.id, {
      id: item.id,
      districtId: owningDistrict?.id ?? "unassigned",
      kind,
      x: item.x,
      y: item.y,
      z: item.z,
      yaw: typeof item.yaw === "number" ? item.yaw : 0,
      state: kind === "seat" ? "available" : defaultPersistentObjectState(kind),
      version: 0,
      actorId: null,
      occupantId: null
    });
  }
  return result;
}
