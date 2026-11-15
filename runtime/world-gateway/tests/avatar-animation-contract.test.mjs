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

test("gateway accepts only the supported imported humanoid gesture states", () => {
  for (const gesture of ["none", "wave", "cheer", "dance", "talk", "turn", "interact"])
    assert.match(server, new RegExp('"' + gesture + '"'));
});

test("avatar builder requires every imported and retargeted animation clip", () => {
  for (const clip of ["idle", "walk", "run", "talk", "turn", "wave", "cheer", "dance", "interact", "sit"])
    assert.ok(builder.includes('FindClip(clips, "' + clip + '")'), "missing required clip " + clip);
  assert.match(builder, /HumanoidAnimationLibraryValidator\.Validate\(\)/);
  assert.match(builder, /CreateHumanoidController/);
  assert.match(builder, /AddGestureState/);
});

test("runtime humanoid locomotion has no procedural gait fallback", () => {
  assert.match(driver, /runtimeAnimatorController == null/);
  assert.match(driver, /SetFloat\(MoveSpeedHash/);
  assert.match(driver, /SetTalking\(bool talking\)/);
  assert.doesNotMatch(driver, /Mathf\.Sin\(cycle\)/);
  assert.doesNotMatch(driver, /ApplyDancePose/);
});

test("talk animation follows real local microphone transmit state", () => {
  assert.match(voice, /LocalTransmitChanged/);
  assert.match(voice, /shouldTransmit != lastLocalTransmit/);
  assert.match(driver, /WorldSpatialVoiceClient\.LocalTransmitChanged \+= SetTalking/);
  assert.match(driver, /WorldSpatialVoiceClient\.LocalTransmitChanged -= SetTalking/);
  assert.match(presence, /ApplyRemoteState\(normalizedSpeed/);
});

test("animation FBXs must be Humanoid and retargeted to the UCENO base Avatar", () => {
  assert.match(importer, /ModelImporterAvatarSetup\.CopyFromOther/);
  assert.match(importer, /sourceAvatar = sourceAvatar/);
  assert.match(validator, /sourceAvatar != baseAvatar/);
  assert.match(validator, /Assets\/UCENO\/Animations\/Imported/);
});
