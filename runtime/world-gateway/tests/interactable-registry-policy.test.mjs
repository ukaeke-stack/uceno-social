import test from "node:test";
import assert from "node:assert/strict";
import { loadInteractableRegistry, parseInteractableRegistry, parseCityInteractableManifest } from "../dist/interactable-registry-policy.js";

const districts = [{
  id: "central", name: "Central", contentLabel: "world-city-district-central",
  minX: -20, maxX: 20, minZ: -20, maxZ: 20
}];

test("loads Unity-exported doors and furniture with district and default state", () => {
  const registry = parseInteractableRegistry(JSON.stringify({ interactables: [
    { id: "scene:door-a", kind: "door", x: 2, y: 0, z: 3, yaw: 1.2 },
    { id: "scene:sofa-a", kind: "furniture", x: -2, y: 0, z: 1 }
  ] }), districts, 100);
  assert.equal(registry.size, 2);
  assert.deepEqual(registry.get("scene:door-a"), {
    id: "scene:door-a", cityId: "", districtId: "central", kind: "door",
    x: 2, y: 0, z: 3, yaw: 1.2, state: "closed",
    version: 0, actorId: null, occupantId: null
  });
  assert.equal(registry.get("scene:sofa-a").state, "idle");
});

test("rejects malformed registry documents and duplicate IDs", () => {
  assert.throws(() => parseInteractableRegistry("{", districts, 100), /valid JSON/);
  assert.throws(() => parseInteractableRegistry("{}", districts, 100), /interactables array/);
  assert.throws(() => parseInteractableRegistry(JSON.stringify({ interactables: [
    { id: "same", kind: "door", x: 0, y: 0, z: 0 },
    { id: "same", kind: "seat", x: 1, y: 0, z: 1 }
  ] }), districts, 100), /invalid or duplicate fields/);
});

test("rejects unsupported kinds, non-finite coordinates and invalid yaw", () => {
  for (const item of [
    { id: "bad-kind", kind: "lamp", x: 0, y: 0, z: 0 },
    { id: "bad-x", kind: "door", x: Infinity, y: 0, z: 0 },
    { id: "bad-yaw", kind: "door", x: 0, y: 0, z: 0, yaw: 1000 }
  ]) {
    const json = JSON.stringify({ interactables: [item] });
    assert.throws(() => parseInteractableRegistry(json, districts, 100));
  }
});

test("rejects objects outside configured districts and more than 500 objects", () => {
  assert.throws(() => parseInteractableRegistry(JSON.stringify({ interactables: [
    { id: "outside", kind: "door", x: 30, y: 0, z: 0 }
  ] }), districts, 100), /outside every configured world district/);
  const many = Array.from({ length: 501 }, (_, index) => ({
    id: "item-" + index, kind: "object", x: 0, y: 0, z: 0
  }));
  assert.throws(() => parseInteractableRegistry(JSON.stringify({ interactables: many }), districts, 100),
    /cannot exceed 500/);
});

test("seat registry entries start available and persistent furniture starts idle", () => {
  const registry = parseInteractableRegistry(JSON.stringify({ interactables: [
    { id: "seat-1", kind: "seat", x: 0, y: 0, z: 0 },
    { id: "table-1", kind: "furniture", x: 1, y: 0, z: 0 }
  ] }), districts, 100);
  assert.equal(registry.get("seat-1").state, "available");
  assert.equal(registry.get("table-1").state, "idle");
});

test("required registry mode rejects missing and empty scene exports", () => {
  assert.equal(loadInteractableRegistry(undefined, districts, 100, false).size, 0);
  assert.equal(loadInteractableRegistry("  ", districts, 100, false).size, 0);
  assert.throws(() => loadInteractableRegistry(undefined, districts, 100, true),
    /WORLD_REQUIRE_INTERACTABLE_REGISTRY.*no world interactable registry/);
  assert.throws(() => loadInteractableRegistry("  ", districts, 100, true),
    /WORLD_REQUIRE_INTERACTABLE_REGISTRY.*no world interactable registry/);
  assert.throws(() => loadInteractableRegistry(JSON.stringify({ interactables: [] }), districts, 100, true),
    /WORLD_REQUIRE_INTERACTABLE_REGISTRY.*contains no objects/);
  const loaded = loadInteractableRegistry(JSON.stringify({ interactables: [
    { id: "scene:door-required", kind: "door", x: 0, y: 0, z: 0 }
  ] }), districts, 100, true);
  assert.equal(loaded.size, 1);
});


test("city interactable manifest loads isolated registries against each city's own district geometry", () => {
  const cities = [
    { id: "meridian", districts: [{ id: "civic", name: "Civic", contentLabel: "world-city-meridian-civic",
      minX: -20, maxX: 20, minZ: -20, maxZ: 20 }] },
    { id: "solstice", districts: [{ id: "civic", name: "Civic", contentLabel: "world-city-solstice-civic",
      minX: 80, maxX: 120, minZ: 80, maxZ: 120 }] }
  ];
  const manifest = JSON.stringify({ cities: [
    { cityId: "meridian", file: "world-interactables-meridian.json" },
    { cityId: "solstice", file: "world-interactables-solstice.json" }
  ] });
  const registry = parseCityInteractableManifest(manifest, cities, 200, (_file, cityId) =>
    JSON.stringify({ interactables: [{
      id: "scene:" + (cityId === "meridian" ? "a" : "b").repeat(32),
      kind: "door", x: cityId === "meridian" ? 0 : 100, y: 0, z: cityId === "meridian" ? 0 : 100
    }] }));
  assert.equal(registry.size, 2);
  assert.equal(registry.get("scene:" + "a".repeat(32)).cityId, "meridian");
  assert.equal(registry.get("scene:" + "b".repeat(32)).cityId, "solstice");
  assert.equal(registry.get("scene:" + "a".repeat(32)).districtId, "civic");
  assert.equal(registry.get("scene:" + "b".repeat(32)).districtId, "civic");
});

test("city interactable manifest rejects missing cities, duplicate files, empty registries and cross-city IDs", () => {
  const cities = [
    { id: "meridian", districts: [{ id: "civic", name: "Civic", contentLabel: "world-city-meridian-civic",
      minX: -20, maxX: 20, minZ: -20, maxZ: 20 }] },
    { id: "solstice", districts: [{ id: "civic", name: "Civic", contentLabel: "world-city-solstice-civic",
      minX: 80, maxX: 120, minZ: 80, maxZ: 120 }] }
  ];
  const complete = [{ cityId: "meridian", file: "meridian.json" }, { cityId: "solstice", file: "solstice.json" }];
  assert.throws(() => parseCityInteractableManifest(JSON.stringify({ cities: complete.slice(0, 1) }), cities, 200, () => "{}"),
    /exactly one registry for every configured city/);
  const duplicateFiles = [{ cityId: "meridian", file: "same.json" }, { cityId: "solstice", file: "same.json" }];
  assert.throws(() => parseCityInteractableManifest(JSON.stringify({ cities: duplicateFiles }), cities, 200, () => "{}"),
    /invalid or duplicate identity/);
  assert.throws(() => parseCityInteractableManifest(JSON.stringify({ cities: complete }), cities, 200, () =>
    JSON.stringify({ interactables: [] })), /registry is empty/);
  assert.throws(() => parseCityInteractableManifest(JSON.stringify({ cities: complete }), cities, 200, () =>
    JSON.stringify({ interactables: [{ id: "scene:" + "a".repeat(32), kind: "door", x: 0, y: 0, z: 0 }] })),
    /Duplicate interactable ID across cities/);
});

test("city interactable parser rejects an object's coordinates outside its declared city districts", () => {
  const cities = [{ id: "solstice", districts: [{ id: "civic", name: "Civic", contentLabel: "world-city-solstice-civic",
    minX: 80, maxX: 120, minZ: 80, maxZ: 120 }] }];
  assert.throws(() => parseCityInteractableManifest(JSON.stringify({ cities: [
    { cityId: "solstice", file: "solstice.json" }
  ] }), cities, 200, () => JSON.stringify({ interactables: [
    { id: "scene:" + "c".repeat(32), kind: "door", x: 0, y: 0, z: 0 }
  ] })), /outside every configured world district/);
});
