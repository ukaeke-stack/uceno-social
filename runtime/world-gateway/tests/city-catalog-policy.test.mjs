import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWorldCityCatalog } from "../dist/city-catalog-policy.js";
import { evaluateCityRuntimeReadiness, resolveReadyCityRuntime } from "../dist/city-runtime-policy.js";

const fixture = readFileSync(new URL("../config/world-cities.json", import.meta.url), "utf8");

test("canonical catalogue defines ten distinct cities with independent content manifests", () => {
  const cities = parseWorldCityCatalog(fixture, 10);
  assert.equal(cities.length, 10);
  assert.equal(new Set(cities.map(city => city.id)).size, 10);
  assert.equal(new Set(cities.map(city => city.name.toLowerCase())).size, 10);
  assert.equal(new Set(cities.map(city => city.contentLabel)).size, 10);
  for (const city of cities) {
    assert.equal(city.districts.length, 4);
    assert.equal(city.landmarks.length, 3);
    assert.ok(city.environment.terrain.length >= 4);
    assert.ok(city.layout.roadHierarchy.length >= 2);
    assert.equal(new Set(city.districts.map(district => district.name.toLowerCase())).size, 4);
    assert.equal(new Set(city.districts.map(district => district.contentLabel)).size, 4);
    assert.ok(city.spawn.x >= city.bounds.minX && city.spawn.x < city.bounds.maxX);
    assert.ok(city.spawn.z >= city.bounds.minZ && city.spawn.z < city.bounds.maxZ);
  }
});

test("catalogue rejects fewer than ten cities, malformed JSON and duplicate identities", () => {
  assert.throws(() => parseWorldCityCatalog("{"), /valid JSON/);
  const parsed = JSON.parse(fixture);
  assert.throws(() => parseWorldCityCatalog(JSON.stringify({ cities: parsed.cities.slice(0, 9) }), 10), /at least 10/);
  parsed.cities[1].id = parsed.cities[0].id;
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(parsed), 10), /invalid or duplicate/);
});

test("catalogue rejects invalid spawn bounds and mismatched content labels", () => {
  const outside = JSON.parse(fixture);
  outside.cities[0].spawn.x = 9000;
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(outside), 10), /invalid or duplicate/);

  const mismatched = JSON.parse(fixture);
  mismatched.cities[0].districts[0].contentLabel = "world-city-other-downtown";
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(mismatched), 10), /district .* invalid or duplicate/);
});

test("catalogue rejects districts whose full radius extends beyond city bounds", () => {
  const outside = JSON.parse(fixture);
  const city = outside.cities[0];
  const district = city.districts[0];
  district.center.x = city.bounds.minX + district.radius - 1;
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(outside), 10), /extends outside city bounds/);
});

test("catalogue rejects duplicate district IDs and fewer than four districts", () => {
  const duplicate = JSON.parse(fixture);
  duplicate.cities[0].districts[1].id = duplicate.cities[0].districts[0].id;
  duplicate.cities[0].districts[1].contentLabel = duplicate.cities[0].districts[0].contentLabel;
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(duplicate), 10), /district .* invalid or duplicate/);

  const incomplete = JSON.parse(fixture);
  incomplete.cities[0].districts = incomplete.cities[0].districts.slice(0, 3);
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(incomplete), 10), /invalid or duplicate/);
});

test("gateway loads the catalogue at startup and labels unpublished scenes honestly", () => {
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  assert.match(server, /parseWorldCityCatalog\(raw, 10\)/);
  assert.match(server, /process\.cwd\(\), "config\/world-cities\.json"/);
  assert.match(server, /req\.url === "\/cities"/);
  assert.match(server, /contentStatus: "catalogue_only"/);
  assert.match(dockerfile, /COPY config \.\/config/);
});

test("Meridian catalogue labels match the gateway's district admission configuration", () => {
  const cities = parseWorldCityCatalog(fixture, 10);
  const meridian = cities.find(city => city.id === "meridian");
  assert.ok(meridian, "Meridian must exist in the city catalogue");
  const districtFixture = readFileSync(new URL("../config/world-districts.json", import.meta.url), "utf8");
  const gatewayDistricts = JSON.parse(districtFixture).districts;
  assert.deepEqual(
    gatewayDistricts.map(district => [district.id, district.contentLabel]),
    meridian.districts.map(district => [district.id, district.contentLabel])
  );
  assert.ok(gatewayDistricts.every(district =>
    district.contentLabel === `world-city-meridian-${district.id}`
  ));
});

test("ten-city catalogue has ten different environment and urban-form profiles", () => {
  const cities = parseWorldCityCatalog(fixture, 10);
  assert.equal(new Set(cities.map(city => city.environment.biome)).size, 10);
  assert.equal(new Set(cities.map(city => city.environment.terrain)).size, 10);
  assert.equal(new Set(cities.map(city => city.layout.pattern)).size, 10);
  assert.equal(new Set(cities.map(city => city.architecture)).size, 10);
  for (const city of cities) {
    assert.equal(new Set(city.landmarks.map(item => item.id)).size, city.landmarks.length);
    assert.ok(city.landmarks.every(item => item.contentLabel.startsWith(`world-city-${city.id}-landmark-`)));
    assert.ok(city.districts.every(item => item.layout === city.layout.pattern));
    assert.ok(city.districts.every(item => item.center.x >= city.bounds.minX &&
      item.center.x <= city.bounds.maxX && item.center.z >= city.bounds.minZ &&
      item.center.z <= city.bounds.maxZ));
  }
});

test("catalogue rejects missing landmark and duplicated urban-form profiles", () => {
  const noLandmarks = JSON.parse(fixture);
  noLandmarks.cities[0].landmarks = [];
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(noLandmarks), 10), /design data/);
  const duplicateLayout = JSON.parse(fixture);
  duplicateLayout.cities[1].layout.pattern = duplicateLayout.cities[0].layout.pattern;
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(duplicateLayout), 10), /design data/);
});

test("district rectangles do not overlap and own each city's spawn exactly once", () => {
  const cities = parseWorldCityCatalog(fixture, 10);
  for (const city of cities) {
    const owners = city.districts.filter(district =>
      city.spawn.x >= district.center.x - district.radius &&
      city.spawn.x < district.center.x + district.radius &&
      city.spawn.z >= district.center.z - district.radius &&
      city.spawn.z < district.center.z + district.radius);
    assert.equal(owners.length, 1);
  }
  const overlapping = JSON.parse(fixture);
  overlapping.cities[0].districts[0].center.x = overlapping.cities[0].districts[1].center.x;
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(overlapping), 10), /overlapping district layouts/);
});

test("each landmark declares one district and is geometrically inside only that district", () => {
  const cities = parseWorldCityCatalog(fixture, 10);
  for (const city of cities) {
    for (const landmark of city.landmarks) {
      const owners = city.districts.filter(district =>
        landmark.position.x >= district.center.x - district.radius &&
        landmark.position.x < district.center.x + district.radius &&
        landmark.position.z >= district.center.z - district.radius &&
        landmark.position.z < district.center.z + district.radius);
      assert.deepEqual(owners.map(owner => owner.id), [landmark.districtId]);
    }
  }
  const misplaced = JSON.parse(fixture);
  misplaced.cities[1].landmarks[0].districtId = misplaced.cities[1].districts[1].id;
  assert.throws(() => parseWorldCityCatalog(JSON.stringify(misplaced), 10), /must belong to exactly its declared district/);
});

test("city runtime district resolver preserves city-specific district IDs and bounds", async () => {
  const { districtsForCity, findCityById } = await import("../dist/city-runtime-policy.js");
  const cities = parseWorldCityCatalog(fixture, 10);
  for (const city of cities) {
    const runtimeDistricts = districtsForCity(city);
    assert.equal(runtimeDistricts.length, 4);
    assert.deepEqual(runtimeDistricts.map(item => item.id), city.districts.map(item => item.id));
    for (let i = 0; i < city.districts.length; i++) {
      const source = city.districts[i], runtime = runtimeDistricts[i];
      assert.equal(runtime.minX, source.center.x - source.radius);
      assert.equal(runtime.maxX, source.center.x + source.radius);
      assert.equal(runtime.minZ, source.center.z - source.radius);
      assert.equal(runtime.maxZ, source.center.z + source.radius);
      assert.ok(runtime.contentLabel.startsWith(`world-city-${city.id}-`));
    }
  }
  assert.equal(findCityById(cities, "solstice")?.id, "solstice");
  assert.equal(findCityById(cities, "missing"), null);
});

test("city runtime district namespaces cannot be confused across cities", async () => {
  const { districtsForCity } = await import("../dist/city-runtime-policy.js");
  const cities = parseWorldCityCatalog(fixture, 10);
  const meridian = districtsForCity(cities.find(city => city.id === "meridian"));
  const solstice = districtsForCity(cities.find(city => city.id === "solstice"));
  assert.notDeepEqual(
    meridian.map(item => [item.id, item.contentLabel]),
    solstice.map(item => [item.id, item.contentLabel])
  );
});

test("city runtime district resolver preserves city-specific district IDs and bounds", async () => {
  const { districtsForCity, findCityById } = await import("../dist/city-runtime-policy.js");
  const cities = parseWorldCityCatalog(fixture, 10);
  for (const city of cities) {
    const runtimeDistricts = districtsForCity(city);
    assert.equal(runtimeDistricts.length, 4);
    assert.deepEqual(runtimeDistricts.map(item => item.id), city.districts.map(item => item.id));
    for (let i = 0; i < city.districts.length; i++) {
      const source = city.districts[i], runtime = runtimeDistricts[i];
      assert.equal(runtime.minX, source.center.x - source.radius);
      assert.equal(runtime.maxX, source.center.x + source.radius);
      assert.equal(runtime.minZ, source.center.z - source.radius);
      assert.equal(runtime.maxZ, source.center.z + source.radius);
      assert.ok(runtime.contentLabel.startsWith(`world-city-${city.id}-`));
    }
  }
  assert.equal(findCityById(cities, "solstice")?.id, "solstice");
  assert.equal(findCityById(cities, "missing"), null);
});

test("city runtime district namespaces cannot be confused across cities", async () => {
  const { districtsForCity } = await import("../dist/city-runtime-policy.js");
  const cities = parseWorldCityCatalog(fixture, 10);
  const meridian = districtsForCity(cities.find(city => city.id === "meridian"));
  const solstice = districtsForCity(cities.find(city => city.id === "solstice"));
  assert.notDeepEqual(
    meridian.map(item => [item.id, item.contentLabel]),
    solstice.map(item => [item.id, item.contentLabel])
  );
});

test("city runtime resolution fails closed for unknown city IDs", async () => {
  const { resolveCityRuntime } = await import("../dist/city-runtime-policy.js");
  const cities = parseWorldCityCatalog(fixture, 10);
  const resolved = resolveCityRuntime(cities, "solstice");
  assert.equal(resolved?.city.id, "solstice");
  assert.equal(resolved?.districts.length, 4);
  assert.equal(resolveCityRuntime(cities, "not-a-city"), null);
});


test("city admission fails closed until every district has collision and interactable exports", () => {
  const cities = parseWorldCityCatalog(fixture, 10);
  const meridian = cities.find(city => city.id === "meridian");
  assert.ok(meridian);
  const districts = new Set(meridian.districts.map(district => district.id));
  const noAssets = evaluateCityRuntimeReadiness(meridian, new Set(), new Set());
  assert.equal(noAssets.ready, false);
  assert.equal(noAssets.missingCollisionDistrictIds.length, 4);
  assert.equal(noAssets.missingInteractableDistrictIds.length, 4);
  assert.equal(resolveReadyCityRuntime(cities, "meridian", new Set(), new Set()), null);
  assert.equal(resolveReadyCityRuntime(cities, "unknown-city", districts, districts), null);
});

test("city admission requires complete collision and interactable coverage for the assigned city", () => {
  const cities = parseWorldCityCatalog(fixture, 10);
  const meridian = cities.find(city => city.id === "meridian");
  const solstice = cities.find(city => city.id === "solstice");
  assert.ok(meridian && solstice);
  const meridianIds = new Set(meridian.districts.map(district => district.id));
  const solsticeIds = new Set(solstice.districts.map(district => district.id));
  assert.equal(evaluateCityRuntimeReadiness(meridian, meridianIds, meridianIds).ready, true);
  assert.ok(resolveReadyCityRuntime(cities, "meridian", meridianIds, meridianIds));
  assert.equal(resolveReadyCityRuntime(cities, "solstice", meridianIds, meridianIds), null);
  const partialCollision = new Set([...meridianIds].slice(1));
  assert.equal(evaluateCityRuntimeReadiness(meridian, partialCollision, meridianIds).ready, false);
  const partialInteractables = new Set([...meridianIds].slice(1));
  assert.equal(evaluateCityRuntimeReadiness(meridian, meridianIds, partialInteractables).ready, false);
});

test("gateway authentication binds the database city assignment and rechecks it during the session", () => {
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(server, /w\.city_id AS "cityId"/);
  assert.match(server, /resolveReadyCityRuntime\(\s*WORLD_CITIES/);
  assert.match(server, /id: userId, worldId, cityId, token/);
  assert.match(server, /currentIdentity\.cityId !== player\.cityId/);
  assert.match(server, /city_assignment_changed/);
});

test("gateway movement, district snapshots and proximity routing use each player's assigned city", () => {
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(server, /function findPlayerDistrict\(player: Pick<Player, "cityId">/);
  assert.match(server, /resolveCityRuntime\(WORLD_CITIES, player\.cityId\)/);
  assert.match(server, /findPlayerDistrict\(p, proposedX, proposedZ\)/);
  assert.match(server, /findPlayerDistrict\(player, player\.x, player\.z\)/);
  assert.match(server, /findPlayerDistrict\(peer, peer\.x, peer\.z\)/);
  assert.match(server, /cityRuntime\.city\.spawn\.x/);
  assert.match(server, /findWorldDistrict\(cityRuntime\.districts, p\.x, p\.z\)/);
});
