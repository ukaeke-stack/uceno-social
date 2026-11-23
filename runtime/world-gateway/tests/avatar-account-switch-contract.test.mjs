import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const entry = read("app/api/worlds/entry/route.ts");
const session = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldSessionClient.cs");
const appearance = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarAppearanceSyncClient.cs");
const wardrobe = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarWardrobeSyncClient.cs");

test("world entry binds the Unity session to the authenticated Social account", () => {
  assert.match(entry, /userId: identity\.userId/);
  assert.match(session, /public string UserId \{ get; private set; \}/);
  assert.match(session, /string\.IsNullOrEmpty\(response\.userId\)/);
  assert.match(session, /UserId = response\.userId/);
  assert.match(session, /UserId = null/);
});

test("appearance state and pending saves are reset on account changes", () => {
  assert.match(appearance, /loadedUserId != session\.UserId/);
  assert.match(appearance, /loadedWorldId != session\.WorldId/);
  assert.match(appearance, /sessionGeneration\+\+/);
  assert.match(appearance, /sessionGeneration != requestedGeneration/);
  assert.match(appearance, /pendingSave = false/);
  assert.match(appearance, /profile\.Apply\(AvatarAppearanceProfile\.Palette\.Default\)/);
});

test("wardrobe inventory, queued equipment and rendered garments are cleared on account changes", () => {
  assert.match(wardrobe, /loadedUserId != session\.UserId/);
  assert.match(wardrobe, /loadedWorldId != session\.WorldId/);
  assert.match(wardrobe, /session\.WorldId == requestedWorldId/);
  assert.match(wardrobe, /session\.WorldId != requestedWorldId/);
  assert.match(wardrobe, /inventory = Array\.Empty<WardrobeInventoryItem>\(\)/);
  assert.match(wardrobe, /pendingEquipment\.Clear\(\)/);
  assert.match(wardrobe, /controller\.ApplyEquipped\(Array\.Empty<KeyValuePair<AvatarWardrobeSlot, string>>\(\)\)/);
  assert.match(wardrobe, /private int accountGeneration/);
  assert.match(wardrobe, /accountGeneration\+\+/);
  assert.match(wardrobe, /accountGeneration == requestedGeneration/);
});
