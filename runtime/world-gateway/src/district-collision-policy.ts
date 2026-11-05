export type DistrictCollisionBox = {
  minX: number; maxX: number; minY: number; maxY: number;
  minZ: number; maxZ: number;
};
export type CollisionDistrict = {
  id: string; contentLabel: string;
  minX: number; maxX: number; minZ: number; maxZ: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseDistrictCollisionBoxes(
  raw: string, districtId: string, worldBounds: number
): DistrictCollisionBox[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`District map ${districtId} is not valid JSON`); }
  const values = record(parsed) && Array.isArray(parsed.boxes) ? parsed.boxes : null;
  if (!values || values.length === 0 || values.length > 500)
    throw new Error(`District map ${districtId} must contain 1–500 collision boxes`);
  return values.map((value, index) => {
    if (!record(value)) throw new Error(`District ${districtId} box ${index} is invalid`);
    const keys = ["minX", "maxX", "minY", "maxY", "minZ", "maxZ"] as const;
    for (const key of keys)
      if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
        throw new Error(`District ${districtId} box ${index} has invalid ${key}`);
    const box = value as unknown as DistrictCollisionBox;
    if (box.minX >= box.maxX || box.minY >= box.maxY || box.minZ >= box.maxZ ||
        [box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ]
          .some(number => Math.abs(number) > worldBounds))
      throw new Error(`District ${districtId} box ${index} has invalid bounds`);
    return box;
  });
}

export function parseDistrictCollisionManifest(
  raw: string,
  districts: CollisionDistrict[],
  worldBounds: number,
  readMap: (filename: string, districtId: string) => string
): Map<string, DistrictCollisionBox[]> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("District collision manifest is not valid JSON"); }
  const entries = record(parsed) && Array.isArray(parsed.districts) ? parsed.districts : null;
  if (!entries || entries.length !== districts.length)
    throw new Error("District collision manifest must contain every configured district exactly once");
  const configured = new Map(districts.map(district => [district.id, district]));
  const result = new Map<string, DistrictCollisionBox[]>();
  const filenames = new Set<string>();
  for (const [index, rawEntry] of entries.entries()) {
    if (!record(rawEntry)) throw new Error(`District map entry ${index} is invalid`);
    const entry = rawEntry;
    if (typeof entry.id !== "string" || typeof entry.contentLabel !== "string" ||
        typeof entry.file !== "string" || !/^[a-zA-Z0-9_-]{1,64}\.json$/.test(entry.file) ||
        result.has(entry.id) || filenames.has(entry.file))
      throw new Error(`District map entry ${index} has invalid or duplicate fields`);
    const district = configured.get(entry.id);
    if (!district || district.contentLabel !== entry.contentLabel ||
        entry.minX !== district.minX || entry.maxX !== district.maxX ||
        entry.minZ !== district.minZ || entry.maxZ !== district.maxZ)
      throw new Error(`District map entry ${index} does not match WORLD_DISTRICTS`);
    filenames.add(entry.file);
    result.set(entry.id, parseDistrictCollisionBoxes(readMap(entry.file, entry.id), entry.id, worldBounds));
  }
  if (result.size !== configured.size)
    throw new Error("District collision manifest is missing configured districts");
  return result;
}
