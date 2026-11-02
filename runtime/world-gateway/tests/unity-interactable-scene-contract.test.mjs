import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const sceneBuilder = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/FreeAssetWorldSceneBuilder.cs");
const exporter = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldInteractableRegistryExporter.cs");
const validator = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldDistrictSceneValidator.cs");
const gateway = read("runtime/world-gateway/src/server.ts");
const client = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldObjectInteractor.cs");
const stateComponent = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldInteractable.cs");
const gatewayClient = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs");

test("generated real furniture prefabs are authored as gateway interactables", () => {
  assert.match(sceneBuilder, /PrefabUtility\.InstantiatePrefab\(furniturePrefabs\[1\], parent\)/);
  assert.match(sceneBuilder, /PrefabUtility\.InstantiatePrefab\(furniturePrefabs\[2\], parent\)/);
  assert.match(sceneBuilder, /AddSceneInteractable\(leftSeat, WorldInteractableKind\.Seat\)/);
  assert.match(sceneBuilder, /AddSceneInteractable\(rightSeat, WorldInteractableKind\.Seat\)/);
  assert.match(sceneBuilder, /AddSceneInteractable\(table, WorldInteractableKind\.Furniture\)/);
});

test("door marker is attached to its real hinge root and uses the hinged leaf pivot", () => {
  assert.match(sceneBuilder, /WorldInteractable doorMarker = AddSceneInteractable\(doorway, WorldInteractableKind\.Door\)/);
  assert.match(sceneBuilder, /doorData\.FindProperty\("doorPivot"\)\.objectReferenceValue = hinge\.transform/);
  assert.match(stateComponent, /doorPivot\.localRotation = Quaternion\.RotateTowards/);
  assert.match(stateComponent, /targetRotation = state == "open"/);
});

test("scene export creates the exact file and schema loaded by the authoritative gateway", () => {
  assert.match(sceneBuilder, /WorldInteractableRegistryExporter\.Export\(false\)/);
  assert.match(exporter, /world-interactables\.json/);
  assert.match(exporter, /interactables = entries\.ToArray\(\)/);
  assert.match(exporter, /GetComponentsInChildren<Collider>\(true\)/);
  assert.match(exporter, /marker\.Kind == "door" && !marker\.HasDoorPivot/);
  assert.match(exporter, /GlobalObjectId\.GetGlobalObjectIdSlow/);
  assert.match(gateway, /process\.env\.WORLD_INTERACTABLES_FILE/);
  assert.match(gateway, /parseInteractableRegistry\(raw, WORLD_DISTRICTS, WORLD_BOUNDS\)/);
});

test("editor preflight enforces the same stable ID, collider, hinge and district contract", () => {
  assert.match(validator, /id\.StartsWith\("scene:", StringComparison\.Ordinal\)/);
  assert.match(validator, /id\.Length == 38/);
  assert.match(validator, /item\.GetComponentsInChildren<Collider>\(true\)\.Length == 0/);
  assert.match(validator, /item\.Kind == "door" && !item\.HasDoorPivot/);
  assert.match(validator, /matches != 1/);
});

test("player targeting submits object IDs and applies only server-broadcast state", () => {
  assert.match(client, /hit\.collider\.GetComponentInParent<WorldInteractable>\(\)/);
  assert.match(client, /gateway\.RequestInteraction\(currentTarget\.ObjectId, action\)/);
  assert.match(gatewayClient, /item\.ApplyServerState\(packet\.objectState, packet\.occupantId\)/);
  assert.match(gateway, /type: "object_state", objectId: target\.id/);
});
