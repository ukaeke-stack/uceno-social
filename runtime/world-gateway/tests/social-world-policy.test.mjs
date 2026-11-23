import test from "node:test";
import assert from "node:assert/strict";
import { canUseSocialWorldCapability } from "../dist/social-world-policy.js";

const relationship = {
  viewerId: "viewer",
  targetId: "target",
  isBlocked: false,
  isMutuallyConnected: false,
  followsTarget: true
};

test("world messaging remains distinct from mutual-connection calling", () => {
  assert.equal(canUseSocialWorldCapability(relationship, "send_message"), true);
  assert.equal(canUseSocialWorldCapability(relationship, "start_call"), false);
  assert.equal(canUseSocialWorldCapability({ ...relationship, isMutuallyConnected: true }, "start_call"), true);
});

test("blocks deny all cross-account world capabilities", () => {
  for (const capability of ["view_public_presence", "send_message", "start_call", "enter_private_home"])
    assert.equal(canUseSocialWorldCapability({ ...relationship, isBlocked: true }, capability, true), false);
});

test("private homes require an explicit invitation", () => {
  assert.equal(canUseSocialWorldCapability(relationship, "enter_private_home"), false);
  assert.equal(canUseSocialWorldCapability(relationship, "enter_private_home", true), true);
});

test("self and malformed identities are denied", () => {
  assert.equal(canUseSocialWorldCapability({ ...relationship, targetId: "viewer" }, "send_message"), false);
  assert.equal(canUseSocialWorldCapability({ ...relationship, viewerId: "" }, "send_message"), false);
});

test("runtime validation rejects unknown capabilities and malformed relationship flags", () => {
  assert.equal(canUseSocialWorldCapability(relationship, "grant_admin"), false);
  assert.equal(canUseSocialWorldCapability({ ...relationship, isBlocked: "false" }, "send_message"), false);
  assert.equal(canUseSocialWorldCapability({ ...relationship, followsTarget: undefined }, "send_message"), false);
  assert.equal(canUseSocialWorldCapability(null, "send_message"), false);
  assert.equal(canUseSocialWorldCapability(relationship, "enter_private_home", "true"), false);
});
