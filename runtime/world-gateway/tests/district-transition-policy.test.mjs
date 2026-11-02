import test from "node:test";
import assert from "node:assert/strict";
import { DISTRICT_TRANSITION_TIMEOUT_MS, isDistrictTransitionExpired, matchesDistrictTransition } from "../dist/district-transition-policy.js";

const pending = { id: "central", contentLabel: "world-city-district-central", nonce: "nonce-123", createdAt: 1000 };

test("matches only the exact district and nonce; rejects stale acknowledgements and replay", () => {
  assert.equal(matchesDistrictTransition(pending, "central", "nonce-123"), true);
  assert.equal(matchesDistrictTransition(pending, "north", "nonce-123"), false);
  assert.equal(matchesDistrictTransition(pending, "central", "old-nonce"), false);
  assert.equal(matchesDistrictTransition(null, "central", "nonce-123"), false);
  assert.equal(matchesDistrictTransition(pending, {}, "nonce-123"), false);
});

test("expires transitions at the exact timeout boundary", () => {
  assert.equal(isDistrictTransitionExpired(pending, 1000 + DISTRICT_TRANSITION_TIMEOUT_MS - 1), false);
  assert.equal(isDistrictTransitionExpired(pending, 1000 + DISTRICT_TRANSITION_TIMEOUT_MS), true);
  assert.equal(isDistrictTransitionExpired(null, 100000), false);
});

test("does not expire on non-finite clock values or malformed creation times", () => {
  assert.equal(isDistrictTransitionExpired(pending, Number.NaN), false);
  assert.equal(isDistrictTransitionExpired({ ...pending, createdAt: Number.NaN }, 100000), false);
});
