import test from "node:test";
import assert from "node:assert/strict";
import { materializeScheduledTreasureHunts } from "../dist/treasure-schedule-runtime.js";

const templateId = "123e4567-e89b-42d3-a456-426614174011";
const huntId = "123e4567-e89b-42d3-a456-426614174012";
const points = [
  { sequence: 0, cityId: "solsticebay", districtId: "central", interactableId: "a",
    x: 1, y: 1.15, z: 1, radius: 2, clue: { hint: "First" } },
  { sequence: 0, cityId: "solsticebay", districtId: "central", interactableId: "b",
    x: 2, y: 1.15, z: 2, radius: 2, clue: { hint: "Alternate" } },
  { sequence: 1, cityId: "solsticebay", districtId: "central", interactableId: "c",
    x: 3, y: 1.15, z: 3, radius: 2, clue: { hint: "Second" } },
  { sequence: 1, cityId: "solsticebay", districtId: "central", interactableId: "d",
    x: 4, y: 1.15, z: 4, radius: 2, clue: { hint: "Alternate second" } }
];

function fakeDb(spawnPoints = points) {
  const state = { created: false, copied: 0 };
  const template = { id: templateId, code: "daily-arch", title: "Arch Hunt",
    worldId: null, cadence: "daily", timeZone: "Africa/Lagos",
    activeFrom: null, activeUntil: null };
  const db = {
    state,
    async unsafe(query) {
      if (query.includes("FROM virtual_world_treasure_hunt_templates")) return [template];
      throw new Error("unexpected top-level query: " + query);
    },
    async begin(fn) {
      return fn({
        async unsafe(query) {
          if (query.includes("pg_try_advisory_xact_lock")) return [{ locked: true }];
          if (query.includes("FROM virtual_world_treasure_hunt_templates")) return [{
            reward: "20", distributionMode: "personal", maxGlobalWinners: null, maxRewardClaims: null
          }];
          if (query.includes("FROM virtual_world_treasure_template_spawn_points")) return spawnPoints;
          if (query.includes("FROM virtual_world_treasure_hunts")) return state.created ? [{ id: huntId }] : [];
          if (query.includes("INSERT INTO virtual_world_treasure_hunts")) {
            if (state.created) return [];
            state.created = true;
            return [{ id: huntId }];
          }
          if (query.includes("INSERT INTO virtual_world_treasure_spawn_points")) {
            state.copied++;
            return [];
          }
          throw new Error("unexpected transaction query: " + query);
        }
      });
    }
  };
  return db;
}

test("daily treasure templates materialize once and copy authored route candidates", async () => {
  const db = fakeDb();
  const now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(await materializeScheduledTreasureHunts(db, now), 1);
  assert.equal(db.state.copied, 4);
  assert.equal(await materializeScheduledTreasureHunts(db, now), 0);
});

test("personal templates without alternate authored locations fail closed", async () => {
  const db = fakeDb(points.filter(point => point.sequence !== 1 || point.interactableId === "c"));
  assert.equal(await materializeScheduledTreasureHunts(db, Date.parse("2026-11-20T12:00:00Z")), 0);
  assert.equal(db.state.created, false);
});

test("invalid schedule instants are rejected", async () => {
  await assert.rejects(() => materializeScheduledTreasureHunts(fakeDb(), Number.NaN),
    /invalid_treasure_schedule_instant/);
});
