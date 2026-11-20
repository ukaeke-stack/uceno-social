import test from "node:test";
import assert from "node:assert/strict";
import { loadPrivateTreasureHints, recordPrivateTreasureDiscovery } from "../dist/private-treasure-runtime.js";

const playerId = "123e4567-e89b-42d3-a456-426614174001";
const worldId = "123e4567-e89b-42d3-a456-426614174002";
const huntA = "123e4567-e89b-42d3-a456-426614174003";
const huntB = "123e4567-e89b-42d3-a456-426614174004";
const secret = "unit-test-assignment-secret-with-at-least-32-bytes";

test("private treasure candidate pools are fetched once for all active hunts", async () => {
  const calls = [];
  const points = [];
  for (const [huntId, prefix] of [[huntA, "a"], [huntB, "b"]]) {
    for (const sequence of [0, 1]) {
      for (const alternative of [0, 1]) {
        points.push({
          huntId,
          id: `223e4567-e89b-42d3-a456-4266141740${String(prefix === "a" ? sequence * 2 + alternative : sequence * 2 + alternative + 4).padStart(2, "0")}`,
          sequence,
          cityId: "solstice",
          districtId: "central",
          interactableId: `${prefix}-${sequence}-${alternative}`
        });
      }
    }
  }
  const db = {
    begin: async fn => fn({
      unsafe: async (query, params = []) => {
        calls.push({ query, params });
        if (query.includes("FROM virtual_world_treasure_hunts") &&
            query.includes("NOT EXISTS")) return [{ id: huntA, title: "A" }, { id: huntB, title: "B" }];
        if (query.includes("FROM virtual_world_treasure_spawn_points")) return points;
        if (query.includes("INSERT INTO virtual_world_treasure_assignments")) return [];
        if (query.includes("INSERT INTO virtual_world_treasure_progress")) return [];
        if (query.includes("FROM virtual_world_treasure_progress AS progress")) return [
          { huntId: huntA, title: "A", sequence: 0, clue: { hint: "A clue" } },
          { huntId: huntB, title: "B", sequence: 0, clue: { hint: "B clue" } }
        ];
        throw new Error("unexpected query: " + query);
      }
    })
  };
  const hints = await loadPrivateTreasureHints(db,
    { id: playerId, worldId, x: 0, y: 1.15, z: 0 }, Date.now(), secret);
  const candidateReads = calls.filter(call =>
    call.query.includes("FROM virtual_world_treasure_spawn_points"));
  assert.equal(candidateReads.length, 1);
  assert.deepEqual(candidateReads[0].params[0], [huntA, huntB]);
  assert.equal(calls.filter(call =>
    call.query.includes("INSERT INTO virtual_world_treasure_assignments")).length, 1);
  assert.equal(hints.length, 2);
});

test("private treasure routes reject candidate pools above 10000 instead of using a truncated prefix", async () => {
  const assignmentWrites = [];
  const oversized = Array.from({ length: 10001 }, (_, index) => ({
    huntId: huntA,
    id: "spawn-" + index,
    sequence: index % 2,
    cityId: "solstice",
    districtId: "central",
    interactableId: "interactable-" + index
  }));
  const db = {
    begin: async fn => fn({
      unsafe: async (query, params = []) => {
        if (query.includes("FROM virtual_world_treasure_hunts") &&
            query.includes("NOT EXISTS")) return [{ id: huntA, title: "Oversized" }];
        if (query.includes("FROM virtual_world_treasure_spawn_points")) {
          assert.match(query, /hunt_rank <= 10001/);
          return oversized;
        }
        if (query.includes("INSERT INTO virtual_world_treasure_assignments")) {
          assignmentWrites.push(params);
          return [];
        }
        if (query.includes("FROM virtual_world_treasure_progress AS progress")) return [];
        throw new Error("unexpected query: " + query);
      }
    })
  };
  const hints = await loadPrivateTreasureHints(db,
    { id: playerId, worldId, x: 0, y: 1.15, z: 0 }, Date.now(), secret);
  assert.equal(hints.length, 0);
  assert.equal(assignmentWrites.length, 0);
});

test("private treasure entry points fail closed for non-string and short assignment secrets", async () => {
  const db = { begin: async () => { throw new Error("database must not be queried"); } };
  const player = { id: playerId, worldId, x: 0, y: 1.15, z: 0 };
  assert.deepEqual(await loadPrivateTreasureHints(db, player, Date.now(), null), []);
  assert.deepEqual(await loadPrivateTreasureHints(db, player, Date.now(), "a".repeat(31)), []);
  const rejected = await recordPrivateTreasureDiscovery(db, player,
    { id: "real-interactable", cityId: "solsticebay", districtId: "central" },
    Date.now(), null, worldId, playerId, 1);
  assert.equal(rejected.handled, false);
  assert.equal(rejected.rewardEarnedCredits, "0");
});
