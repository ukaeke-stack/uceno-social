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

test("team reward shares are invariant to contribution input order", () => {
  const forward = [
    { userId: a, points: 7 }, { userId: b, points: 5 }, { userId: c, points: 3 }
  ];
  const reverse = [...forward].reverse();
  const first = calculateTeamRewardShares(997n, forward);
  const second = calculateTeamRewardShares(997n, reverse);
  assert.deepEqual(second, first);
  assert.equal(first.reduce((sum, item) => sum + item.amount, 0n), 997n);
});

test("zero-contribution members receive no share and large rewards remain exact", () => {
  const reward = 1_000_000_000_000_000_000_000_000_000_001n;
  const shares = calculateTeamRewardShares(reward, [
    { userId: a, points: 1 },
    { userId: b, points: 2 },
    { userId: c, points: 0 }
  ]);
  assert.deepEqual(shares.map(item => item.userId), [a, b]);
  assert.equal(shares.reduce((sum, item) => sum + item.amount, 0n), reward);
  assert.equal(shares.find(item => item.userId === c), undefined);
});

test("team reward allocation is stable across all four-member input permutations", () => {
  const members = [
    { userId: a, points: 11 },
    { userId: b, points: 7 },
    { userId: c, points: 4 },
    { userId: "123e4567-e89b-42d3-a456-426614174014", points: 0 }
  ];
  const permute = (items) => items.length <= 1
    ? [items]
    : items.flatMap((item, index) =>
        permute(items.filter((_, other) => other !== index)).map(rest => [item, ...rest]));
  for (const reward of [0n, 1n, 2n, 17n, 997n, 1_000_000_000_000_000_001n]) {
    const expected = calculateTeamRewardShares(reward, members);
    for (const ordering of permute(members)) {
      const actual = calculateTeamRewardShares(reward, ordering);
      assert.deepEqual(actual, expected);
      assert.equal(actual.reduce((sum, share) => sum + share.amount, 0n), reward);
    }
  }
});
