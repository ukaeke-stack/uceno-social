export type WorldCityDistrict = {
  id: string; name: string; role: string; layout: string; contentLabel: string;
  center: { x: number; z: number }; radius: number;
};
export type WorldCityLandmark = {
  id: string; name: string; kind: string; contentLabel: string;
  position: { x: number; z: number };
};
export type WorldCity = {
  id: string; name: string; identity: string; climate: string; architecture: string;
  contentLabel: string; spawn: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  layout: { pattern: string; blockMeters: number; roadHierarchy: string[]; water: string };
  environment: { biome: string; terrain: string; weather: string[]; vegetation: string[] };
  landmarks: WorldCityLandmark[];
  districts: WorldCityDistrict[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}
function stringList(value: unknown, min: number, max: number): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max &&
    value.every(item => text(item, 2, 64));
}

/**
 * Parse the authored city catalogue. This validates design data, not built scenes:
 * every returned content label still needs a published Addressables scene/build.
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
  const climates = new Set<string>();
  const patterns = new Set<string>();
  return values.map((value, index): WorldCity => {
    if (!value || typeof value !== "object") throw new Error(`City ${index} is invalid`);
    const item = value as Record<string, any>;
    const { id, name, identity, climate, architecture, contentLabel, spawn, bounds,
      districts, layout, environment, landmarks } = item;
    if (!text(id, 2, 48) || !/^[a-z0-9-]+$/.test(id) || ids.has(id) ||
        !text(name, 3, 80) || names.has(name.trim().toLowerCase()) ||
        !text(identity, 12, 180) || !text(climate, 3, 48) ||
        !text(architecture, 20, 240) || contentLabel !== `world-city-${id}` ||
        labels.has(contentLabel) || !spawn || !bounds ||
        !finite(spawn.x) || !finite(spawn.z) ||
        !finite(bounds.minX) || !finite(bounds.maxX) || !finite(bounds.minZ) || !finite(bounds.maxZ) ||
        bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ ||
        spawn.x < bounds.minX || spawn.x >= bounds.maxX ||
        spawn.z < bounds.minZ || spawn.z >= bounds.maxZ ||
        !layout || !text(layout.pattern, 4, 64) || !finite(layout.blockMeters) ||
        layout.blockMeters < 40 || layout.blockMeters > 300 ||
        !stringList(layout.roadHierarchy, 2, 8) || !text(layout.water, 8, 140) ||
        !environment || !text(environment.biome, 4, 64) ||
        !text(environment.terrain, 4, 100) ||
        !stringList(environment.weather, 2, 8) || !stringList(environment.vegetation, 2, 12) ||
        !Array.isArray(districts) || districts.length < 4 || districts.length > 32 ||
        !Array.isArray(landmarks) || landmarks.length < 3 || landmarks.length > 24 ||
        climates.has(climate) || patterns.has(layout.pattern))
      throw new Error(`City ${index} has invalid, incomplete or non-distinct design data`);

    ids.add(id); names.add(name.trim().toLowerCase()); labels.add(contentLabel);
    climates.add(climate); patterns.add(layout.pattern);
    const districtIds = new Set<string>();
    const districtLabels = new Set<string>();
    const districtNames = new Set<string>();
    const parsedDistricts = districts.map((district: any, districtIndex: number): WorldCityDistrict => {
      if (!district || typeof district !== "object" ||
          !text(district.id, 2, 48) || !/^[a-z0-9-]+$/.test(district.id) ||
          districtIds.has(district.id) || !text(district.name, 2, 80) ||
          districtNames.has(district.name.trim().toLowerCase()) ||
          !text(district.role, 3, 48) || district.layout !== layout.pattern ||
          district.contentLabel !== `world-city-${id}-${district.id}` ||
          districtLabels.has(district.contentLabel) || !district.center ||
          !finite(district.center.x) || !finite(district.center.z) ||
          !finite(district.radius) || district.radius < 40 || district.radius > 500)
        throw new Error(`City ${id} district ${districtIndex} has invalid or duplicate fields`);
      districtIds.add(district.id); districtLabels.add(district.contentLabel);
      districtNames.add(district.name.trim().toLowerCase());
      return { id: district.id, name: district.name.trim(), role: district.role,
        layout: district.layout, contentLabel: district.contentLabel,
        center: { x: district.center.x, z: district.center.z }, radius: district.radius };
    });
    const landmarkIds = new Set<string>();
    const parsedLandmarks = landmarks.map((landmark: any, landmarkIndex: number): WorldCityLandmark => {
      if (!landmark || typeof landmark !== "object" ||
          !text(landmark.id, 2, 48) || !/^[a-z0-9-]+$/.test(landmark.id) ||
          landmarkIds.has(landmark.id) || !text(landmark.name, 3, 90) ||
          !text(landmark.kind, 3, 48) ||
          landmark.contentLabel !== `world-city-${id}-landmark-${landmark.id}` ||
          !landmark.position || !finite(landmark.position.x) || !finite(landmark.position.z))
        throw new Error(`City ${id} landmark ${landmarkIndex} is invalid`);
      landmarkIds.add(landmark.id);
      return { id: landmark.id, name: landmark.name.trim(), kind: landmark.kind,
        contentLabel: landmark.contentLabel,
        position: { x: landmark.position.x, z: landmark.position.z } };
    });
    return {
      id, name: name.trim(), identity: identity.trim(), climate,
      architecture: architecture.trim(), contentLabel,
      spawn: { x: spawn.x, z: spawn.z },
      bounds: { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ },
      layout: { pattern: layout.pattern, blockMeters: layout.blockMeters,
        roadHierarchy: [...layout.roadHierarchy], water: layout.water },
      environment: { biome: environment.biome, terrain: environment.terrain,
        weather: [...environment.weather], vegetation: [...environment.vegetation] },
      landmarks: parsedLandmarks, districts: parsedDistricts
    };
  });
}
