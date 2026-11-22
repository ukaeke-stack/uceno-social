import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const controller = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarWardrobeController.cs"), "utf8");

test("wardrobe garments require valid meshes, matching bind poses, bones and root bones", () => {
  assert.match(controller, /renderer\.sharedMesh\.bindposes\.Length != renderer\.bones\.Length/);
  assert.match(controller, /renderer\.rootBone == null/);
  assert.match(controller, /matching bind poses, bones and a root bone/);\n  assert.match(controller, /float\\.IsNaN\\(value\\) \\|\\| float\\.IsInfinity\\(value\\)/);
});

test("ambiguous duplicate avatar bone names fail closed instead of binding to an arbitrary transform", () => {
  assert.match(controller, /HashSet<string> ambiguousAvatarBones/);
  assert.match(controller, /ambiguousAvatarBones\.Contains\(sourceBone\.name\)/);
  assert.match(controller, /ambiguousAvatarBones\.Contains\(renderer\.rootBone\.name\)/);
  assert.match(controller, /avatarBones\.Remove\(bone\.name\);[\s\S]*?ambiguousAvatarBones\.Add\(bone\.name\)/);
});
