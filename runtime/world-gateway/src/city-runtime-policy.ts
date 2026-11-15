import type { WorldCity } from "./city-catalog-policy.js";
import type { WorldDistrict } from "./district-policy.js";

/**
 * Convert one validated city's center/radius district definitions into the
 * gateway's axis-aligned runtime regions. Keep this conversion isolated from
 * collision manifests and interactable registries, which have separate
 * exported-artifact requirements.
 */
export function districtsForCity(city: WorldCity): WorldDistrict[] {
  return city.districts.map(district => ({
    id: district.id,
    name: district.name,
    contentLabel: district.contentLabel,
    minX: district.center.x - district.radius,
    maxX: district.center.x + district.radius,
    minZ: district.center.z - district.radius,
    maxZ: district.center.z + district.radius
  }));
}

export function findCityById(cities: WorldCity[], cityId: string): WorldCity | null {
  return cities.find(city => city.id === cityId) ?? null;
}

/**
 * Resolve an authoritative city ID into the exact district set used by the
 * simulation. Unknown IDs fail closed; callers must never fall back to the
 * Meridian district file for a different city.
 */
export function resolveCityRuntime(cities: WorldCity[], cityId: string): {
  city: WorldCity;
  districts: WorldDistrict[];
} | null {
  const city = findCityById(cities, cityId);
  if (!city) return null;
  return { city, districts: districtsForCity(city) };
}


export type CityRuntimeReadiness = {
  ready: boolean;
  missingCollisionDistrictIds: string[];
  missingInteractableDistrictIds: string[];
};

/**
 * A city is admissible only when every configured district has both a
 * validated collision map and at least one exported interactable. City
 * catalogue metadata alone is never treated as a playable runtime.
 */
export function evaluateCityRuntimeReadiness(
  city: WorldCity,
  collisionDistrictIds: ReadonlySet<string>,
  interactableDistrictIds: ReadonlySet<string>
): CityRuntimeReadiness {
  const districtIds = city.districts.map(district => city.id + ':' + district.id);
  const missingCollisionDistrictIds = districtIds.filter(id => !collisionDistrictIds.has(id));
  const missingInteractableDistrictIds = districtIds.filter(id => !interactableDistrictIds.has(id));
  return {
    ready: missingCollisionDistrictIds.length === 0 && missingInteractableDistrictIds.length === 0,
    missingCollisionDistrictIds,
    missingInteractableDistrictIds
  };
}

export function resolveReadyCityRuntime(
  cities: WorldCity[],
  cityId: string,
  collisionDistrictIds: ReadonlySet<string>,
  interactableDistrictIds: ReadonlySet<string>
): { city: WorldCity; districts: WorldDistrict[] } | null {
  const runtime = resolveCityRuntime(cities, cityId);
  if (!runtime || !evaluateCityRuntimeReadiness(runtime.city, collisionDistrictIds, interactableDistrictIds).ready)
    return null;
  return runtime;
}
