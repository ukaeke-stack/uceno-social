import fs from "node:fs";
import assert from "node:assert/strict";

const root = "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/";
const voice = fs.readFileSync(root + "WorldSpatialVoiceClient.cs", "utf8");
const hud = fs.readFileSync(root + "WorldStatusHud.cs", "utf8");
const motor = fs.readFileSync(root + "PlayerMotor.cs", "utf8");

assert.match(voice, /public bool VoiceEnabled => voiceEnabled/);
assert.match(voice, /public bool LocalMicMuted => localMuted/);
assert.match(voice, /public bool PushToTalkHeld => pushToTalkHeld/);
assert.match(voice, /public bool SetAudioRoute\(string route\)/);
assert.match(voice, /public void SetPushToTalkHeld\(bool held\)/);
assert.doesNotMatch(voice, /private void OnGUI\(\)/, "voice debug overlay must stay out of the client");

assert.match(hud, /DrawVoiceControls\(scale\)/);
assert.match(hud, /ENABLE PROXIMITY VOICE/);
assert.match(hud, /HOLD TO TALK/);
assert.match(hud, /OUTPUT: /);
assert.match(hud, /LEAVE VOICE/);
assert.match(hud, /SetLocalMuted\(!spatialVoice\.LocalMicMuted\)/);
assert.match(hud, /SetPushToTalkHeld\(false\)/);
assert.match(hud, /IsPointerOnHudControl\(Vector2 screenPosition\)/);

assert.match(motor, /WorldStatusHud\.IsPointerOnHudControl\(touch\.position\)/);
console.log("UCENO mobile voice HUD source-contract checks passed.");
