export type WorldCityDistrict = { id: string; name: string; contentLabel: string };
export type WorldCity = {
  id: string; name: string; identity: string; climate: string; architecture: string;
  contentLabel: string; spawn: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  districts: WorldCityDistrict[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Parse the authored city catalogue. A catalogue entry is metadata only:
 * runtime scene/content delivery must still publish each referenced Addressables label.
 */
export function parseWorldCityCatalog(raw: string, minimumCities = 10): WorldCity[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("WORLD_CITIES must be valid JSON"); }
  const values = parsed && typeof parsed === "object" &&
    Array.isArray((parsed as { cities?: unknown }).cities)
      ? (parsed as { cities: unknown[] }).cities : null;
  if (!values || values.length < minimumCities || values.length > 100)
    throw new Error(`WORLD_CITIES must contain at least ${minimumCities} and at most 100 cities`);

  const ids = new Set<string>();
  const names = new Set<string>();
  const labels = new Set<string>();
  return values.map((value, index): WorldCity => {
    if (!value || typeof value !== "object") throw new Error(`City ${index} is invalid`);
    const item = value as Record<string, unknown>;
    const id = item.id;
    const name = item.name;
    const identity = item.identity;
    const climate = item.climate;
    const architecture = item.architecture;
    const contentLabel = item.contentLabel;
    const spawn = item.spawn as Record<string, unknown> | undefined;
    const bounds = item.bounds as Record<string, unknown> | undefined;
    const districts = item.districts;
    if (typeof id !== "string" || !/^[a-z0-9-]{2,48}$/.test(id) || ids.has(id) ||
        typeof name !== "string" || name.trim().length < 3 || name.length > 80 ||
        names.has(name.trim().toLowerCase()) ||
        typeof identity !== "string" || identity.trim().length < 12 || identity.length > 180 ||
        typeof climate !== "string" || !/^[a-z0-9-]{3,48}$/.test(climate) ||
        typeof architecture !== "string" || architecture.trim().length < 20 || architecture.length > 240 ||
        typeof contentLabel !== "string" || contentLabel !== `world-city-${id}` ||
        labels.has(contentLabel) || !spawn || !bounds ||
        !finite(spawn.x) || !finite(spawn.z) ||
        !finite(bounds.minX) || !finite(bounds.maxX) || !finite(bounds.minZ) || !finite(bounds.maxZ) ||
        bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ ||
        spawn.x < bounds.minX || spawn.x >= bounds.maxX ||
        spawn.z < bounds.minZ || spawn.z >= bounds.maxZ ||
        !Array.isArray(districts) || districts.length < 4 || districts.length > 32)
      throw new Error(`City ${index} has invalid or duplicate fields`);

    ids.add(id);
    names.add(name.trim().toLowerCase());
    labels.add(contentLabel);
    const districtIds = new Set<string>();
    const districtLabels = new Set<string>();
    const parsedDistricts = districts.map((district, districtIndex): WorldCityDistrict => {
      if (!district || typeof district !== "object")
        throw new Error(`City ${id} district ${districtIndex} is invalid`);
      const entry = district as Record<string, unknown>;
      if (typeof entry.id !== "string" || !/^[a-z0-9-]{2,48}$/.test(entry.id) ||
          districtIds.has(entry.id) || typeof entry.name !== "string" ||
          entry.name.trim().length < 2 || entry.name.length > 80 ||
          typeof entry.contentLabel !== "string" ||
          entry.contentLabel !== `world-city-${id}-${entry.id}` ||
          districtLabels.has(entry.contentLabel))
        throw new Error(`City ${id} district ${districtIndex} has invalid or duplicate fields`);
      districtIds.add(entry.id);
      districtLabels.add(entry.contentLabel);
      return { id: entry.id, name: entry.name.trim(), contentLabel: entry.contentLabel };
    });
    return {
      id, name: name.trim(), identity: identity.trim(), climate,
      architecture: architecture.trim(), contentLabel,
      spawn: { x: spawn.x as number, z: spawn.z as number },
      bounds: { minX: bounds.minX as number, maxX: bounds.maxX as number,
        minZ: bounds.minZ as number, maxZ: bounds.maxZ as number },
      districts: parsedDistricts
    };
  });
}
