import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWorldDistricts, findWorldDistrict } from "../dist/district-policy.js";

const source = JSON.stringify({ districts: [
  { id: "central", name: "Central District", contentLabel: "world-city-district-central",
    minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  { id: "waterfront", name: "Waterfront", contentLabel: "world-city-district-waterfront",
    minX: 50, maxX: 100, minZ: -50, maxZ: 50 }
] });

test("parses bounded non-overlapping district metadata", () => {
  const districts = parseWorldDistricts(source, 1000);
  assert.equal(districts.length, 2);
  assert.equal(districts[0].contentLabel, "world-city-district-central");
});

test("resolves district membership and leaves gaps unassigned", () => {
  const districts = parseWorldDistricts(source, 1000);
  assert.equal(findWorldDistrict(districts, 0, 0)?.id, "central");
  assert.equal(findWorldDistrict(districts, 75, 0)?.id, "waterfront");
  assert.equal(findWorldDistrict(districts, 150, 0), null);
  assert.equal(findWorldDistrict(districts, 50, 0)?.id, "waterfront");
});

test("rejects malformed JSON, duplicate IDs, unsafe labels and invalid bounds", () => {
  assert.throws(() => parseWorldDistricts("{", 1000), /valid JSON/);
  assert.throws(() => parseWorldDistricts(JSON.stringify({ districts: [
    { id: "same", name: "A", contentLabel: "world-city-district-a", minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
    { id: "same", name: "B", contentLabel: "world-city-district-b", minX: 10, maxX: 20, minZ: 0, maxZ: 10 }
  ] }), 1000), /invalid or duplicate/);
  assert.throws(() => parseWorldDistricts(JSON.stringify({ districts: [
    { id: "unsafe", name: "A", contentLabel: "arbitrary-label", minX: 0, maxX: 10, minZ: 0, maxZ: 10 }
  ] }), 1000), /invalid or duplicate/);
  assert.throws(() => parseWorldDistricts(JSON.stringify({ districts: [
    { id: "outside", name: "A", contentLabel: "world-city-district-a", minX: -1001, maxX: 10, minZ: 0, maxZ: 10 }
  ] }), 1000), /invalid or duplicate/);
});

test("rejects overlapping district rectangles", () => {
  const overlapping = JSON.stringify({ districts: [
    { id: "a", name: "A", contentLabel: "world-city-district-a", minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
    { id: "b", name: "B", contentLabel: "world-city-district-b", minX: 10, maxX: 30, minZ: 10, maxZ: 30 }
  ] });
  assert.throws(() => parseWorldDistricts(overlapping, 1000), /overlap/);
});

test("supports an unconfigured gateway without district streaming", () => {
  assert.deepEqual(parseWorldDistricts(undefined, 1000), []);
});

test("canonical gateway config matches the four generated Unity district scenes", () => {
  const fixture = readFileSync(new URL("../config/world-districts.json", import.meta.url), "utf8");
  const districts = parseWorldDistricts(fixture, 10000);
  assert.deepEqual(districts.map(d => d.id), ["south", "central-south", "central-north", "north"]);
  assert.deepEqual(districts.map(d => d.contentLabel), [
    "world-city-district-south",
    "world-city-district-central-south",
    "world-city-district-central-north",
    "world-city-district-north"
  ]);
  assert.equal(findWorldDistrict(districts, 0, -90)?.id, "south");
  assert.equal(findWorldDistrict(districts, 0, -30)?.id, "central-south");
  assert.equal(findWorldDistrict(districts, 0, 30)?.id, "central-north");
  assert.equal(findWorldDistrict(districts, 0, 90)?.id, "north");
  assert.equal(findWorldDistrict(districts, 0, 120), null);
});
