import test from "node:test";
import assert from "node:assert/strict";
import { sameSpatialVoiceRoom, isWithinVoiceRange, isWithinVoiceRangeWithHysteresis, isValidVoiceSignal } from "../dist/voice-policy.js";
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
test("voice room scopes do not accidentally mix public, home, and event contexts", () => {
  const publicRoom = { ...base, homeId: null, eventId: null };
  const homeRoom = { ...base, homeId: "home-a", eventId: null };
  const eventRoom = { ...base, homeId: null, eventId: "event-a" };
  assert.equal(sameSpatialVoiceRoom(publicRoom, homeRoom), false);
  assert.equal(sameSpatialVoiceRoom(publicRoom, eventRoom), false);
  assert.equal(sameSpatialVoiceRoom(homeRoom, eventRoom), false);
  assert.equal(sameSpatialVoiceRoom(homeRoom, { ...homeRoom, x: 23.9 }), true);
});
test("voice proximity rejects non-finite coordinates and invalid distance limits", () => {
  assert.equal(isWithinVoiceRange(base, { ...base, z: NaN }), false);
  assert.equal(isWithinVoiceRange(base, { ...base, y: -Infinity }), false);
  assert.equal(isWithinVoiceRange(base, { ...base, x: 0.1 }, 0), false);
  assert.equal(isWithinVoiceRange(base, { ...base, x: 0.1 }, -1), false);
  assert.equal(isWithinVoiceRange(base, { ...base, x: 0.1 }, Infinity), false);
  assert.equal(isWithinVoiceRange(base, { ...base, x: 24, y: 0, z: 0 }), true);
  assert.equal(isWithinVoiceRange(base, { ...base, x: 24, y: 0.01, z: 0 }), false);
});
test("voice signal validation rejects wrong payload types and overlong boundary values", () => {
  assert.equal(isValidVoiceSignal("offer", 123, null), false);
  assert.equal(isValidVoiceSignal("answer", null, null), false);
  assert.equal(isValidVoiceSignal("candidate", null, 123), false);
  assert.equal(isValidVoiceSignal("candidate", null, ""), false);
  assert.equal(isValidVoiceSignal("offer", "x".repeat(12000), null), true);
  assert.equal(isValidVoiceSignal("offer", "x".repeat(12001), null), false);
  assert.equal(isValidVoiceSignal("candidate", null, "x".repeat(2048)), true);
  assert.equal(isValidVoiceSignal("candidate", null, "x".repeat(2049)), false);
});

test("voice proximity hysteresis stabilizes room membership at the edge", () => {
  assert.equal(isWithinVoiceRangeWithHysteresis(base, { ...base, x: 21.9 }, false), true);
  assert.equal(isWithinVoiceRangeWithHysteresis(base, { ...base, x: 22.1 }, false), false);
  assert.equal(isWithinVoiceRangeWithHysteresis(base, { ...base, x: 24.5 }, true), true);
  assert.equal(isWithinVoiceRangeWithHysteresis(base, { ...base, x: 26.1 }, true), false);
  assert.equal(isWithinVoiceRangeWithHysteresis(base, { ...base, x: 24 }, false), false);
  assert.equal(isWithinVoiceRangeWithHysteresis(base, { ...base, x: 24 }, true), true);
  assert.equal(isWithinVoiceRangeWithHysteresis(base, { ...base, x: 23 }, false, 24, 22), false);
  assert.equal(isWithinVoiceRangeWithHysteresis(base, { ...base, x: 23 }, false, NaN, 26), false);
});
