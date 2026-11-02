export type WorldDistrict = {
  id: string;
  name: string;
  contentLabel: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

function finiteBounded(value: unknown, bound: number): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= -bound && value <= bound;
}

/** Parse operator-authored, non-overlapping district rectangles. */
export function parseWorldDistricts(raw: string | undefined, worldBounds: number): WorldDistrict[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("WORLD_DISTRICTS must be valid JSON"); }
  const values = parsed && typeof parsed === "object" &&
    Array.isArray((parsed as { districts?: unknown }).districts)
      ? (parsed as { districts: unknown[] }).districts : null;
  if (!values || values.length > 100)
    throw new Error("WORLD_DISTRICTS must contain a districts array with at most 100 entries");

  const ids = new Set<string>();
  const districts = values.map((value, index): WorldDistrict => {
    if (!value || typeof value !== "object") throw new Error(`District ${index} is invalid`);
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
        ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 80 ||
        typeof item.contentLabel !== "string" || !/^world-city-district-[a-z0-9-]{1,48}$/.test(item.contentLabel) ||
        !finiteBounded(item.minX, worldBounds) || !finiteBounded(item.maxX, worldBounds) ||
        !finiteBounded(item.minZ, worldBounds) || !finiteBounded(item.maxZ, worldBounds) ||
        item.minX >= item.maxX || item.minZ >= item.maxZ)
      throw new Error(`District ${index} has invalid or duplicate fields`);
    ids.add(item.id);
    return { id: item.id, name: item.name.trim(), contentLabel: item.contentLabel,
      minX: item.minX, maxX: item.maxX, minZ: item.minZ, maxZ: item.maxZ };
  });

  for (let i = 0; i < districts.length; i++) {
    for (let j = i + 1; j < districts.length; j++) {
      const a = districts[i], b = districts[j];
      if (a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ)
        throw new Error(`Districts ${a.id} and ${b.id} overlap`);
    }
  }
  return districts;
}

export function findWorldDistrict(
  districts: WorldDistrict[], x: number, z: number
): WorldDistrict | null {
  return districts.find(district =>
    x >= district.minX && x < district.maxX &&
    z >= district.minZ && z < district.maxZ) || null;
}
