import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWorldDistricts } from "../dist/district-policy.js";
import { parseInteractableRegistry } from "../dist/interactable-registry-policy.js";

const manifest = readFileSync(new URL("../config/world-districts.json", import.meta.url), "utf8");
const districts = parseWorldDistricts(manifest, 10000);

test("Unity interactable registry resolves against every production district", () => {
  assert.equal(districts.length, 4);
  const interactables = districts.map((district) => ({
    id: `scene:district-${district.id}`,
    kind: "furniture",
    x: (district.minX + district.maxX) / 2,
    y: 0,
    z: (district.minZ + district.maxZ) / 2,
    yaw: 0
  }));
  const registry = parseInteractableRegistry(
    JSON.stringify({ interactables }),
    districts,
    10000
  );

  assert.equal(registry.size, districts.length);
  for (const district of districts) {
    const entry = registry.get(`scene:district-${district.id}`);
    assert.ok(entry, `missing interactable for ${district.id}`);
    assert.equal(entry.districtId, district.id);
  }
});

test("production district shared edges are assigned once using min-inclusive/max-exclusive bounds", () => {
  const entry = parseInteractableRegistry(JSON.stringify({
    interactables: [{
      id: "scene:district-edge",
      kind: "door",
      x: 0,
      y: 0,
      z: 60,
      yaw: 0
    }]
  }), districts, 10000).get("scene:district-edge");

  assert.equal(entry.districtId, "north");
});

test("production district manifest rejects interactables outside all districts", () => {
  assert.throws(() => parseInteractableRegistry(JSON.stringify({
    interactables: [{
      id: "scene:outside-city",
      kind: "door",
      x: 500,
      y: 0,
      z: 500,
      yaw: 0
    }]
  }), districts, 10000), /outside every configured world district/);
});
