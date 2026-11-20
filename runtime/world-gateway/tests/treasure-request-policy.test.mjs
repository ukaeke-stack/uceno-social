import test from "node:test";
import assert from "node:assert/strict";
import { consumeTreasureRequestBudget } from "../dist/treasure-request-policy.js";

test("treasure request budget allows only the configured burst in a window", () => {
  const budget = { windowStartedAt: 1_000, requestCount: 0 };
  for (let i = 0; i < 8; i++) assert.equal(consumeTreasureRequestBudget(budget, 1_000 + i), true);
  assert.equal(consumeTreasureRequestBudget(budget, 1_008), false);
  assert.equal(budget.requestCount, 8);
});

test("treasure request budget resets after its window and on clock rollback", () => {
  const budget = { windowStartedAt: 5_000, requestCount: 8 };
  assert.equal(consumeTreasureRequestBudget(budget, 15_000), true);
  assert.equal(budget.requestCount, 1);
  assert.equal(consumeTreasureRequestBudget(budget, 14_999), true);
  assert.equal(budget.requestCount, 1);
});

test("invalid time or budget configuration fails closed", () => {
  const budget = { windowStartedAt: 1, requestCount: 0 };
  assert.equal(consumeTreasureRequestBudget(budget, Number.NaN), false);
  assert.equal(consumeTreasureRequestBudget(budget, 2, 0), false);
});
