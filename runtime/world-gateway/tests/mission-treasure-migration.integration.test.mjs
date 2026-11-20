import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { loadPrivateTreasureHints, recordPrivateTreasureDiscovery } from "../dist/private-treasure-runtime.js";
import { createTreasureTeam, joinTreasureTeam, loadTeamTreasureHints, recordTeamTreasureDiscovery } from "../dist/team-treasure-runtime.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("migration 037 applies cleanly and enforces mission, treasure and append-only ledger invariants", {
  skip: !databaseUrl,
  timeout: 20000
}, async () => {
  const schema = "uceno_rewards_" + randomUUID().replace(/-/g, "");
  const admin = postgres(databaseUrl, { max: 2, idle_timeout: 5 });
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set("options", `-csearch_path=${schema},public`);
  const db = postgres(scoped.toString(), { max: 2, idle_timeout: 5 });
  const migration = readFileSync(new URL("../../../db/migrations/037_daily_missions_treasure_rewards.sql", import.meta.url), "utf8");
  const distributionMigration = readFileSync(new URL("../../../db/migrations/038_treasure_distribution_and_private_routes.sql", import.meta.url), "utf8");
  const routeDiscoveryMigration = readFileSync(new URL("../../../db/migrations/039_private_treasure_route_discoveries.sql", import.meta.url), "utf8");
  const teamMigration = readFileSync(new URL("../../../db/migrations/040_treasure_team_rewards.sql", import.meta.url), "utf8");
  const collectibleMigration = readFileSync(new URL("../../../db/migrations/041_treasure_collectible_inventory.sql", import.meta.url), "utf8");
  const scheduleMigration = readFileSync(new URL("../../../db/migrations/042_treasure_schedule_templates.sql", import.meta.url), "utf8");
  const userId = randomUUID();
  const secondUserId = randomUUID();
  const teamId = randomUUID();
  const worldId = randomUUID();
  const activityId = randomUUID();
  const resultSessionId = randomUUID();
  const missionTemplateId = randomUUID();
  const missionInstanceId = randomUUID();
  const huntId = randomUUID();
  const privateHuntId = randomUUID();
  const instanceId = randomUUID();
  const processId = randomUUID();
  const clueId = randomUUID();

  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    await db.unsafe("CREATE TABLE users (id UUID PRIMARY KEY)");
    await db.unsafe("CREATE TABLE virtual_worlds (id UUID PRIMARY KEY)");
    await db.unsafe("CREATE TABLE virtual_world_activity_sessions (id UUID PRIMARY KEY)");
    await db.unsafe("CREATE TABLE virtual_world_instances (id UUID PRIMARY KEY, owner_process_id UUID NOT NULL, owner_generation INTEGER NOT NULL, owner_lease_expires_at TIMESTAMPTZ NOT NULL)");
    await db.unsafe(`CREATE TABLE virtual_world_activity_results (
      id BIGSERIAL PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES virtual_world_activity_sessions(id),
      world_id UUID NOT NULL REFERENCES virtual_worlds(id),
      user_id UUID NOT NULL,
      placement INTEGER,
      status TEXT NOT NULL,
      checkpoint_index INTEGER NOT NULL DEFAULT 0,
      finish_time BIGINT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, user_id)
    )`);
    try {
      await db.unsafe(migration);
      await db.unsafe(distributionMigration);
      await db.unsafe(routeDiscoveryMigration);
      await db.unsafe(teamMigration);
      await db.unsafe(collectibleMigration);
      await db.unsafe(scheduleMigration);
    } catch (error) {
      const position = Number(error?.position);
      const context = Number.isInteger(position) && position > 0
        ? migration.slice(Math.max(0, position - 100), position + 100)
        : "migration position unavailable";
      throw new Error(`Migration 037 failed: ${error instanceof Error ? error.message : String(error)}; SQL context: ${context}`);
    }
    const distributionIndexes = [
      "virtual_world_treasure_spawn_candidates_idx",
      "virtual_world_treasure_spawn_location_idx",
      "virtual_world_treasure_assignments_user_idx",
      "virtual_world_treasure_global_claims_recent_idx",
      "virtual_world_treasure_route_discoveries_user_idx",
      "virtual_world_treasure_teams_hunt_idx",
      "virtual_world_treasure_team_members_rank_idx",
      "virtual_world_treasure_team_assignments_spawn_idx",
      "virtual_world_treasure_team_discoveries_member_idx",
      "virtual_world_collectible_catalog_live_idx",
      "virtual_world_user_collectibles_inventory_idx",
      "virtual_world_treasure_templates_live_idx",
      "virtual_world_treasure_template_spawn_idx"
    ];
    const installedDistributionIndexes = await db`SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = ANY(${distributionIndexes})`;
    assert.deepEqual(installedDistributionIndexes.map(row => row.indexname).sort(), distributionIndexes.sort());
    const expectedIndexes = [
      "virtual_world_daily_mission_active_lookup_idx",
      "virtual_world_daily_mission_template_event_idx",
      "virtual_world_treasure_hunt_active_lookup_idx",
      "virtual_world_treasure_clue_location_lookup_idx"
    ];
    const installedIndexes = await db`SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = ANY(${expectedIndexes})`;
    assert.deepEqual(installedIndexes.map(row => row.indexname).sort(), expectedIndexes.sort());

    await db.unsafe("INSERT INTO users(id) VALUES ($1), ($2)", [userId, secondUserId]);
    await db.unsafe("INSERT INTO virtual_worlds(id) VALUES ($1)", [worldId]);
    await db.unsafe("INSERT INTO virtual_world_activity_sessions(id) VALUES ($1)", [resultSessionId]);
    const result = await db.unsafe(`INSERT INTO virtual_world_activity_results
      (session_id, world_id, user_id, status, checkpoint_index)
      VALUES ($1, $2, $3, 'finished', 2) RETURNING id`, [resultSessionId, worldId, userId]);
    const resultId = result[0].id;

    await db.unsafe(`INSERT INTO virtual_world_daily_mission_templates
      (id, code, title, event_kind, target_count, reward_earned_credits, enabled)
      VALUES ($1, 'daily-race', 'Finish a race', 'checkpoint_finished', 1, 15, TRUE)`,
      [missionTemplateId]);
    await db.unsafe(`INSERT INTO virtual_world_daily_mission_instances
      (id, template_id, world_id, schedule_key, starts_at, ends_at)
      VALUES ($1, $2, $3, '2026-11-19', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour')`,
      [missionInstanceId, missionTemplateId, worldId]);
    await db.unsafe(`INSERT INTO virtual_world_daily_mission_progress
      (mission_instance_id, user_id, progress_count, completed_at)
      VALUES ($1, $2, 1, NOW())`, [missionInstanceId, userId]);
    await db.unsafe(`INSERT INTO virtual_world_daily_mission_events
      (event_id, mission_instance_id, user_id, activity_result_id, event_kind, occurred_at)
      VALUES ($1, $2, $3, $4, 'checkpoint_finished', NOW())`,
      [activityId, missionInstanceId, userId, resultId]);
    await assert.rejects(() => db.unsafe(`INSERT INTO virtual_world_daily_mission_events
      (event_id, mission_instance_id, user_id, activity_result_id, event_kind, occurred_at)
      VALUES ($1, $2, $3, $4, 'checkpoint_finished', NOW())`,
      [randomUUID(), missionInstanceId, userId, resultId]));

    await db.unsafe(`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, starts_at, ends_at, enabled, reward_earned_credits)
      VALUES ($1, 'pilot-hunt', 'Pilot hunt', NOW() - INTERVAL '1 hour',
        NOW() + INTERVAL '1 hour', TRUE, 25)`, [huntId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_clues
      (id, hunt_id, sequence, city_id, district_id, interactable_id,
       position_x, position_y, position_z, interaction_radius)
      VALUES ($1, $2, 0, 'meridian', 'central', 'uceno:0123456789abcdef0123456789abcdef',
        1, 1.15, 1, 2)`, [clueId, huntId]);
    const spawnA = randomUUID();
    const spawnB = randomUUID();
    await db`INSERT INTO virtual_world_treasure_spawn_points
      (id, hunt_id, sequence, city_id, district_id, interactable_id,
       position_x, position_y, position_z, interaction_radius)
      VALUES
      (${spawnA}::uuid, ${huntId}::uuid, 0, 'solsticebay', 'central', 'spawn-a', 1, 1.15, 1, 2),
      (${spawnB}::uuid, ${huntId}::uuid, 0, 'solsticebay', 'central', 'spawn-b', 2, 1.15, 2, 2)`;
    await db`INSERT INTO virtual_world_treasure_assignments
      (hunt_id, user_id, sequence, spawn_point_id)
      VALUES (${huntId}::uuid, ${userId}::uuid, 0, ${spawnA}::uuid)`;
    await assert.rejects(() => db`INSERT INTO virtual_world_treasure_assignments
      (hunt_id, user_id, sequence, spawn_point_id)
      VALUES (${huntId}::uuid, ${userId}::uuid, 0, ${spawnB}::uuid)`);
    await db`INSERT INTO virtual_world_treasure_global_claims (hunt_id, user_id)
      VALUES (${huntId}::uuid, ${userId}::uuid)`;
    await assert.rejects(() => db`INSERT INTO virtual_world_treasure_global_claims (hunt_id, user_id)
      VALUES (${huntId}::uuid, ${userId}::uuid)`);
    await db.unsafe(`INSERT INTO virtual_world_treasure_teams (id, hunt_id, owner_user_id)
      VALUES ($1, $2, $3)`, [teamId, huntId, userId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_team_members
      (hunt_id, team_id, user_id, contribution_points)
      VALUES ($1, $2, $3, 3), ($1, $2, $4, 2)`,
      [huntId, teamId, userId, secondUserId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_team_assignments
      (hunt_id, team_id, sequence, spawn_point_id) VALUES ($1, $2, 0, $3)`,
      [huntId, teamId, spawnA]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_team_progress (hunt_id, team_id)
      VALUES ($1, $2)`, [huntId, teamId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_team_discoveries
      (id, hunt_id, team_id, sequence, spawn_point_id, discovered_by)
      VALUES ($1, $2, $3, 0, $4, $5)`,
      [randomUUID(), huntId, teamId, spawnA, userId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_team_reward_allocations
      (team_id, user_id, contribution_points, amount)
      VALUES ($1, $2, 3, 15), ($1, $3, 2, 10)`,
      [teamId, userId, secondUserId]);
    await db.unsafe(`INSERT INTO virtual_world_instances
      (id, owner_process_id, owner_generation, owner_lease_expires_at)
      VALUES ($1, $2, 1, NOW() + INTERVAL '1 hour')`, [instanceId, processId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, reward_earned_credits,
       enabled, distribution_mode)
      VALUES ($1, 'private-route-test', 'Private route test', $2,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', 25, TRUE, 'personal')`,
      [privateHuntId, worldId]);
    const routePoints = [];
    for (let sequence = 0; sequence < 2; sequence++) {
      for (let candidate = 0; candidate < 3; candidate++) {
        const point = { id: randomUUID(), sequence, cityId: 'solsticebay',
          districtId: 'central', interactableId: 'private-' + sequence + '-' + candidate,
          x: sequence * 10 + candidate, y: 1.15, z: candidate };
        routePoints.push(point);
        await db.unsafe(`INSERT INTO virtual_world_treasure_spawn_points
          (id, hunt_id, sequence, city_id, district_id, interactable_id,
           position_x, position_y, position_z, interaction_radius, clue_payload)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 2,
            '{"title":"Private clue","hint":"Search the old arch","position_x":999}'::jsonb)`,
          [point.id, privateHuntId, point.sequence, point.cityId, point.districtId,
            point.interactableId, point.x, point.y, point.z]);
      }
    }
    const privatePlayer = { id: userId, worldId, x: 0, y: 1.15, z: 0 };
    const privateHints = await loadPrivateTreasureHints(db, privatePlayer, Date.now(),
      'integration-test-secret-that-is-at-least-32-characters');
    assert.equal(privateHints.length, 1);
    assert.equal(privateHints[0].clue.title, 'Private clue');
    assert.equal('position_x' in privateHints[0].clue, false);
    const assignments = await db`SELECT assignment.sequence, point.id AS "spawnPointId",
        point.city_id AS "cityId", point.district_id AS "districtId",
        point.interactable_id AS "interactableId", point.position_x AS x,
        point.position_y AS y, point.position_z AS z
      FROM virtual_world_treasure_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE assignment.hunt_id = ${privateHuntId}::uuid
        AND assignment.user_id = ${userId}::uuid ORDER BY assignment.sequence`;
    assert.equal(assignments.length, 2);
    for (const [index, point] of assignments.entries()) {
      const result = await recordPrivateTreasureDiscovery(db,
        { id: userId, worldId, x: Number(point.x), y: Number(point.y), z: Number(point.z) },
        { id: point.interactableId, cityId: point.cityId, districtId: point.districtId },
        Date.now(), 'integration-test-secret-that-is-at-least-32-characters',
        instanceId, processId, 1);
      assert.equal(result.handled, true);
      assert.equal(result.discovered, true);
      assert.equal(result.completed, index === 1);
      if (index === 1) assert.equal(result.rewardEarnedCredits, '25');
    }
    const privateReward = await db`SELECT amount FROM virtual_world_earned_credit_ledger
      WHERE idempotency_key = ${'private-treasure:' + privateHuntId + ':' + userId}`;
    assert.equal(privateReward.length, 1);
    assert.equal(String(privateReward[0].amount), '25');

    const teamHuntId = randomUUID();
    const teamSecret = 'team-runtime-integration-secret-at-least-32-bytes';
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, enabled, reward_earned_credits, distribution_mode)
      VALUES (${teamHuntId}::uuid, 'team-runtime-test', 'Team runtime test', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', TRUE, 101, 'team')`;
    for (let sequence = 0; sequence < 2; sequence++) {
      for (let candidate = 0; candidate < 2; candidate++) {
        const point = { id: randomUUID(), sequence, interactableId: 'team-' + sequence + '-' + candidate,
          x: sequence * 10 + candidate, y: 1.15, z: candidate };
        await db`INSERT INTO virtual_world_treasure_spawn_points
          (id, hunt_id, sequence, city_id, district_id, interactable_id, position_x, position_y, position_z, interaction_radius)
          VALUES (${point.id}::uuid, ${teamHuntId}::uuid, ${sequence}, 'solsticebay', 'central',
            ${point.interactableId}, ${point.x}, ${point.y}, ${point.z}, 2)`;
      }
    }
    const createdTeam = await createTreasureTeam(db, teamHuntId, userId, worldId, 4, Date.now(), teamSecret);
    assert.equal(createdTeam.ok, true);
    assert.equal(createdTeam.status, 'forming');
    const createdTeamId = createdTeam.teamId;
    const joinedTeam = await joinTreasureTeam(db, createdTeamId, secondUserId, worldId, Date.now());
    assert.equal(joinedTeam.ok, true);
    assert.equal(joinedTeam.status, 'active');
    assert.equal(joinedTeam.members, 2);
    const hintsForOwner = await loadTeamTreasureHints(db, privatePlayer, Date.now());
    const hintsForMember = await loadTeamTreasureHints(db,
      { id: secondUserId, worldId, x: 0, y: 1.15, z: 0 }, Date.now());
    assert.equal(hintsForOwner.length, 1);
    assert.equal(hintsForMember.length, 1);
    assert.equal(hintsForOwner[0].sequence, 0);
    assert.equal(hintsForMember[0].createdTeamId, createdTeamId);
    const teamAssignments = await db`SELECT assignment.sequence, point.id AS id,
        point.interactable_id AS "interactableId", point.position_x AS x,
        point.position_y AS y, point.position_z AS z, point.city_id AS "cityId",
        point.district_id AS "districtId"
      FROM virtual_world_treasure_team_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE assignment.team_id = ${createdTeamId}::uuid ORDER BY assignment.sequence`;
    assert.equal(teamAssignments.length, 2);
    const firstStep = teamAssignments[0];
    const firstPosition = { x: Number(firstStep.x), y: Number(firstStep.y), z: Number(firstStep.z) };
    const [firstDiscovery, competingDiscovery] = await Promise.all([
      recordTeamTreasureDiscovery(db,
        { id: userId, worldId, ...firstPosition },
        { id: firstStep.interactableId, cityId: firstStep.cityId, districtId: firstStep.districtId },
        Date.now(), teamSecret, instanceId, processId, 1),
      recordTeamTreasureDiscovery(db,
        { id: secondUserId, worldId, ...firstPosition },
        { id: firstStep.interactableId, cityId: firstStep.cityId, districtId: firstStep.districtId },
        Date.now(), teamSecret, instanceId, processId, 1)
    ]);
    assert.equal([firstDiscovery, competingDiscovery].filter(result => result.discovered).length, 1);
    const firstWinnerId = firstDiscovery.discovered ? userId : secondUserId;
    const finalUserId = firstWinnerId === userId ? secondUserId : userId;
    const secondStep = teamAssignments[1];
    const finalDiscovery = await recordTeamTreasureDiscovery(db,
      { id: finalUserId, worldId, x: Number(secondStep.x), y: Number(secondStep.y), z: Number(secondStep.z) },
      { id: secondStep.interactableId, cityId: secondStep.cityId, districtId: secondStep.districtId },
      Date.now(), teamSecret, instanceId, processId, 1);
    assert.equal(finalDiscovery.handled, true);
    assert.equal(finalDiscovery.discovered, true);
    assert.equal(finalDiscovery.completed, true);
    assert.equal(finalDiscovery.rewardEarnedCredits, finalUserId < firstWinnerId ? '51' : '50');
    const teamAllocations = await db`SELECT user_id AS "userId", amount::text AS amount
      FROM virtual_world_treasure_team_reward_allocations WHERE team_id = ${createdTeamId}::uuid ORDER BY user_id`;
    assert.equal(teamAllocations.length, 2);
    assert.equal(teamAllocations.reduce((sum, row) => sum + BigInt(row.amount), 0n), 101n);
    const teamLedger = await db`SELECT user_id AS "userId", amount::text AS amount
      FROM virtual_world_earned_credit_ledger WHERE idempotency_key LIKE ${'team-treasure:' + createdTeamId + ':%'}`;
    assert.equal(teamLedger.length, 2);
    const completedHints = await loadTeamTreasureHints(db, privatePlayer, Date.now());
    assert.equal(completedHints.length, 0);

    await db.unsafe(`INSERT INTO virtual_world_treasure_progress
      (hunt_id, user_id, next_sequence) VALUES ($1, $2, 1)`, [huntId, userId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_discoveries
      (id, hunt_id, user_id, clue_id, sequence) VALUES ($1, $2, $3, $4, 0)`,
      [randomUUID(), huntId, userId, clueId]);
    await assert.rejects(() => db.unsafe(`INSERT INTO virtual_world_treasure_discoveries
      (id, hunt_id, user_id, clue_id, sequence) VALUES ($1, $2, $3, $4, 0)`,
      [randomUUID(), huntId, userId, clueId]));

    await db.unsafe(`INSERT INTO virtual_world_earned_credit_ledger
      (user_id, amount, idempotency_key, source_type, source_mission_instance_id)
      VALUES ($1, 15, 'mission:${missionInstanceId}:${userId}', 'daily_mission', $2)`,
      [userId, missionInstanceId]);
    await assert.rejects(() => db.unsafe(`INSERT INTO virtual_world_earned_credit_ledger
      (user_id, amount, idempotency_key, source_type, source_mission_instance_id)
      VALUES ($1, 15, 'mission:${missionInstanceId}:${userId}', 'daily_mission', $2)`,
      [userId, missionInstanceId]));
    await assert.rejects(() => db.unsafe(`UPDATE virtual_world_earned_credit_ledger
      SET amount = 1 WHERE user_id = $1`, [userId]));
    await assert.rejects(() => db.unsafe(`DELETE FROM virtual_world_earned_credit_ledger
      WHERE user_id = $1`, [userId]));
    await assert.rejects(() => db.unsafe(`INSERT INTO virtual_world_earned_credit_ledger
      (user_id, ledger_type, currency, amount, idempotency_key, source_type, source_mission_instance_id)
      VALUES ($1, 'purchased', 'purchased_credits', 15, 'invalid-currency', 'daily_mission', $2)`,
      [userId, missionInstanceId]));
  } finally {
    await db.end({ timeout: 2 }).catch(() => undefined);
    await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await admin.end({ timeout: 2 });
  }
});
