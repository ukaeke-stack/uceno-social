import test from "node:test";
import assert from "node:assert/strict";
import { parseInteractableRegistry } from "../dist/interactable-registry-policy.js";

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
    id: "scene:door-a", districtId: "central", kind: "door",
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
