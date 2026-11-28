import test from "node:test";
import assert from "node:assert/strict";
import { districtObjectKey, isPersistentObjectState, defaultPersistentObjectState } from "../dist/district-object-policy.js";

test("object persistence keys are scoped by world, district and stable object id", () => {
  assert.notEqual(districtObjectKey("w1", "north", "door-1"), districtObjectKey("w1", "south", "door-1"));
  assert.notEqual(districtObjectKey("w1", "north", "door-1"), districtObjectKey("w2", "north", "door-1"));
});

test("only valid durable states are accepted for each object kind", () => {
  assert.equal(isPersistentObjectState("door", "open"), true);
  assert.equal(isPersistentObjectState("door", "active"), false);
  assert.equal(isPersistentObjectState("vehicle", "engine_on"), true);
  assert.equal(isPersistentObjectState("vehicle", "open"), false);
  assert.equal(isPersistentObjectState("furniture", "active"), true);
  assert.equal(isPersistentObjectState("object", "idle"), true);
  assert.equal(isPersistentObjectState("object", "occupied"), false);
});

test("defaults are deterministic and seats are not represented by this durable policy", () => {
  assert.equal(defaultPersistentObjectState("door"), "closed");
  assert.equal(defaultPersistentObjectState("vehicle"), "engine_off");
  assert.equal(defaultPersistentObjectState("furniture"), "idle");
});
