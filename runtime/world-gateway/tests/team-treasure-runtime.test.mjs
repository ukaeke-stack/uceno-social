import test from "node:test";
import assert from "node:assert/strict";
import { createTreasureTeam, joinTreasureTeam } from "../dist/team-treasure-runtime.js";

const huntId = "123e4567-e89b-42d3-a456-426614174010";
const userId = "123e4567-e89b-42d3-a456-426614174011";
const teamId = "123e4567-e89b-42d3-a456-426614174012";
const worldId = "123e4567-e89b-42d3-a456-426614174013";
const secret = "test-only-secret-that-is-at-least-32-characters";
const now = Date.now();

function fakeDb(handler) {
  const calls = [];
  const tx = { unsafe: async (query, params = []) => {
    calls.push({ query, params });
    return handler(query, params, calls) ?? [];
  }};
  return { calls, begin: fn => fn(tx) };
}

test("team creation persists one shared assignment per authored clue step", async () => {
  const points = [
    { id: "223e4567-e89b-42d3-a456-426614174020", sequence: 0, cityId: "solsticebay", districtId: "central", interactableId: "fountain-a" },
    { id: "223e4567-e89b-42d3-a456-426614174021", sequence: 0, cityId: "solsticebay", districtId: "central", interactableId: "fountain-b" },
    { id: "223e4567-e89b-42d3-a456-426614174022", sequence: 1, cityId: "solsticebay", districtId: "central", interactableId: "arch-a" },
    { id: "223e4567-e89b-42d3-a456-426614174023", sequence: 1, cityId: "solsticebay", districtId: "central", interactableId: "arch-b" }
  ];
  const db = fakeDb((query) => {
    if (query.includes("FROM virtual_world_treasure_hunts")) return [{ id: huntId }];
    if (query.includes("FROM virtual_world_treasure_team_members AS member")) return [];
    if (query.includes("FROM virtual_world_treasure_spawn_points")) return points;
    return [];
  });
  const result = await createTreasureTeam(db, huntId, userId, worldId, 5, now, secret);
  assert.equal(result.ok, true);
  assert.equal(result.status, "forming");
  assert.equal(db.calls.filter(call => call.query.includes("INSERT INTO virtual_world_treasure_team_assignments")).length, 1);
  const routeInsert = db.calls.find(call => call.query.includes("INSERT INTO virtual_world_treasure_team_assignments"));
  assert.equal(routeInsert.params[2].length, 2);
  assert.equal(routeInsert.params[3].length, 2);
  assert.equal(db.calls.filter(call => call.query.includes("INSERT INTO virtual_world_treasure_team_progress")).length, 1);
});

test("team creation refuses a weak assignment secret before opening a transaction", async () => {
  let opened = false;
  const db = { begin: fn => { opened = true; return fn({ unsafe: async () => [] }); } };
  const result = await createTreasureTeam(db, huntId, userId, worldId, 5, now, "short");
  assert.equal(result.ok, false);
  assert.equal(result.code, "treasure_assignment_secret_unavailable");
  assert.equal(opened, false);
});

test("joining a forming team activates it after the second member joins", async () => {
  const db = fakeDb((query) => {
    if (query.includes("FROM virtual_world_treasure_teams AS team")) return [{
      id: teamId, huntId, status: "forming", maxMembers: 5, enabled: true, distributionMode: "team",
      startsAt: new Date(now - 1000), endsAt: new Date(now + 60000)
    }];
    if (query.includes("SELECT 1 FROM virtual_world_treasure_team_members")) return [];
    if (query.includes("COUNT(*)::integer AS total")) return [{ total: 1 }];
    return [];
  });
  const result = await joinTreasureTeam(db, teamId, userId, worldId, now);
  assert.equal(result.ok, true);
  assert.equal(result.status, "active");
  assert.equal(result.members, 2);
  assert.equal(db.calls.some(call => call.query.includes("SET status = $2")), true);
});

test("joining a full team is rejected without inserting a member", async () => {
  const db = fakeDb((query) => {
    if (query.includes("FROM virtual_world_treasure_teams AS team")) return [{
      id: teamId, huntId, status: "active", maxMembers: 2, enabled: true, distributionMode: "team",
      startsAt: new Date(now - 1000), endsAt: new Date(now + 60000)
    }];
    if (query.includes("SELECT 1 FROM virtual_world_treasure_team_members")) return [];
    if (query.includes("COUNT(*)::integer AS total")) return [{ total: 2 }];
    return [];
  });
  const result = await joinTreasureTeam(db, teamId, userId, worldId, now);
  assert.equal(result.ok, false);
  assert.equal(result.code, "team_full");
  assert.equal(db.calls.some(call => call.query.includes("INSERT INTO virtual_world_treasure_team_members")), false);
});
