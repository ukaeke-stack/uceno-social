import { findWorldDistrict, type WorldDistrict } from "./district-policy.js";
import { defaultPersistentObjectState } from "./district-object-policy.js";

export type RegisteredInteractableKind = "door" | "seat" | "object" | "furniture" | "vehicle";
export type RegisteredInteractable = {
  id: string;
  cityId: string;
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
  const registry = parseInteractableRegistry(raw, districts, worldBounds);
  if (required && registry.size === 0)
    throw new Error("WORLD_REQUIRE_INTERACTABLE_REGISTRY is enabled but the world interactable registry contains no objects");
  return registry;
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
      cityId: "",
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


export type CityInteractableManifestEntry = { cityId: string; file: string };

/**
 * Load one exported Unity interactable registry per city. Every entry is
 * validated against that city's own district geometry; IDs must be globally
 * unique across the aggregate manifest.
 */
export function parseCityInteractableManifest(
  rawManifest: string,
  cities: Array<{ id: string; districts: WorldDistrict[] }>,
  worldBounds: number,
  readRegistry: (file: string, cityId: string) => string
): Map<string, RegisteredInteractable> {
  let parsed: unknown;
  try { parsed = JSON.parse(rawManifest); }
  catch { throw new Error("City interactable manifest must be valid JSON"); }
  const entries = parsed && typeof parsed === "object" &&
    Array.isArray((parsed as { cities?: unknown }).cities)
      ? (parsed as { cities: unknown[] }).cities : null;
  if (!entries || entries.length !== cities.length)
    throw new Error("City interactable manifest must contain exactly one registry for every configured city");
  const expected = new Set(cities.map(city => city.id));
  const seenCities = new Set<string>();
  const seenFiles = new Set<string>();
  const aggregate = new Map<string, RegisteredInteractable>();
  for (const [index, value] of entries.entries()) {
    if (!value || typeof value !== "object") throw new Error(`City interactable manifest entry ${index} is invalid`);
    const entry = value as Record<string, unknown>;
    if (typeof entry.cityId !== "string" || !expected.has(entry.cityId) ||
        typeof entry.file !== "string" || !/^[a-zA-Z0-9_-]{1,80}\\.json$/.test(entry.file) ||
        seenCities.has(entry.cityId) || seenFiles.has(entry.file))
      throw new Error(`City interactable manifest entry ${index} has invalid or duplicate identity/file`);
    seenCities.add(entry.cityId);
    seenFiles.add(entry.file);
    const city = cities.find(item => item.id === entry.cityId)!;
    const raw = readRegistry(entry.file, entry.cityId);
    const parsedRegistry = parseInteractableRegistry(raw, city.districts, worldBounds);
    if (parsedRegistry.size === 0)
      throw new Error(`City ${city.id} interactable registry is empty`);
    for (const [id, item] of parsedRegistry) {
      if (aggregate.has(id)) throw new Error(`Duplicate interactable ID across cities: ${id}`);
      aggregate.set(id, { ...item, cityId: city.id });
    }
  }
  return aggregate;
}
