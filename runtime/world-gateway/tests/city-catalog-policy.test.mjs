import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWorldCityCatalog } from "../dist/city-catalog-policy.js";

const fixture = readFileSync(new URL("../config/world-cities.json", import.meta.url), "utf8");

test("canonical catalogue defines ten distinct cities with independent content manifests", () => {
  const cities = parseWorldCityCatalog(fixture, 10);
  assert.equal(cities.length, 10);
  assert.equal(new Set(cities.map(city => city.id)).size, 10);
  assert.equal(new Set(cities.map(city => city.name.toLowerCase())).size, 10);
  assert.equal(new Set(cities.map(city => city.contentLabel)).size, 10);
  for (const city of cities) {
    assert.equal(city.districts.length, 4);
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
