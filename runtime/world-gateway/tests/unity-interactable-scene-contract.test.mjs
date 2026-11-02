import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const sceneBuilder = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/FreeAssetWorldSceneBuilder.cs");
const buildCommand = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/BuildCommand.cs");
const starterBuilder = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/StarterSceneBuilder.cs");
const exporter = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldInteractableRegistryExporter.cs");
const authoring = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldInteractableAuthoring.cs");
const validator = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldDistrictSceneValidator.cs");
const gateway = read("runtime/world-gateway/src/server.ts");
const registryPolicy = read("runtime/world-gateway/src/interactable-registry-policy.ts");
const client = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldObjectInteractor.cs");
const stateComponent = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldInteractable.cs");
const gatewayClient = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs");

test("generated real furniture prefabs are authored as gateway interactables", () => {
  assert.match(sceneBuilder, /PrefabUtility\.InstantiatePrefab\(furniturePrefabs\[1\], parent\)/);
  assert.match(sceneBuilder, /PrefabUtility\.InstantiatePrefab\(furniturePrefabs\[2\], parent\)/);
  assert.match(sceneBuilder, /AddSceneInteractable\(leftSeat, WorldInteractableKind\.Seat\)/);
  assert.match(sceneBuilder, /AddSceneInteractable\(rightSeat, WorldInteractableKind\.Seat\)/);
  assert.match(sceneBuilder, /AddSceneInteractable\(table, WorldInteractableKind\.Furniture\)/);
  assert.match(sceneBuilder, /EnsureTargetingCollider\(target\)/);
  assert.match(sceneBuilder, /box\.isTrigger = false/);
  assert.match(sceneBuilder, /target\.AddComponent<BoxCollider>\(\)/);
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
  assert.match(exporter, /collider\.enabled && !collider\.isTrigger/);
  assert.match(exporter, /marker\.Kind == "door" && !marker\.HasDoorPivot/);
  assert.match(exporter, /GlobalObjectId\.GetGlobalObjectIdSlow/);
  assert.match(gateway, /process\.env\.WORLD_INTERACTABLES_FILE/);
  assert.match(gateway, /loadInteractableRegistry\(\s*raw, WORLD_DISTRICTS, WORLD_BOUNDS,/);
  assert.match(gateway, /WORLD_REQUIRE_INTERACTABLE_REGISTRY === "true"/);
  assert.match(registryPolicy, /function loadInteractableRegistry/);
  assert.match(registryPolicy, /parseInteractableRegistry\(raw, districts, worldBounds\)/);
  assert.match(registryPolicy, /WORLD_REQUIRE_INTERACTABLE_REGISTRY is enabled/);
});

test("editor preflight enforces the same stable ID, collider, hinge and district contract", () => {
  assert.match(validator, /id\.StartsWith\("scene:", StringComparison\.Ordinal\)/);
  assert.match(validator, /id\.Length == 38/);
  assert.match(validator, /collider\.enabled && !collider\.isTrigger/);
  assert.match(validator, /item\.Kind == "door" && !item\.HasDoorPivot/);
  assert.match(validator, /matches != 1/);
});

test("player targeting submits object IDs and applies only server-broadcast state", () => {
  assert.match(client, /hit\.collider\.GetComponentInParent<WorldInteractable>\(\)/);
  assert.match(client, /gateway\.RequestInteraction\(currentTarget\.ObjectId, action\)/);
  assert.match(gatewayClient, /item\.ApplyServerState\(packet\.objectState, packet\.occupantId\)/);
  assert.match(gateway, /type: "object_state", objectId: target\.id/);
});

test("imported prop authoring requires a real hinge child and creates raycastable colliders", () => {
  assert.match(authoring, /Use Selected Child as Parent Door Pivot/);
  assert.match(authoring, /selected != marker\.transform/);
  assert.match(authoring, /FindProperty\("doorPivot"\)\.objectReferenceValue = null/);
  assert.match(authoring, /Add Targeting Collider From Renderers/);
  assert.match(authoring, /renderers\[0\]\.bounds/);
  assert.match(authoring, /box\.isTrigger = false/);
});

test("Unity Build Automation pre-export generates the scene and gateway interactable registry", () => {
  assert.match(buildCommand, /public\s+static\s+void\s+PrepareAndroidBuild\s*\(\)\s*\{[\s\S]*?StarterSceneBuilder\.CreateStarterScene\(\)/);
  assert.match(starterBuilder, /FreeAssetWorldSceneBuilder\.CreateStarterScene\(\)/);
  assert.match(sceneBuilder, /WorldInteractableRegistryExporter\.Export\(false\)/);
  assert.match(exporter, /Path\.Combine\(config,\s*"world-interactables\.json"\)/);
});
