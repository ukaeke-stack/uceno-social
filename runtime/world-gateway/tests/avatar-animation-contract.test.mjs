import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const server = read("../src/server.ts");
const driver = read("../../../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarLocomotionDriver.cs");
const builder = read("../../../unity/UCENOVirtualWorld/Assets/UCENO/Editor/FreeAssetWorldSceneBuilder.cs");
const importer = read("../../../unity/UCENOVirtualWorld/Assets/UCENO/Editor/FreeAssetModelPostprocessor.cs");
const voice = read("../../../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldSpatialVoiceClient.cs");
const presence = read("../../../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldPresenceClient.cs");
const validator = read("../../../unity/UCENOVirtualWorld/Assets/UCENO/Editor/HumanoidAnimationLibraryValidator.cs");
const wardrobe = read("../../../unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarWardrobeController.cs");

test("gateway accepts only the supported imported humanoid gesture states", () => {
  for (const gesture of ["none", "wave", "cheer", "dance", "talk", "turn", "interact"])
    assert.ok(server.includes('"' + gesture + '"'));
});

test("avatar builder requires every imported and retargeted animation clip", () => {
  for (const clip of ["idle", "walk", "run", "talk", "turn", "wave", "cheer", "dance", "interact", "sit"])
    assert.ok(builder.includes('FindClip(clips, "' + clip + '")'), "missing required clip " + clip);
  assert.ok(builder.includes("HumanoidAnimationLibraryValidator.Validate()"));
  assert.ok(builder.includes("AssetDatabase.LoadAllAssetsAtPath(AvatarPath)"));
  assert.ok(builder.includes("CreateHumanoidController"));
  assert.ok(builder.includes("AddGestureState"));
});

test("runtime humanoid locomotion has no procedural gait fallback", () => {
  assert.ok(driver.includes("runtimeAnimatorController == null"));
  assert.ok(driver.includes("SetFloat(MoveSpeedHash"));
  assert.ok(driver.includes("SetTalking(bool talking)"));
  assert.ok(!driver.includes("Mathf.Sin(cycle)"));
  assert.ok(!driver.includes("ApplyDancePose"));
});

test("talk animation follows real local microphone transmit state", () => {
  assert.ok(voice.includes("LocalTransmitChanged"));
  assert.ok(voice.includes("shouldTransmit != lastLocalTransmit"));
  assert.ok(driver.includes("WorldSpatialVoiceClient.LocalTransmitChanged += SetTalking"));
  assert.ok(driver.includes("if (voiceEventSubscribed || motor == null) return"));
  assert.ok(driver.includes("private void BindVoiceEvents()"));
  assert.ok(driver.includes("private void UnbindVoiceEvents()"));
  assert.ok(driver.includes("WorldSpatialVoiceClient.LocalTransmitChanged -= SetTalking"));
  assert.ok(driver.includes("BindVoiceEvents();"));
  assert.ok(presence.includes("ApplyRemoteState(normalizedSpeed"));
});

test("animation FBXs must be Humanoid and retargeted to the UCENO base Avatar", () => {
  assert.ok(importer.includes("ModelImporterAvatarSetup.CopyFromOther"));
  assert.ok(importer.includes("sourceAvatar = sourceAvatar"));
  assert.ok(validator.includes("sourceAvatar != baseAvatar"));
  assert.ok(validator.includes("Assets/UCENO/Animations/Imported"));
});

test("wardrobe binding rejects ambiguous skeletons and malformed bind poses", () => {
  assert.ok(wardrobe.includes("ambiguousAvatarBoneNames"));
  assert.ok(wardrobe.includes("Avatar rig contains duplicate bone names"));
  assert.ok(wardrobe.includes("bindposes.Length != renderer.bones.Length"));
  assert.ok(wardrobe.includes("float.IsNaN(value) || float.IsInfinity(value)"));
  assert.ok(wardrobe.includes("Mathf.Abs(bindpose.determinant)"));
  assert.ok(wardrobe.includes("renderer.bones = mappedBones"));
});
