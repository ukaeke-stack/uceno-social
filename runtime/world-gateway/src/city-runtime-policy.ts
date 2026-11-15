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
