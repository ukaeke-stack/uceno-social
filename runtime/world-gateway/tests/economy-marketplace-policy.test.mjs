import test from "node:test";
import assert from "node:assert/strict";
import { canReleaseMarketplaceCheckout, validateCreditMutation } from "../dist/economy-marketplace-policy.js";

const base = {
  amount: 100,
  idempotencyKey: "credit-operation-0001",
  serverAuthorized: true
};

test("activity rewards can only mint Earned Credits", () => {
  assert.equal(validateCreditMutation({ ...base, bucket: "earned", reason: "activity_reward" }).allowed, true);
  assert.deepEqual(validateCreditMutation({ ...base, bucket: "purchased", reason: "activity_reward" }),
    { allowed: false, reason: "activity_rewards_must_be_earned_credits" });
});

test("top-ups require Purchased Credits and verified provider transactions", () => {
  assert.equal(validateCreditMutation({ ...base, bucket: "purchased", reason: "top_up", providerVerified: true }).allowed, true);
  assert.deepEqual(validateCreditMutation({ ...base, bucket: "purchased", reason: "top_up" }),
    { allowed: false, reason: "provider_transaction_not_verified" });
});

test("invalid amounts, missing authorization and weak idempotency keys fail closed", () => {
  assert.equal(validateCreditMutation({ ...base, amount: 0, bucket: "earned", reason: "activity_reward" }).allowed, false);
  assert.equal(validateCreditMutation({ ...base, serverAuthorized: false, bucket: "earned", reason: "activity_reward" }).allowed, false);
  assert.equal(validateCreditMutation({ ...base, idempotencyKey: "x", bucket: "earned", reason: "activity_reward" }).allowed, false);
});

test("runtime JSON shape, enum and flag validation fails closed", () => {
  for (const malformed of [null, undefined, [], "mutation", 12])
    assert.equal(validateCreditMutation(malformed).allowed, false);
  assert.equal(validateCreditMutation({ ...base, bucket: "bonus", reason: "activity_reward" }).allowed, false);
  assert.equal(validateCreditMutation({ ...base, bucket: "earned", reason: "unknown" }).allowed, false);
  assert.equal(validateCreditMutation({ ...base, bucket: "earned", reason: "activity_reward", serverAuthorized: "true" }).allowed, false);
  assert.equal(validateCreditMutation({ ...base, bucket: "earned", reason: "activity_reward", providerVerified: 1 }).allowed, false);
});

test("marketplace checkout stays blocked until every financial release gate is complete", () => {
  const incomplete = {
    escrowEnabled: false,
    sellerSettlementImplemented: false,
    refundFlowImplemented: false,
    disputeResolutionImplemented: false,
    deliveryVerificationImplemented: false
  };
  assert.equal(canReleaseMarketplaceCheckout(incomplete), false);
  assert.equal(canReleaseMarketplaceCheckout({ ...incomplete, escrowEnabled: true }), false);
  assert.equal(canReleaseMarketplaceCheckout(null), false);
  assert.equal(canReleaseMarketplaceCheckout({ ...incomplete, sellerSettlementImplemented: "true" }), false);
  assert.equal(canReleaseMarketplaceCheckout({
    escrowEnabled: true,
    sellerSettlementImplemented: true,
    refundFlowImplemented: true,
    disputeResolutionImplemented: true,
    deliveryVerificationImplemented: true
  }), true);
});
