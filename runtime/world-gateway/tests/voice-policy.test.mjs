import test from "node:test";
import assert from "node:assert/strict";
import { sameSpatialVoiceRoom, isWithinVoiceRange, isValidVoiceSignal } from "../dist/voice-policy.js";
const base = { worldId: "world-a", homeId: null, eventId: null, x: 0, y: 0, z: 0 };
test("voice room scope requires the same world and spatial destination", () => {
  assert.equal(sameSpatialVoiceRoom(base, { ...base, x: 10 }), true);
  assert.equal(sameSpatialVoiceRoom(base, { ...base, worldId: "world-b" }), false);
  assert.equal(sameSpatialVoiceRoom(base, { ...base, homeId: "home-a" }), false);
  assert.equal(sameSpatialVoiceRoom({ ...base, homeId: "home-a" }, { ...base, homeId: "home-b" }), false);
  assert.equal(sameSpatialVoiceRoom({ ...base, eventId: "event-a" }, { ...base, eventId: "event-b" }), false);
});
test("voice proximity is bounded in three dimensions", () => {
  assert.equal(isWithinVoiceRange(base, { ...base, x: 24 }), true);
  assert.equal(isWithinVoiceRange(base, { ...base, x: 24.01 }), false);
  assert.equal(isWithinVoiceRange(base, { ...base, y: 25 }), false);
  assert.equal(isWithinVoiceRange(base, { ...base, x: Infinity }), false);
});
test("voice signaling accepts only bounded SDP and ICE candidate payloads", () => {
  assert.equal(isValidVoiceSignal("offer", "v=0", null), true);
  assert.equal(isValidVoiceSignal("answer", "v=0", null), true);
  assert.equal(isValidVoiceSignal("candidate", null, "candidate:abc"), true);
  assert.equal(isValidVoiceSignal("offer", "x".repeat(12001), null), false);
  assert.equal(isValidVoiceSignal("candidate", null, "x".repeat(2049)), false);
  assert.equal(isValidVoiceSignal("unknown", "v=0", null), false);
  assert.equal(isValidVoiceSignal("offer", "", null), false);
});