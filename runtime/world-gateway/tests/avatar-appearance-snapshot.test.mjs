import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const gateway = read("runtime/world-gateway/src/server.ts");
const unityClient = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs");

test("account appearance is loaded into the authoritative player session", () => {
  assert.match(gateway, /SELECT appearance\s+FROM user_avatar_appearances\s+WHERE user_id = \$\{userId\}::uuid\s+LIMIT 1/);
  assert.match(gateway, /const avatarAppearance = appearanceRows\[0\]\?\.appearance \?\? \{\}/);
  assert.match(gateway, /homeId: null, homeAnchor: null, eventId: null, avatarAppearance,/);
});

test("every movement snapshot branch carries account appearance", () => {
  const snapshotPushes = [...gateway.matchAll(/snapshots\.push\(\{([\s\S]*?)\}\);/g)];
  assert.equal(snapshotPushes.length, 2, "expected both movement snapshot branches to remain explicit");
  for (const [index, match] of snapshotPushes.entries()) {
    assert.match(match[1], /appearance:\s*p\.avatarAppearance/, `snapshot branch ${index + 1} omitted avatar appearance`);
  }
});

test("Unity remote avatars decode and apply all five account palette channels", () => {
  assert.match(unityClient, /public GatewayAvatarAppearanceState appearance;/);
  for (const channel of ["skin", "hair", "top", "trousers", "shoes"]) {
    assert.match(unityClient, new RegExp(`public string ${channel};`));
    assert.match(unityClient, new RegExp(`ColorUtility\\.TryParseHtmlString\\(state\\.appearance\\.${channel}`));
  }
  assert.match(unityClient, /remote\.appearance\.Apply\(palette\)/);
  assert.match(unityClient, /remote\.appearanceSignature = appearanceSignature/);
});
