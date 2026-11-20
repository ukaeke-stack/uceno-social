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
