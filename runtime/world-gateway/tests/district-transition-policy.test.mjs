import test from "node:test";
import assert from "node:assert/strict";
import {
  DISTRICT_TRANSITION_TIMEOUT_MS, isDistrictTransitionExpired,
  matchesDistrictTransition, planDistrictTransition
} from "../dist/district-transition-policy.js";

const pending = { id: "central", contentLabel: "central-label", nonce: "nonce-123", createdAt: 1000 };
const target = (id) => ({ id, contentLabel: id + "-label" });
const nonce = (value) => () => value;

test("matches only the exact district and nonce", () => {
  assert.equal(matchesDistrictTransition(pending, "central", "nonce-123"), true);
  assert.equal(matchesDistrictTransition(pending, "north", "nonce-123"), false);
  assert.equal(matchesDistrictTransition(pending, "central", "old-nonce"), false);
  assert.equal(matchesDistrictTransition(null, "central", "nonce-123"), false);
});
test("expires at the timeout boundary and rejects malformed clock inputs", () => {
  assert.equal(isDistrictTransitionExpired(pending, 1000 + DISTRICT_TRANSITION_TIMEOUT_MS - 1), false);
  assert.equal(isDistrictTransitionExpired(pending, 1000 + DISTRICT_TRANSITION_TIMEOUT_MS), true);
  assert.equal(isDistrictTransitionExpired(pending, Number.NaN), false);
  assert.equal(isDistrictTransitionExpired({ ...pending, createdAt: Number.NaN }, 100000), false);
});
test("starts a new transition and cancels the previous request as superseded", () => {
  const plan = planDistrictTransition("south", pending, target("north"), 2000, nonce("new-nonce"));
  assert.deepEqual(plan.cancellation, { transition: pending, reason: "superseded" });
  assert.equal(plan.pending.nonce, "new-nonce");
  assert.deepEqual(plan.request, plan.pending);
});
test("does not issue duplicate requests while the same district is pending", () => {
  const plan = planDistrictTransition("south", pending, target("central"), 2000, () => {
    throw new Error("must not generate a second nonce");
  });
  assert.equal(plan.pending, pending);
  assert.equal(plan.request, null);
  assert.equal(plan.cancellation, null);
});
test("rapid A-to-B-to-A cancels B and exits no active district", () => {
  const first = planDistrictTransition("south", null, target("central"), 2000, nonce("b"));
  const returned = planDistrictTransition("south", first.pending, target("south"), 2100, nonce("unused"));
  assert.deepEqual(returned.cancellation, { transition: first.pending, reason: "returned_to_active_district" });
  assert.equal(returned.pending, null);
  assert.equal(returned.request, null);
});
test("leaving all districts cancels pending content and exits the active district", () => {
  const plan = planDistrictTransition("south", pending, null, 2000, nonce("unused"));
  assert.deepEqual(plan.cancellation, { transition: pending, reason: "left_boundary" });
  assert.equal(plan.exitedDistrictId, "south");
  assert.equal(plan.pending, null);
});
test("expired request is cancelled before a fresh request is created", () => {
  const plan = planDistrictTransition("south", pending, target("north"),
    pending.createdAt + DISTRICT_TRANSITION_TIMEOUT_MS, nonce("fresh"));
  assert.deepEqual(plan.cancellation, { transition: pending, reason: "transition_timeout" });
  assert.equal(plan.pending.nonce, "fresh");
  assert.equal(plan.request, plan.pending);
});
