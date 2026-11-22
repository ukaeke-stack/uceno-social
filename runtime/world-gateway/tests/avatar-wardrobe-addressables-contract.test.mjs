import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const catalog = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarWardrobeCatalog.cs"), "utf8");
const controller = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarWardrobeController.cs"), "utf8");
const sync = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarWardrobeSyncClient.cs"), "utf8");

test("wardrobe catalog exposes a stable Addressables key separately from the legacy Resources path", () => {
  assert.match(catalog, /public string addressableKey;/);
  assert.match(catalog, /public string prefabResourcePath;/);
});

test("wardrobe controller resolves immutable key-plus-version addresses and rejects mismatched catalog keys", () => {
  assert.match(controller, /Addressables\.LoadAssetAsync<GameObject>\(versionedKey\)/);
  assert.match(controller, /expectedAddressableKey \+ "@v"/);
  assert.match(controller, /cachedVersion == assetVersion/);
  assert.match(controller, /TryEquipInternal/);
  assert.match(controller, /ReleasePreviousAddressableHandle/);
  assert.match(controller, /pendingAddressableReleases/);
  assert.match(controller, /foreach \(AsyncOperationHandle<GameObject> handle in pendingAddressableReleases\)/);
  assert.match(controller, /string\.Equals\(item\.addressableKey, expectedAddressableKey/);
  assert.match(controller, /AsyncOperationStatus\.Succeeded/);
  assert.match(controller, /Addressables\.Release\(handle\)/);
  assert.match(controller, /ReleaseAddressableWhenUnused/);
  assert.match(controller, /equippedIds\.ContainsValue\(itemId\)/);
});

test("wardrobe sync uses server-owned item version metadata for equip and saved selections", () => {
  assert.match(sync, /public int assetVersion;/);
  assert.match(sync, /controller\.EquipAddressable\(itemId, owned\.prefabKey, owned\.assetVersion/);
  assert.match(sync, /controller\.EquipAddressable\(owned\.itemId, owned\.prefabKey, owned\.assetVersion/);
  assert.match(sync, /candidate\.itemId == item\.itemId/);
});
