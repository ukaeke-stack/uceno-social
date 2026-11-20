import test from "node:test";
import assert from "node:assert/strict";
import { resolveInteraction, isInteractionAllowed } from "../dist/interaction-policy.js";

test("door interaction toggles only between open and closed", () => {
  assert.deepEqual(resolveInteraction({ kind: "door", state: "closed", occupantId: null }, "user-a", "toggle"),
    { ok: true, state: "open", occupantId: null, seated: false });
  assert.deepEqual(resolveInteraction({ kind: "door", state: "open", occupantId: null }, "user-a", "toggle"),
    { ok: true, state: "closed", occupantId: null, seated: false });
  assert.equal(resolveInteraction({ kind: "door", state: "closed", occupantId: null }, "user-a", "use").ok, false);
});

test("object use toggles its active state and rejects door/seat actions", () => {
  assert.equal(resolveInteraction({ kind: "object", state: "idle", occupantId: null }, "user-a", "use").ok, true);
  assert.deepEqual(resolveInteraction({ kind: "object", state: "idle", occupantId: null }, "user-a", "use"),
    { ok: true, state: "active", occupantId: null, seated: false });
  assert.equal(resolveInteraction({ kind: "object", state: "active", occupantId: null }, "user-a", "use").ok, true);
  assert.equal(resolveInteraction({ kind: "object", state: "idle", occupantId: null }, "user-a", "sit").ok, false);
});

test("a seat cannot be occupied by two different users", () => {
  const free = { kind: "seat", state: "available", occupantId: null };
  assert.deepEqual(resolveInteraction(free, "user-a", "sit"),
    { ok: true, state: "occupied", occupantId: "user-a", seated: true });
  assert.deepEqual(resolveInteraction({ ...free, state: "occupied", occupantId: "user-a" }, "user-b", "sit"),
    { ok: false, code: "seat_occupied" });
});

test("only the current seat occupant can stand", () => {
  const occupied = { kind: "seat", state: "occupied", occupantId: "user-a" };
  assert.deepEqual(resolveInteraction(occupied, "user-a", "stand"),
    { ok: true, state: "available", occupantId: null, seated: false });
  assert.deepEqual(resolveInteraction(occupied, "user-b", "stand"),
    { ok: false, code: "seat_not_occupied_by_player" });
});

test("rejects missing identity and unsupported actions", () => {
  const door = { kind: "door", state: "closed", occupantId: null };
  assert.deepEqual(resolveInteraction(door, "", "toggle"),
    { ok: false, code: "unknown_or_invalid_object" });
  assert.deepEqual(resolveInteraction(door, "user-a", "delete"),
    { ok: false, code: "unknown_or_invalid_object" });
});

test("interaction reach and cooldown reject impossible or spammed requests", () => {
  assert.equal(isInteractionAllowed(4.25, 250), true);
  assert.equal(isInteractionAllowed(4.251, 250), false);
  assert.equal(isInteractionAllowed(1, 249), false);
  assert.equal(isInteractionAllowed(0, 250), true);
  assert.equal(isInteractionAllowed(-1, 250), false);
  assert.equal(isInteractionAllowed(Infinity, 250), false);
  assert.equal(isInteractionAllowed(1, NaN), false);
  assert.equal(isInteractionAllowed(1, 250, 0, 250), false);
});

test("furniture uses the generic active/idle state transition", () => {
  assert.deepEqual(resolveInteraction({ kind: "furniture", state: "idle", occupantId: null }, "user-a", "use"),
    { ok: true, state: "active", occupantId: null, seated: false });
});

test("vehicle use toggles engine state without persisting driver occupancy", () => {
  assert.deepEqual(resolveInteraction({ kind: "vehicle", state: "engine_off", occupantId: null }, "user-a", "use"),
    { ok: true, state: "engine_on", occupantId: null, seated: false });
  assert.deepEqual(resolveInteraction({ kind: "vehicle", state: "engine_on", occupantId: null }, "user-a", "use"),
    { ok: true, state: "engine_off", occupantId: null, seated: false });
});
