import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const expression = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarSocialExpressionDriver.cs"), "utf8");
const locomotion = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarLocomotionDriver.cs"), "utf8");
const validator = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Editor/HumanoidAnimationLibraryValidator.cs"), "utf8");

test("social gaze layers over the evaluated Humanoid head pose instead of resetting authored clip motion", () => {
  assert.match(expression, /Quaternion animatedHeadRotation = head\.localRotation/);
  assert.match(expression, /animatedHeadRotation \* Quaternion\.Euler\(pitch, yaw, 0f\)/);
  assert.match(expression, /head\.localRotation = animatedHeadRotation \* appliedOffset/);
  assert.match(expression, /lastAppliedHeadRotation/);
  assert.match(expression, /Quaternion\.Inverse\(lastAppliedHeadOffset\)/);
  assert.match(expression, /Quaternion\.Angle\(animatedHeadRotation, lastAppliedHeadRotation\)/);
  assert.doesNotMatch(expression, /headBaseRotation/);
});

test("blink channels are discovered from imported face blendshapes without replacing materials", () => {
  assert.match(expression, /mesh\.GetBlendShapeName\(i\)/);
  assert.match(expression, /shapeName\.Contains\("blink"\)/);
  assert.match(expression, /SetBlendShapeWeight/);
  assert.doesNotMatch(expression, /renderer\.material\s*=|new Material\(/);
});

test("Humanoid driver and Editor gate declare the same required motion set", () => {
  for (const parameter of ["MoveSpeed", "IsSeated", "IsTalking", "Turn", "Wave", "Cheer", "Dance", "Interact"])
    assert.ok(locomotion.includes(parameter), "missing Animator contract parameter: " + parameter);
  for (const clip of ["idle", "walk", "run", "talk", "turn", "wave", "cheer", "dance", "interact", "sit"])
    assert.ok(validator.includes('"' + clip + '"'), "missing imported Humanoid clip requirement: " + clip);
});
