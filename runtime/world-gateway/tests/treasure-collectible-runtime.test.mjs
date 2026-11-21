import test from "node:test";
import assert from "node:assert/strict";
import { grantTreasureCollectibles } from "../dist/treasure-collectible-runtime.js";

const id = "123e4567-e89b-42d3-a456-426614174011";
const user = "123e4567-e89b-42d3-a456-426614174012";
const hunt = "123e4567-e89b-42d3-a456-426614174013";

function fakeTx({ minted = "0", maxSupply = "1", existing = false, inserted = true } = {}) {
  const calls = [];
  return {
    calls,
    async unsafe(query, params) {
      calls.push({ query, params });
      if (query.includes("FROM virtual_world_treasure_reward_items")) return [{
        id, code: "rare-badge", displayName: "Rare Badge", category: "badge",
        rarity: "rare", maxSupply, mintedCount: minted, quantity: 1
      }];
      if (query.includes("FROM virtual_world_user_collectibles")) return existing ? [{ id: 1 }] : [];
      if (query.includes("INSERT INTO virtual_world_user_collectibles")) return inserted ? [{ id: 1 }] : [];
      return [];
    }
  };
}

test("collectible grant records inventory and increments minted supply once", async () => {
  const tx = fakeTx();
  const result = await grantTreasureCollectibles(tx, hunt, user);
  assert.equal(result.length, 1);
  assert.equal(result[0].code, "rare-badge");
  assert.equal(tx.calls.filter(call => call.query.includes("UPDATE virtual_world_collectible_catalog")).length, 1);
});

test("collectible grant does not exceed a finite catalog supply", async () => {
  const tx = fakeTx({ minted: "1", maxSupply: "1" });
  assert.deepEqual(await grantTreasureCollectibles(tx, hunt, user), []);
  assert.equal(tx.calls.some(call => call.query.includes("INSERT INTO virtual_world_user_collectibles")), false);
});

test("collectible grant is idempotent for an existing user/hunt/item award", async () => {
  const tx = fakeTx({ existing: true });
  assert.deepEqual(await grantTreasureCollectibles(tx, hunt, user), []);
  assert.equal(tx.calls.some(call => call.query.includes("UPDATE virtual_world_collectible_catalog")), false);
});


import { grantTreasureCollectiblesToUsers } from "../dist/treasure-collectible-runtime.js";

test("team collectible grant batches inventory writes and respects finite supply deterministically", async () => {
  const calls = [];
  const tx = {
    async unsafe(query, params) {
      calls.push({ query, params });
      if (query.includes("FROM virtual_world_treasure_reward_items")) return [{
        id, code: "rare-badge", displayName: "Rare Badge", category: "badge",
        rarity: "rare", maxSupply: "1", mintedCount: "0", quantity: 1
      }];
      if (query.includes("FROM virtual_world_user_collectibles")) return [];
      if (query.includes("INSERT INTO virtual_world_user_collectibles")) {
        assert.deepEqual(params[1], [user]);
        return [{ userId: params[1][0], collectibleId: params[2][0], quantity: params[3][0] }];
      }
      return [];
    }
  };
  const rewards = await grantTreasureCollectiblesToUsers(tx, hunt, [
    "123e4567-e89b-42d3-a456-426614174014", user
  ]);
  assert.equal(rewards.get(user)?.length, 1);
  assert.equal(rewards.get("123e4567-e89b-42d3-a456-426614174014")?.length, 0);
  assert.equal(calls.filter(call => call.query.includes("INSERT INTO virtual_world_user_collectibles")).length, 1);
  const minted = calls.find(call => call.query.includes("UPDATE virtual_world_collectible_catalog"));
  assert.ok(minted);
  assert.deepEqual(minted.params[1], [1]);
});

test("team collectible grant skips existing awards and does not issue empty writes", async () => {
  const calls = [];
  const otherUser = "123e4567-e89b-42d3-a456-426614174014";
  const tx = {
    async unsafe(query, params) {
      calls.push({ query, params });
      if (query.includes("FROM virtual_world_treasure_reward_items")) return [{
        id, code: "rare-badge", displayName: "Rare Badge", category: "badge",
        rarity: "rare", maxSupply: null, mintedCount: "0", quantity: 1
      }];
      if (query.includes("FROM virtual_world_user_collectibles")) return [
        { userId: user, collectibleId: id }
      ];
      if (query.includes("INSERT INTO virtual_world_user_collectibles")) return [
        { userId: otherUser, collectibleId: id, quantity: 1 }
      ];
      return [];
    }
  };
  const rewards = await grantTreasureCollectiblesToUsers(tx, hunt, [user, otherUser]);
  assert.equal(rewards.get(user)?.length, 0);
  assert.equal(rewards.get(otherUser)?.length, 1);
  assert.equal(calls.filter(call => call.query.includes("INSERT INTO virtual_world_user_collectibles")).length, 1);
  assert.equal(calls.filter(call => call.query.includes("UPDATE virtual_world_collectible_catalog")).length, 1);
});

test("team collectible batches never split an item quantity when finite supply is insufficient", async () => {
  const firstUser = "123e4567-e89b-42d3-a456-426614174014";
  const secondUser = "123e4567-e89b-42d3-a456-426614174015";
  const calls = [];
  const tx = {
    async unsafe(query, params) {
      calls.push({ query, params });
      if (query.includes("FROM virtual_world_treasure_reward_items")) return [{
        id, code: "rare-badge", displayName: "Rare Badge", category: "badge",
        rarity: "rare", maxSupply: "3", mintedCount: "0", quantity: 2
      }];
      if (query.includes("FROM virtual_world_user_collectibles")) return [];
      if (query.includes("INSERT INTO virtual_world_user_collectibles")) {
        assert.deepEqual(params[1], [firstUser]);
        assert.deepEqual(params[3], [2]);
        return [{ userId: firstUser, collectibleId: id, quantity: 2 }];
      }
      return [];
    }
  };

  const rewards = await grantTreasureCollectiblesToUsers(tx, hunt, [secondUser, firstUser]);
  assert.equal(rewards.get(firstUser)?.[0]?.quantity, 2);
  assert.deepEqual(rewards.get(secondUser), []);
  const mint = calls.find(call => call.query.includes("UPDATE virtual_world_collectible_catalog"));
  assert.ok(mint);
  assert.deepEqual(mint.params[1], [2]);
});


test("team collectible grant increments supply only for rows actually inserted after a concurrent conflict", async () => {
  const otherUser = "123e4567-e89b-42d3-a456-426614174014";
  const calls = [];
  const tx = {
    async unsafe(query, params) {
      calls.push({ query, params });
      if (query.includes("FROM virtual_world_treasure_reward_items")) return [{
        id, code: "rare-badge", displayName: "Rare Badge", category: "badge",
        rarity: "rare", maxSupply: "5", mintedCount: "0", quantity: 1
      }];
      if (query.includes("FROM virtual_world_user_collectibles")) return [];
      if (query.includes("INSERT INTO virtual_world_user_collectibles")) {
        // A concurrent transaction won the unique-key race for the first user.
        return [{ userId: otherUser, collectibleId: id, quantity: 1 }];
      }
      return [];
    }
  };
  const rewards = await grantTreasureCollectiblesToUsers(tx, hunt, [user, otherUser]);
  assert.deepEqual(rewards.get(user), []);
  assert.equal(rewards.get(otherUser)?.length, 1);
  const mint = calls.find(call => call.query.includes("UPDATE virtual_world_collectible_catalog"));
  assert.ok(mint);
  assert.deepEqual(mint.params[1], [1]);
});
