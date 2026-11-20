import test from "node:test";
import assert from "node:assert/strict";
import { calculateTeamRewardShares } from "../dist/team-treasure-policy.js";

const a = "123e4567-e89b-42d3-a456-426614174011";
const b = "123e4567-e89b-42d3-a456-426614174012";
const c = "123e4567-e89b-42d3-a456-426614174013";

test("team reward shares are proportional and conserve the entire reward", () => {
  const shares = calculateTeamRewardShares(101n, [
    { userId: a, points: 5 }, { userId: b, points: 3 }, { userId: c, points: 2 }
  ]);
  assert.equal(shares.reduce((sum, item) => sum + item.amount, 0n), 101n);
  assert.deepEqual(shares.map(item => item.amount), [51n, 30n, 20n]);
});

test("team reward remainder assignment is deterministic", () => {
  const input = [{ userId: c, points: 1 }, { userId: b, points: 1 }, { userId: a, points: 1 }];
  assert.deepEqual(calculateTeamRewardShares(2n, input), calculateTeamRewardShares(2n, input));
  assert.equal(calculateTeamRewardShares(2n, input).reduce((sum, item) => sum + item.amount, 0n), 2n);
});

test("team rewards reject invalid or contribution-free membership", () => {
  assert.throws(() => calculateTeamRewardShares(-1n, [{ userId: a, points: 1 }, { userId: b, points: 1 }]));
  assert.throws(() => calculateTeamRewardShares(10n, [{ userId: a, points: 0 }, { userId: b, points: 0 }]));
  assert.throws(() => calculateTeamRewardShares(10n, [{ userId: a, points: 1 }, { userId: a, points: 2 }]));
});

test("team reward remainder follows fractional share rather than simply highest contribution", () => {
  const shares = calculateTeamRewardShares(5n, [
    { userId: a, points: 4 }, { userId: b, points: 3 }, { userId: c, points: 3 }
  ]);
  assert.deepEqual(shares.map(item => item.amount), [2n, 2n, 1n]);
  assert.equal(shares.reduce((sum, item) => sum + item.amount, 0n), 5n);
});
