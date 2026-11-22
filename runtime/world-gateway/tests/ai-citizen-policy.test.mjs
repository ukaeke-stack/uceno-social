import test from "node:test";
import assert from "node:assert/strict";
import { decideCitizenAction } from "../dist/ai-citizen-policy.js";

const base = {
  disclosedAsAi: true,
  userConsentedToInteraction: true,
  userBlockedCitizen: false,
  operatorDisabled: false,
  withinWorldBounds: true,
  memoryRetentionDays: 7
};

test("AI citizen requires disclosure, consent for active interactions, and respects blocks", () => {
  assert.equal(decideCitizenAction({ ...base, disclosedAsAi: false, action: "speak" }).allowed, false);
  assert.equal(decideCitizenAction({ ...base, userBlockedCitizen: true, action: "speak" }).allowed, false);
  assert.equal(decideCitizenAction({ ...base, userConsentedToInteraction: false, action: "navigate" }).allowed, false);
  assert.equal(decideCitizenAction({ ...base, action: "speak" }).allowed, true);
});

test("AI citizens cannot autonomously transact, transfer credits, alter accounts or moderate", () => {
  for (const action of ["purchase", "transfer_credits", "change_account", "moderate_user"] as const) {
    assert.deepEqual(decideCitizenAction({ ...base, action }), {
      allowed: false, reason: "human_authorization_required"
    });
  }
});

test("AI citizen memory is bounded to an integer 0-30 day retention", () => {
  assert.equal(decideCitizenAction({ ...base, action: "remember", memoryRetentionDays: 30 }).allowed, true);
  assert.equal(decideCitizenAction({ ...base, action: "remember", memoryRetentionDays: 31 }).allowed, false);
  assert.equal(decideCitizenAction({ ...base, action: "remember", memoryRetentionDays: -1 }).allowed, false);
});

test("operator shutdown and world bounds fail closed", () => {
  assert.equal(decideCitizenAction({ ...base, operatorDisabled: true, action: "speak" }).allowed, false);
  assert.equal(decideCitizenAction({ ...base, withinWorldBounds: false, action: "speak" }).allowed, false);
});
