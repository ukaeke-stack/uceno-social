import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { loadPrivateTreasureHints, recordPrivateTreasureDiscovery } from "../dist/private-treasure-runtime.js";
import { createTreasureTeam, joinTreasureTeam, loadTeamTreasureHints, recordTeamTreasureDiscovery } from "../dist/team-treasure-runtime.js";
import { grantTreasureCollectibles, grantTreasureCollectiblesToUsers } from "../dist/treasure-collectible-runtime.js";
import { materializeScheduledTreasureHunts } from "../dist/treasure-schedule-runtime.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("migrations 037-042 apply cleanly and enforce mission, treasure, team, collectible and schedule invariants", {
  skip: !databaseUrl,
  timeout: 60000
}, async () => {
  const schema = "uceno_rewards_" + randomUUID().replace(/-/g, "");
  const admin = postgres(databaseUrl, { max: 2, idle_timeout: 5 });
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set("options", `-csearch_path=${schema},public`);
  const db = postgres(scoped.toString(), { max: 2, idle_timeout: 5 });
  const replayDb = postgres(scoped.toString(), { max: 2, idle_timeout: 5 });
  const migration = readFileSync(new URL("../../../db/migrations/037_daily_missions_treasure_rewards.sql", import.meta.url), "utf8");
  const distributionMigration = readFileSync(new URL("../../../db/migrations/038_treasure_distribution_and_private_routes.sql", import.meta.url), "utf8");
  const routeDiscoveryMigration = readFileSync(new URL("../../../db/migrations/039_private_treasure_route_discoveries.sql", import.meta.url), "utf8");
  const teamMigration = readFileSync(new URL("../../../db/migrations/040_treasure_team_rewards.sql", import.meta.url), "utf8");
  const collectibleMigration = readFileSync(new URL("../../../db/migrations/041_treasure_collectible_inventory.sql", import.meta.url), "utf8");
  const scheduleMigration = readFileSync(new URL("../../../db/migrations/042_treasure_schedule_templates.sql", import.meta.url), "utf8");
  const userId = randomUUID();
  const secondUserId = randomUUID();
  const thirdUserId = randomUUID();
  const fourthUserId = randomUUID();
  const teamId = randomUUID();
  const competingHuntId = randomUUID();
  const capacityHuntId = randomUUID();
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
  const collectibleId = randomUUID();

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
    const migrations = [
      ["037_daily_missions_treasure_rewards.sql", migration],
      ["038_treasure_distribution_and_private_routes.sql", distributionMigration],
      ["039_private_treasure_route_discoveries.sql", routeDiscoveryMigration],
      ["040_treasure_team_rewards.sql", teamMigration],
      ["041_treasure_collectible_inventory.sql", collectibleMigration],
      ["042_treasure_schedule_templates.sql", scheduleMigration]
    ];
    let activeMigrationName = "unknown";
    let activeMigrationSql = "";
    try {
      for (const [name, sql] of migrations) {
        activeMigrationName = name;
        activeMigrationSql = sql;
        await db.unsafe(sql);
      }
    } catch (error) {
      const position = Number(error?.position);
      const context = Number.isInteger(position) && position > 0
        ? activeMigrationSql.slice(Math.max(0, position - 100), position + 100)
        : "migration position unavailable";
      throw new Error(`Migration ${activeMigrationName} failed: ${error instanceof Error ? error.message : String(error)}; SQL context: ${context}`);
    }
    const distributionIndexes = [
      "virtual_world_treasure_spawn_candidates_idx",
      "virtual_world_treasure_spawn_location_idx",
      "virtual_world_treasure_assignments_user_idx",
      "virtual_world_treasure_global_claims_recent_idx",
      "virtual_world_treasure_route_discoveries_user_idx",
      "virtual_world_treasure_teams_hunt_idx",
      "virtual_world_treasure_team_members_rank_idx",
      "virtual_world_treasure_team_members_user_idx",
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
      "virtual_world_treasure_clue_location_lookup_idx",
      "virtual_world_treasure_progress_user_active_idx"
    ];
    const installedIndexes = await db`SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = ANY(${expectedIndexes})`;
    assert.deepEqual(installedIndexes.map(row => row.indexname).sort(), expectedIndexes.sort());

    await db.unsafe("INSERT INTO users(id) VALUES ($1), ($2), ($3), ($4)", [userId, secondUserId, thirdUserId, fourthUserId]);
    await db.unsafe("INSERT INTO virtual_worlds(id) VALUES ($1)", [worldId]);

    // Scheduled-hunt creation must be idempotent across concurrent workers:
    // only one generated hunt may claim a template's cadence key.
    const scheduleTemplateId = randomUUID();
    const scheduleTemplateCode = 'schedule-' + scheduleTemplateId.slice(0, 8);
    await db`INSERT INTO virtual_world_treasure_hunt_templates
      (id, code, title, world_id, cadence, time_zone, distribution_mode,
       max_global_winners, enabled)
      VALUES (${scheduleTemplateId}::uuid, ${scheduleTemplateCode},
        'Concurrent scheduled hunt', ${worldId}::uuid, 'daily',
        'Africa/Lagos', 'global', 25, TRUE)`;
    const scheduleKey = 'daily:2026-11-20';
    const scheduledInsertions = await Promise.allSettled([0, 1].map(index =>
      db`INSERT INTO virtual_world_treasure_hunts
        (id, code, title, world_id, starts_at, ends_at, enabled,
         reward_earned_credits, distribution_mode, template_id, schedule_key)
        VALUES (${randomUUID()}::uuid,
          ${'scheduled-' + index + '-' + scheduleTemplateId.slice(0, 8)},
          'Generated scheduled hunt', ${worldId}::uuid,
          NOW(), NOW() + INTERVAL '1 day', TRUE, 10, 'global',
          ${scheduleTemplateId}::uuid, ${scheduleKey})`
    ));
    assert.equal(scheduledInsertions.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(scheduledInsertions.filter(result => result.status === 'rejected').length, 1);
    const generatedScheduleRows = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_hunts
      WHERE template_id = ${scheduleTemplateId}::uuid AND schedule_key = ${scheduleKey}`;
    assert.equal(generatedScheduleRows[0].total, 1);

    const scheduleSpawnId = randomUUID();
    await db`INSERT INTO virtual_world_treasure_template_spawn_points
      (id, template_id, sequence, city_id, district_id, interactable_id,
       position_x, position_y, position_z, interaction_radius)
      VALUES (${scheduleSpawnId}::uuid, ${scheduleTemplateId}::uuid, 0,
        'solsticebay', 'central', 'scheduled-gate', 1, 1.15, 1, 2)`;
    await assert.rejects(() => db`INSERT INTO virtual_world_treasure_template_spawn_points
      (id, template_id, sequence, city_id, district_id, interactable_id,
       position_x, position_y, position_z, interaction_radius)
      VALUES (${randomUUID()}::uuid, ${scheduleTemplateId}::uuid, 1,
        'solsticebay', 'central', 'invalid-radius', 1, 1.15, 1, 50)`);
    await assert.rejects(() => db`INSERT INTO virtual_world_treasure_hunt_templates
      (id, code, title, cadence, time_zone, active_from, active_until,
       distribution_mode, max_global_winners)
      VALUES (${randomUUID()}::uuid, ${'bad-season-' + scheduleTemplateId.slice(0, 8)},
        'Invalid seasonal template', 'seasonal', 'Africa/Lagos',
        NOW(), NULL, 'global', 10)`);

    // A failure while copying authored spawn points must roll back the
    // generated hunt too. A retry after the transient failure should create
    // exactly one complete snapshot rather than a hunt with no playable route.
    const recoveryTemplateId = randomUUID();
    const recoveryTemplateCode = 'recover-' + recoveryTemplateId.slice(0, 8);
    await db`INSERT INTO virtual_world_treasure_hunt_templates
      (id, code, title, world_id, cadence, time_zone, distribution_mode, enabled)
      VALUES (${recoveryTemplateId}::uuid, ${recoveryTemplateCode},
        'Schedule recovery test', ${worldId}::uuid, 'daily',
        'Africa/Lagos', 'team', TRUE)`;
    for (let sequence = 0; sequence < 2; sequence++) {
      await db`INSERT INTO virtual_world_treasure_template_spawn_points
        (id, template_id, sequence, city_id, district_id, interactable_id,
         position_x, position_y, position_z, interaction_radius, clue_payload)
        VALUES (${randomUUID()}::uuid, ${recoveryTemplateId}::uuid, ${sequence},
          'solsticebay', 'central', ${'recovery-' + sequence},
          ${sequence}, 1.15, 0, 2, ${{ title: 'Recovery clue ' + sequence }}::jsonb)`;
    }
    await db.unsafe(`CREATE FUNCTION fail_treasure_spawn_snapshot() RETURNS trigger
      LANGUAGE plpgsql AS $function$ BEGIN
        RAISE EXCEPTION 'simulated_spawn_snapshot_failure';
      END $function$`);
    await db.unsafe(`CREATE TRIGGER fail_treasure_spawn_snapshot
      BEFORE INSERT ON virtual_world_treasure_spawn_points
      FOR EACH ROW EXECUTE FUNCTION fail_treasure_spawn_snapshot()`);
    const scheduleInstant = Date.parse('2026-11-20T12:00:00Z');
    await assert.rejects(() => materializeScheduledTreasureHunts(db, scheduleInstant),
      /simulated_spawn_snapshot_failure/);
    const rolledBackSchedule = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_hunts WHERE template_id = ${recoveryTemplateId}::uuid`;
    assert.equal(rolledBackSchedule[0].total, 0);
    await db.unsafe("DROP TRIGGER fail_treasure_spawn_snapshot ON virtual_world_treasure_spawn_points");
    await db.unsafe("DROP FUNCTION fail_treasure_spawn_snapshot()");
    assert.equal(await materializeScheduledTreasureHunts(db, scheduleInstant), 1);
    assert.equal(await materializeScheduledTreasureHunts(db, scheduleInstant), 0);
    const recoveredSchedule = await db`SELECT id FROM virtual_world_treasure_hunts
      WHERE template_id = ${recoveryTemplateId}::uuid`;
    assert.equal(recoveredSchedule.length, 1);
    const recoveredSpawnPoints = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_spawn_points WHERE hunt_id = ${recoveredSchedule[0].id}::uuid`;
    assert.equal(recoveredSpawnPoints[0].total, 2);
    const recoveredCluePayloads = await db`SELECT clue_payload
      FROM virtual_world_treasure_spawn_points
      WHERE hunt_id = ${recoveredSchedule[0].id}::uuid
      ORDER BY sequence`;
    assert.deepEqual(recoveredCluePayloads.map(row => row.clue_payload),
      [{ title: "Recovery clue 0" }, { title: "Recovery clue 1" }]);

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
    await db.unsafe(`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES ($1, 'finite-supply', 'Finite Supply Badge', 'badge', 'rare', 1, TRUE)`,
      [collectibleId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_reward_items
      (hunt_id, collectible_id, quantity) VALUES ($1, $2, 1)`, [huntId, collectibleId]);
    const concurrentCollectibleGrants = await Promise.all([
      db.begin(tx => grantTreasureCollectibles(tx, huntId, userId)),
      db.begin(tx => grantTreasureCollectibles(tx, huntId, secondUserId))
    ]);
    assert.equal(concurrentCollectibleGrants.flat().length, 1);
    const finiteInventory = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_user_collectibles
      WHERE collectible_id = ${collectibleId}::uuid AND source_treasure_hunt_id = ${huntId}::uuid`;
    const finiteCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${collectibleId}::uuid`;

    assert.equal(finiteInventory[0].total, 1);
    assert.equal(Number(finiteCatalog[0].minted_count), 1);

    // Team completion grants from separate hunts must serialize on the shared
    // catalog row. The combined team awards may consume the finite supply only
    // once, even though both transactions try to grant to multiple members.
    const sharedTeamCollectibleId = randomUUID();
    const secondTeamHuntId = randomUUID();
    await db`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES (${sharedTeamCollectibleId}::uuid,
        ${'team-shared-' + sharedTeamCollectibleId.slice(0, 8)},
        'Shared Team Supply Badge', 'badge', 'epic', 2, TRUE)`;
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, starts_at, ends_at, enabled, reward_earned_credits)
      VALUES (${secondTeamHuntId}::uuid,
        ${'team-supply-' + secondTeamHuntId.slice(0, 8)},
        'Second team supply hunt', NOW() - INTERVAL '1 hour',
        NOW() + INTERVAL '1 hour', TRUE, 10)`;
    await db`INSERT INTO virtual_world_treasure_reward_items
      (hunt_id, collectible_id, quantity)
      VALUES
      (${huntId}::uuid, ${sharedTeamCollectibleId}::uuid, 1),
      (${secondTeamHuntId}::uuid, ${sharedTeamCollectibleId}::uuid, 1)`;
    const competingTeamGrants = await Promise.all([
      db.begin(tx => grantTreasureCollectiblesToUsers(tx, huntId, [userId, secondUserId])),
      replayDb.begin(tx => grantTreasureCollectiblesToUsers(tx, secondTeamHuntId, [thirdUserId, fourthUserId]))
    ]);
    assert.equal(competingTeamGrants.reduce((total, result) =>
      total + [...result.values()].reduce((count, rewards) => count + rewards.length, 0), 0), 2);
    const sharedTeamInventory = await db`SELECT COUNT(*)::integer AS total,
        COALESCE(SUM(quantity), 0)::integer AS quantity
      FROM virtual_world_user_collectibles
      WHERE collectible_id = ${sharedTeamCollectibleId}::uuid`;
    const sharedTeamCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${sharedTeamCollectibleId}::uuid`;
    assert.equal(sharedTeamInventory[0].total, 2);
    assert.equal(sharedTeamInventory[0].quantity, 2);
    assert.equal(Number(sharedTeamCatalog[0].minted_count), 2);

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
    // Simultaneous reconnects from separate gateway pools must converge on
    // one complete, immutable personal route without duplicate progress rows.
    const privateHintResults = await Promise.all([
      loadPrivateTreasureHints(db, privatePlayer, Date.now(),
        'integration-test-secret-that-is-at-least-32-characters'),
      loadPrivateTreasureHints(replayDb, privatePlayer, Date.now(),
        'integration-test-secret-that-is-at-least-32-characters')
    ]);
    const privateHints = privateHintResults[0];
    assert.equal(privateHints.length, 1);
    assert.deepEqual(privateHintResults[1], privateHints);
    assert.equal(privateHints[0].clue.title, 'Private clue');
    assert.equal('position_x' in privateHints[0].clue, false);
    const concurrentPrivateAssignments = await db`SELECT sequence, spawn_point_id AS "spawnPointId"
      FROM virtual_world_treasure_assignments
      WHERE hunt_id = ${privateHuntId}::uuid AND user_id = ${userId}::uuid
      ORDER BY sequence`;
    assert.equal(concurrentPrivateAssignments.length, 2);
    assert.deepEqual(concurrentPrivateAssignments.map(row => Number(row.sequence)), [0, 1]);
    const concurrentPrivateProgress = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_progress
      WHERE hunt_id = ${privateHuntId}::uuid AND user_id = ${userId}::uuid`;
    assert.equal(concurrentPrivateProgress[0].total, 1);
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

    // An exception after the Earned Credits insert must roll back the clue,
    // progress marker, ledger entry, collectible inventory and minted count.
    // Removing the injected failure and replaying the same final clue must
    // complete exactly once rather than leaving a permanently claimed reward.
    const recoverySecret = 'integration-test-secret-that-is-at-least-32-characters';
    const recoveryHuntId = randomUUID();
    const recoveryCollectibleId = randomUUID();
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, reward_earned_credits,
       enabled, distribution_mode)
      VALUES (${recoveryHuntId}::uuid, ${'recovery-' + recoveryHuntId.slice(0, 8)},
        'Treasure transaction recovery', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', 31, TRUE, 'personal')`;
    await db`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES (${recoveryCollectibleId}::uuid, 'recovery-token', 'Recovery Token',
        'badge', 'rare', 1, TRUE)`;
    await db`INSERT INTO virtual_world_treasure_reward_items
      (hunt_id, collectible_id, quantity)
      VALUES (${recoveryHuntId}::uuid, ${recoveryCollectibleId}::uuid, 1)`;
    for (let sequence = 0; sequence < 2; sequence++) {
      const point = { id: randomUUID(), sequence,
        interactableId: 'recovery-' + sequence,
        x: sequence * 10, y: 1.15, z: 0 };
      await db`INSERT INTO virtual_world_treasure_spawn_points
        (id, hunt_id, sequence, city_id, district_id, interactable_id,
         position_x, position_y, position_z, interaction_radius)
        VALUES (${point.id}::uuid, ${recoveryHuntId}::uuid, ${sequence},
          'solsticebay', 'central', ${point.interactableId},
          ${point.x}, ${point.y}, ${point.z}, 2)`;
    }
    await loadPrivateTreasureHints(db, privatePlayer, Date.now(), recoverySecret);
    const recoveryRoute = await db`SELECT assignment.sequence,
        point.id AS "spawnPointId", point.city_id AS "cityId",
        point.district_id AS "districtId", point.interactable_id AS "interactableId",
        point.position_x AS x, point.position_y AS y, point.position_z AS z
      FROM virtual_world_treasure_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE assignment.hunt_id = ${recoveryHuntId}::uuid
        AND assignment.user_id = ${userId}::uuid ORDER BY assignment.sequence`;
    assert.equal(recoveryRoute.length, 2);
    const recoveryPlayer = { id: userId, worldId, x: Number(recoveryRoute[0].x),
      y: Number(recoveryRoute[0].y), z: Number(recoveryRoute[0].z) };
    const firstRecoveryClue = recoveryRoute[0];
    const firstRecoveryResult = await recordPrivateTreasureDiscovery(db, recoveryPlayer,
      { id: firstRecoveryClue.interactableId, cityId: firstRecoveryClue.cityId,
        districtId: firstRecoveryClue.districtId }, Date.now(), recoverySecret,
      instanceId, processId, 1);
    assert.equal(firstRecoveryResult.discovered, true);
    assert.equal(firstRecoveryResult.completed, false);

    const finalRecoveryClue = recoveryRoute[1];
    await db.unsafe(`CREATE FUNCTION fail_treasure_inventory_insert()
      RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN RAISE EXCEPTION 'injected_treasure_inventory_failure'; END;
      $bodyimport test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { loadPrivateTreasureHints, recordPrivateTreasureDiscovery } from "../dist/private-treasure-runtime.js";
import { createTreasureTeam, joinTreasureTeam, loadTeamTreasureHints, recordTeamTreasureDiscovery } from "../dist/team-treasure-runtime.js";
import { grantTreasureCollectibles, grantTreasureCollectiblesToUsers } from "../dist/treasure-collectible-runtime.js";
import { materializeScheduledTreasureHunts } from "../dist/treasure-schedule-runtime.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("migrations 037-042 apply cleanly and enforce mission, treasure, team, collectible and schedule invariants", {
  skip: !databaseUrl,
  timeout: 60000
}, async () => {
  const schema = "uceno_rewards_" + randomUUID().replace(/-/g, "");
  const admin = postgres(databaseUrl, { max: 2, idle_timeout: 5 });
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set("options", `-csearch_path=${schema},public`);
  const db = postgres(scoped.toString(), { max: 2, idle_timeout: 5 });
  const replayDb = postgres(scoped.toString(), { max: 2, idle_timeout: 5 });
  const migration = readFileSync(new URL("../../../db/migrations/037_daily_missions_treasure_rewards.sql", import.meta.url), "utf8");
  const distributionMigration = readFileSync(new URL("../../../db/migrations/038_treasure_distribution_and_private_routes.sql", import.meta.url), "utf8");
  const routeDiscoveryMigration = readFileSync(new URL("../../../db/migrations/039_private_treasure_route_discoveries.sql", import.meta.url), "utf8");
  const teamMigration = readFileSync(new URL("../../../db/migrations/040_treasure_team_rewards.sql", import.meta.url), "utf8");
  const collectibleMigration = readFileSync(new URL("../../../db/migrations/041_treasure_collectible_inventory.sql", import.meta.url), "utf8");
  const scheduleMigration = readFileSync(new URL("../../../db/migrations/042_treasure_schedule_templates.sql", import.meta.url), "utf8");
  const userId = randomUUID();
  const secondUserId = randomUUID();
  const thirdUserId = randomUUID();
  const fourthUserId = randomUUID();
  const teamId = randomUUID();
  const competingHuntId = randomUUID();
  const capacityHuntId = randomUUID();
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
  const collectibleId = randomUUID();

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
    const migrations = [
      ["037_daily_missions_treasure_rewards.sql", migration],
      ["038_treasure_distribution_and_private_routes.sql", distributionMigration],
      ["039_private_treasure_route_discoveries.sql", routeDiscoveryMigration],
      ["040_treasure_team_rewards.sql", teamMigration],
      ["041_treasure_collectible_inventory.sql", collectibleMigration],
      ["042_treasure_schedule_templates.sql", scheduleMigration]
    ];
    let activeMigrationName = "unknown";
    let activeMigrationSql = "";
    try {
      for (const [name, sql] of migrations) {
        activeMigrationName = name;
        activeMigrationSql = sql;
        await db.unsafe(sql);
      }
    } catch (error) {
      const position = Number(error?.position);
      const context = Number.isInteger(position) && position > 0
        ? activeMigrationSql.slice(Math.max(0, position - 100), position + 100)
        : "migration position unavailable";
      throw new Error(`Migration ${activeMigrationName} failed: ${error instanceof Error ? error.message : String(error)}; SQL context: ${context}`);
    }
    const distributionIndexes = [
      "virtual_world_treasure_spawn_candidates_idx",
      "virtual_world_treasure_spawn_location_idx",
      "virtual_world_treasure_assignments_user_idx",
      "virtual_world_treasure_global_claims_recent_idx",
      "virtual_world_treasure_route_discoveries_user_idx",
      "virtual_world_treasure_teams_hunt_idx",
      "virtual_world_treasure_team_members_rank_idx",
      "virtual_world_treasure_team_members_user_idx",
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
      "virtual_world_treasure_clue_location_lookup_idx",
      "virtual_world_treasure_progress_user_active_idx"
    ];
    const installedIndexes = await db`SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = ANY(${expectedIndexes})`;
    assert.deepEqual(installedIndexes.map(row => row.indexname).sort(), expectedIndexes.sort());

    await db.unsafe("INSERT INTO users(id) VALUES ($1), ($2), ($3), ($4)", [userId, secondUserId, thirdUserId, fourthUserId]);
    await db.unsafe("INSERT INTO virtual_worlds(id) VALUES ($1)", [worldId]);

    // Scheduled-hunt creation must be idempotent across concurrent workers:
    // only one generated hunt may claim a template's cadence key.
    const scheduleTemplateId = randomUUID();
    const scheduleTemplateCode = 'schedule-' + scheduleTemplateId.slice(0, 8);
    await db`INSERT INTO virtual_world_treasure_hunt_templates
      (id, code, title, world_id, cadence, time_zone, distribution_mode,
       max_global_winners, enabled)
      VALUES (${scheduleTemplateId}::uuid, ${scheduleTemplateCode},
        'Concurrent scheduled hunt', ${worldId}::uuid, 'daily',
        'Africa/Lagos', 'global', 25, TRUE)`;
    const scheduleKey = 'daily:2026-11-20';
    const scheduledInsertions = await Promise.allSettled([0, 1].map(index =>
      db`INSERT INTO virtual_world_treasure_hunts
        (id, code, title, world_id, starts_at, ends_at, enabled,
         reward_earned_credits, distribution_mode, template_id, schedule_key)
        VALUES (${randomUUID()}::uuid,
          ${'scheduled-' + index + '-' + scheduleTemplateId.slice(0, 8)},
          'Generated scheduled hunt', ${worldId}::uuid,
          NOW(), NOW() + INTERVAL '1 day', TRUE, 10, 'global',
          ${scheduleTemplateId}::uuid, ${scheduleKey})`
    ));
    assert.equal(scheduledInsertions.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(scheduledInsertions.filter(result => result.status === 'rejected').length, 1);
    const generatedScheduleRows = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_hunts
      WHERE template_id = ${scheduleTemplateId}::uuid AND schedule_key = ${scheduleKey}`;
    assert.equal(generatedScheduleRows[0].total, 1);

    const scheduleSpawnId = randomUUID();
    await db`INSERT INTO virtual_world_treasure_template_spawn_points
      (id, template_id, sequence, city_id, district_id, interactable_id,
       position_x, position_y, position_z, interaction_radius)
      VALUES (${scheduleSpawnId}::uuid, ${scheduleTemplateId}::uuid, 0,
        'solsticebay', 'central', 'scheduled-gate', 1, 1.15, 1, 2)`;
    await assert.rejects(() => db`INSERT INTO virtual_world_treasure_template_spawn_points
      (id, template_id, sequence, city_id, district_id, interactable_id,
       position_x, position_y, position_z, interaction_radius)
      VALUES (${randomUUID()}::uuid, ${scheduleTemplateId}::uuid, 1,
        'solsticebay', 'central', 'invalid-radius', 1, 1.15, 1, 50)`);
    await assert.rejects(() => db`INSERT INTO virtual_world_treasure_hunt_templates
      (id, code, title, cadence, time_zone, active_from, active_until,
       distribution_mode, max_global_winners)
      VALUES (${randomUUID()}::uuid, ${'bad-season-' + scheduleTemplateId.slice(0, 8)},
        'Invalid seasonal template', 'seasonal', 'Africa/Lagos',
        NOW(), NULL, 'global', 10)`);

    // A failure while copying authored spawn points must roll back the
    // generated hunt too. A retry after the transient failure should create
    // exactly one complete snapshot rather than a hunt with no playable route.
    const recoveryTemplateId = randomUUID();
    const recoveryTemplateCode = 'recover-' + recoveryTemplateId.slice(0, 8);
    await db`INSERT INTO virtual_world_treasure_hunt_templates
      (id, code, title, world_id, cadence, time_zone, distribution_mode, enabled)
      VALUES (${recoveryTemplateId}::uuid, ${recoveryTemplateCode},
        'Schedule recovery test', ${worldId}::uuid, 'daily',
        'Africa/Lagos', 'team', TRUE)`;
    for (let sequence = 0; sequence < 2; sequence++) {
      await db`INSERT INTO virtual_world_treasure_template_spawn_points
        (id, template_id, sequence, city_id, district_id, interactable_id,
         position_x, position_y, position_z, interaction_radius, clue_payload)
        VALUES (${randomUUID()}::uuid, ${recoveryTemplateId}::uuid, ${sequence},
          'solsticebay', 'central', ${'recovery-' + sequence},
          ${sequence}, 1.15, 0, 2, ${{ title: 'Recovery clue ' + sequence }}::jsonb)`;
    }
    await db.unsafe(`CREATE FUNCTION fail_treasure_spawn_snapshot() RETURNS trigger
      LANGUAGE plpgsql AS $function$ BEGIN
        RAISE EXCEPTION 'simulated_spawn_snapshot_failure';
      END $function$`);
    await db.unsafe(`CREATE TRIGGER fail_treasure_spawn_snapshot
      BEFORE INSERT ON virtual_world_treasure_spawn_points
      FOR EACH ROW EXECUTE FUNCTION fail_treasure_spawn_snapshot()`);
    const scheduleInstant = Date.parse('2026-11-20T12:00:00Z');
    await assert.rejects(() => materializeScheduledTreasureHunts(db, scheduleInstant),
      /simulated_spawn_snapshot_failure/);
    const rolledBackSchedule = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_hunts WHERE template_id = ${recoveryTemplateId}::uuid`;
    assert.equal(rolledBackSchedule[0].total, 0);
    await db.unsafe("DROP TRIGGER fail_treasure_spawn_snapshot ON virtual_world_treasure_spawn_points");
    await db.unsafe("DROP FUNCTION fail_treasure_spawn_snapshot()");
    assert.equal(await materializeScheduledTreasureHunts(db, scheduleInstant), 1);
    assert.equal(await materializeScheduledTreasureHunts(db, scheduleInstant), 0);
    const recoveredSchedule = await db`SELECT id FROM virtual_world_treasure_hunts
      WHERE template_id = ${recoveryTemplateId}::uuid`;
    assert.equal(recoveredSchedule.length, 1);
    const recoveredSpawnPoints = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_spawn_points WHERE hunt_id = ${recoveredSchedule[0].id}::uuid`;
    assert.equal(recoveredSpawnPoints[0].total, 2);
    const recoveredCluePayloads = await db`SELECT clue_payload
      FROM virtual_world_treasure_spawn_points
      WHERE hunt_id = ${recoveredSchedule[0].id}::uuid
      ORDER BY sequence`;
    assert.deepEqual(recoveredCluePayloads.map(row => row.clue_payload),
      [{ title: "Recovery clue 0" }, { title: "Recovery clue 1" }]);

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
    await db.unsafe(`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES ($1, 'finite-supply', 'Finite Supply Badge', 'badge', 'rare', 1, TRUE)`,
      [collectibleId]);
    await db.unsafe(`INSERT INTO virtual_world_treasure_reward_items
      (hunt_id, collectible_id, quantity) VALUES ($1, $2, 1)`, [huntId, collectibleId]);
    const concurrentCollectibleGrants = await Promise.all([
      db.begin(tx => grantTreasureCollectibles(tx, huntId, userId)),
      db.begin(tx => grantTreasureCollectibles(tx, huntId, secondUserId))
    ]);
    assert.equal(concurrentCollectibleGrants.flat().length, 1);
    const finiteInventory = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_user_collectibles
      WHERE collectible_id = ${collectibleId}::uuid AND source_treasure_hunt_id = ${huntId}::uuid`;
    const finiteCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${collectibleId}::uuid`;

    assert.equal(finiteInventory[0].total, 1);
    assert.equal(Number(finiteCatalog[0].minted_count), 1);

    // Team completion grants from separate hunts must serialize on the shared
    // catalog row. The combined team awards may consume the finite supply only
    // once, even though both transactions try to grant to multiple members.
    const sharedTeamCollectibleId = randomUUID();
    const secondTeamHuntId = randomUUID();
    await db`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES (${sharedTeamCollectibleId}::uuid,
        ${'team-shared-' + sharedTeamCollectibleId.slice(0, 8)},
        'Shared Team Supply Badge', 'badge', 'epic', 2, TRUE)`;
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, starts_at, ends_at, enabled, reward_earned_credits)
      VALUES (${secondTeamHuntId}::uuid,
        ${'team-supply-' + secondTeamHuntId.slice(0, 8)},
        'Second team supply hunt', NOW() - INTERVAL '1 hour',
        NOW() + INTERVAL '1 hour', TRUE, 10)`;
    await db`INSERT INTO virtual_world_treasure_reward_items
      (hunt_id, collectible_id, quantity)
      VALUES
      (${huntId}::uuid, ${sharedTeamCollectibleId}::uuid, 1),
      (${secondTeamHuntId}::uuid, ${sharedTeamCollectibleId}::uuid, 1)`;
    const competingTeamGrants = await Promise.all([
      db.begin(tx => grantTreasureCollectiblesToUsers(tx, huntId, [userId, secondUserId])),
      replayDb.begin(tx => grantTreasureCollectiblesToUsers(tx, secondTeamHuntId, [thirdUserId, fourthUserId]))
    ]);
    assert.equal(competingTeamGrants.reduce((total, result) =>
      total + [...result.values()].reduce((count, rewards) => count + rewards.length, 0), 0), 2);
    const sharedTeamInventory = await db`SELECT COUNT(*)::integer AS total,
        COALESCE(SUM(quantity), 0)::integer AS quantity
      FROM virtual_world_user_collectibles
      WHERE collectible_id = ${sharedTeamCollectibleId}::uuid`;
    const sharedTeamCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${sharedTeamCollectibleId}::uuid`;
    assert.equal(sharedTeamInventory[0].total, 2);
    assert.equal(sharedTeamInventory[0].quantity, 2);
    assert.equal(Number(sharedTeamCatalog[0].minted_count), 2);

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
    // Simultaneous reconnects from separate gateway pools must converge on
    // one complete, immutable personal route without duplicate progress rows.
    const privateHintResults = await Promise.all([
      loadPrivateTreasureHints(db, privatePlayer, Date.now(),
        'integration-test-secret-that-is-at-least-32-characters'),
      loadPrivateTreasureHints(replayDb, privatePlayer, Date.now(),
        'integration-test-secret-that-is-at-least-32-characters')
    ]);
    const privateHints = privateHintResults[0];
    assert.equal(privateHints.length, 1);
    assert.deepEqual(privateHintResults[1], privateHints);
    assert.equal(privateHints[0].clue.title, 'Private clue');
    assert.equal('position_x' in privateHints[0].clue, false);
    const concurrentPrivateAssignments = await db`SELECT sequence, spawn_point_id AS "spawnPointId"
      FROM virtual_world_treasure_assignments
      WHERE hunt_id = ${privateHuntId}::uuid AND user_id = ${userId}::uuid
      ORDER BY sequence`;
    assert.equal(concurrentPrivateAssignments.length, 2);
    assert.deepEqual(concurrentPrivateAssignments.map(row => Number(row.sequence)), [0, 1]);
    const concurrentPrivateProgress = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_progress
      WHERE hunt_id = ${privateHuntId}::uuid AND user_id = ${userId}::uuid`;
    assert.equal(concurrentPrivateProgress[0].total, 1);
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
);
    await db.unsafe(`CREATE TRIGGER fail_treasure_inventory_insert
      BEFORE INSERT ON virtual_world_user_collectibles
      FOR EACH ROW EXECUTE FUNCTION fail_treasure_inventory_insert()`);
    const finalRecoveryInput = { id: userId, worldId,
      x: Number(finalRecoveryClue.x), y: Number(finalRecoveryClue.y),
      z: Number(finalRecoveryClue.z) };
    const finalRecoveryTarget = { id: finalRecoveryClue.interactableId,
      cityId: finalRecoveryClue.cityId, districtId: finalRecoveryClue.districtId };
    await assert.rejects(() => recordPrivateTreasureDiscovery(db, finalRecoveryInput,
      finalRecoveryTarget, Date.now(), recoverySecret, instanceId, processId, 1),
      /injected_treasure_inventory_failure/);
    const rolledBackRecovery = await db`SELECT progress.next_sequence AS sequence,
        progress.reward_issued_at AS "rewardIssuedAt",
        (SELECT COUNT(*)::integer FROM virtual_world_treasure_route_discoveries
          WHERE hunt_id = ${recoveryHuntId}::uuid AND user_id = ${userId}::uuid) AS discoveries,
        (SELECT COUNT(*)::integer FROM virtual_world_earned_credit_ledger
          WHERE idempotency_key = ${'private-treasure:' + recoveryHuntId + ':' + userId}) AS ledger,
        (SELECT COUNT(*)::integer FROM virtual_world_user_collectibles
          WHERE source_treasure_hunt_id = ${recoveryHuntId}::uuid) AS inventory
      FROM virtual_world_treasure_progress AS progress
      WHERE progress.hunt_id = ${recoveryHuntId}::uuid AND progress.user_id = ${userId}::uuid`;
    assert.equal(Number(rolledBackRecovery[0].sequence), 1);
    assert.equal(rolledBackRecovery[0].rewardIssuedAt, null);
    assert.equal(Number(rolledBackRecovery[0].discoveries), 1);
    assert.equal(Number(rolledBackRecovery[0].ledger), 0);
    assert.equal(Number(rolledBackRecovery[0].inventory), 0);
    const rolledBackCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${recoveryCollectibleId}::uuid`;
    assert.equal(Number(rolledBackCatalog[0].minted_count), 0);

    await db.unsafe("DROP TRIGGER fail_treasure_inventory_insert ON virtual_world_user_collectibles");
    await db.unsafe("DROP FUNCTION fail_treasure_inventory_insert()");
    const recoveredReward = await recordPrivateTreasureDiscovery(db, finalRecoveryInput,
      finalRecoveryTarget, Date.now(), recoverySecret, instanceId, processId, 1);
    assert.equal(recoveredReward.discovered, true);
    assert.equal(recoveredReward.completed, true);
    assert.equal(recoveredReward.rewardEarnedCredits, "31");
    assert.equal(recoveredReward.collectibles.length, 1);
    const recoveredLedger = await db`SELECT COUNT(*)::integer AS total, SUM(amount)::text AS amount
      FROM virtual_world_earned_credit_ledger
      WHERE idempotency_key = ${'private-treasure:' + recoveryHuntId + ':' + userId}`;
    assert.equal(Number(recoveredLedger[0].total), 1);
    assert.equal(recoveredLedger[0].amount, "31");
    const recoveredInventory = await db`SELECT COUNT(*)::integer AS total,
        COALESCE(SUM(quantity), 0)::integer AS quantity
      FROM virtual_world_user_collectibles
      WHERE source_treasure_hunt_id = ${recoveryHuntId}::uuid`;
    assert.equal(recoveredInventory[0].total, 1);
    assert.equal(recoveredInventory[0].quantity, 1);
    const recoveredCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${recoveryCollectibleId}::uuid`;
    assert.equal(Number(recoveredCatalog[0].minted_count), 1);

    // Two personal players racing for a single reward slot must not both
    // receive Earned Credits. Use independent PostgreSQL pools to exercise
    // the transaction-level claim lock under real contention.
    const cappedPrivateHuntId = randomUUID();
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, enabled,
       reward_earned_credits, max_reward_claims, distribution_mode)
      VALUES (${cappedPrivateHuntId}::uuid, ${'private-cap-' + cappedPrivateHuntId.slice(0, 8)},
        'Competing personal reward claims', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour',
        TRUE, 73, 1, 'personal')`;
    for (let sequence = 0; sequence < 2; sequence++) {
      for (let candidate = 0; candidate < 2; candidate++) {
        const point = { id: randomUUID(), sequence,
          interactableId: 'private-cap-' + sequence + '-' + candidate,
          x: sequence * 10 + candidate * 0.1, y: 1.15, z: candidate * 0.1 };
        await db`INSERT INTO virtual_world_treasure_spawn_points
          (id, hunt_id, sequence, city_id, district_id, interactable_id,
           position_x, position_y, position_z, interaction_radius)
          VALUES (${point.id}::uuid, ${cappedPrivateHuntId}::uuid, ${sequence},
            'solsticebay', 'central', ${point.interactableId},
            ${point.x}, ${point.y}, ${point.z}, 2)`;
      }
    }
    const cappedPrivatePlayers = [userId, secondUserId];
    const privateSecret = 'integration-test-secret-that-is-at-least-32-characters';
    for (const playerId of cappedPrivatePlayers) {
      const hints = await loadPrivateTreasureHints(db,
        { id: playerId, worldId, x: 0, y: 1.15, z: 0 }, Date.now(), privateSecret);
      // Earlier fixtures leave another active personal hunt for these users;
      // assert the route belonging to this capped hunt, not the global hint list.
      assert.equal(hints.filter(hint => hint.huntId === cappedPrivateHuntId).length, 1);
    }
    const cappedPrivateRoutes = await Promise.all(cappedPrivatePlayers.map(async playerId => db`
      SELECT assignment.sequence, point.interactable_id AS "interactableId",
        point.city_id AS "cityId", point.district_id AS "districtId",
        point.position_x AS x, point.position_y AS y, point.position_z AS z
      FROM virtual_world_treasure_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE assignment.hunt_id = ${cappedPrivateHuntId}::uuid
        AND assignment.user_id = ${playerId}::uuid ORDER BY assignment.sequence`));
    assert.equal(cappedPrivateRoutes.every(route => route.length === 2), true);
    for (let index = 0; index < cappedPrivatePlayers.length; index++) {
      const playerId = cappedPrivatePlayers[index];
      const first = cappedPrivateRoutes[index][0];
      const result = await recordPrivateTreasureDiscovery(db,
        { id: playerId, worldId, x: Number(first.x), y: Number(first.y), z: Number(first.z) },
        { id: first.interactableId, cityId: first.cityId, districtId: first.districtId },
        Date.now(), privateSecret, instanceId, processId, 1);
      assert.equal(result.discovered, true);
      assert.equal(result.completed, false);
    }
    const competingPrivateClaims = await Promise.all(cappedPrivatePlayers.map(async (playerId, index) => {
      const final = cappedPrivateRoutes[index][1];
      return recordPrivateTreasureDiscovery(index === 0 ? db : replayDb,
        { id: playerId, worldId, x: Number(final.x), y: Number(final.y), z: Number(final.z) },
        { id: final.interactableId, cityId: final.cityId, districtId: final.districtId },
        Date.now(), privateSecret, instanceId, processId, 1);
    }));
    assert.equal(competingPrivateClaims.filter(result => result.rewardEarnedCredits === '73').length, 1);
    assert.equal(competingPrivateClaims.filter(result =>
      result.code === 'treasure_reward_claim_limit_reached').length, 1);
    const privateCapClaims = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_global_claims WHERE hunt_id = ${cappedPrivateHuntId}::uuid`;
    assert.equal(privateCapClaims[0].total, 1);
    const privateCapLedger = await db`SELECT COUNT(*)::integer AS total,
        COALESCE(SUM(amount), 0)::text AS amount
      FROM virtual_world_earned_credit_ledger
      WHERE source_treasure_hunt_id = ${cappedPrivateHuntId}::uuid`;
    assert.equal(privateCapLedger[0].total, 1);
    assert.equal(BigInt(privateCapLedger[0].amount), 73n);

    const teamHuntId = randomUUID();
    const teamCollectibleId = randomUUID();
    await db`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES (${teamCollectibleId}::uuid, 'team-completion-badge', 'Team Completion Badge',
        'badge', 'epic', 2, TRUE)`;
    const teamSecret = 'team-runtime-integration-secret-at-least-32-bytes';
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, enabled, reward_earned_credits, distribution_mode)
      VALUES (${teamHuntId}::uuid, 'team-runtime-test', 'Team runtime test', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', TRUE, 101, 'team')`;
    await db`INSERT INTO virtual_world_treasure_reward_items
      (hunt_id, collectible_id, quantity)
      VALUES (${teamHuntId}::uuid, ${teamCollectibleId}::uuid, 1)`;
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
    assert.equal(hintsForMember[0].teamId, createdTeamId);
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
      FROM virtual_world_earned_credit_ledger
      WHERE idempotency_key LIKE ${'team-treasure:' + createdTeamId + ':%'}
      ORDER BY user_id`;
    assert.equal(teamLedger.length, 2);
    // Each member's immutable ledger entry must match that member's allocation,
    // not merely produce the right aggregate reward total.
    const allocationByUser = new Map(teamAllocations.map(row => [row.userId, BigInt(row.amount)]));
    const ledgerByUser = new Map(teamLedger.map(row => [row.userId, BigInt(row.amount)]));
    assert.deepEqual([...ledgerByUser.keys()].sort(), [...allocationByUser.keys()].sort());
    for (const [memberId, allocatedAmount] of allocationByUser) {
      assert.equal(ledgerByUser.get(memberId), allocatedAmount,
        `Earned Credits ledger amount must match team allocation for ${memberId}`);
    }
    // Read the committed rows through a second pool to verify that the
    // allocation/ledger pair is visible consistently outside the writer.
    const [replayedAllocations, replayedLedger] = await Promise.all([
      replayDb`SELECT user_id AS "userId", amount::text AS amount
        FROM virtual_world_treasure_team_reward_allocations
        WHERE team_id = ${createdTeamId}::uuid ORDER BY user_id`,
      replayDb`SELECT user_id AS "userId", amount::text AS amount
        FROM virtual_world_earned_credit_ledger
        WHERE idempotency_key LIKE ${'team-treasure:' + createdTeamId + ':%'}
        ORDER BY user_id`
    ]);
    assert.deepEqual(replayedAllocations, teamAllocations);
    assert.deepEqual(replayedLedger, teamLedger);
    const teamInventory = await db`SELECT user_id AS "userId", quantity
      FROM virtual_world_user_collectibles
      WHERE collectible_id = ${teamCollectibleId}::uuid
        AND source_treasure_hunt_id = ${teamHuntId}::uuid
      ORDER BY user_id`;
    assert.deepEqual(teamInventory.map(row => row.userId).sort(), [userId, secondUserId].sort());
    assert.deepEqual(teamInventory.map(row => Number(row.quantity)), [1, 1]);
    const teamCatalogSupply = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${teamCollectibleId}::uuid`;
    assert.equal(Number(teamCatalogSupply[0].minted_count), 2);
    // Simulate a client retry after the completion response was lost. The
    // completed route must not mint another inventory row or increment supply.
    const replayedCompletion = await recordTeamTreasureDiscovery(db,
      { id: finalUserId, worldId, x: Number(secondStep.x), y: Number(secondStep.y), z: Number(secondStep.z) },
      { id: secondStep.interactableId, cityId: secondStep.cityId, districtId: secondStep.districtId },
      Date.now(), teamSecret, instanceId, processId, 1);
    assert.equal(replayedCompletion.discovered, false);
    const replayInventory = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_user_collectibles
      WHERE collectible_id = ${teamCollectibleId}::uuid
        AND source_treasure_hunt_id = ${teamHuntId}::uuid`;
    const replaySupply = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${teamCollectibleId}::uuid`;
    assert.equal(replayInventory[0].total, 2);
    assert.equal(Number(replaySupply[0].minted_count), 2);
    // A retry routed to another gateway DB pool must also be a no-op after
    // the committed completion, with no second credit or collectible grant.
    const independentReplay = await recordTeamTreasureDiscovery(replayDb,
      { id: finalUserId, worldId, x: Number(secondStep.x), y: Number(secondStep.y), z: Number(secondStep.z) },
      { id: secondStep.interactableId, cityId: secondStep.cityId, districtId: secondStep.districtId },
      Date.now(), teamSecret, instanceId, processId, 1);
    assert.equal(independentReplay.discovered, false);
    assert.equal(independentReplay.completed, false);
    assert.equal(independentReplay.rewardEarnedCredits, "0");
    const [postReplayLedger, postReplayAllocations, postReplayInventory, postReplaySupply] = await Promise.all([
      replayDb`SELECT user_id AS "userId", amount::text AS amount
        FROM virtual_world_earned_credit_ledger
        WHERE idempotency_key LIKE ${'team-treasure:' + createdTeamId + ':%'} ORDER BY user_id`,
      replayDb`SELECT user_id AS "userId", amount::text AS amount
        FROM virtual_world_treasure_team_reward_allocations
        WHERE team_id = ${createdTeamId}::uuid ORDER BY user_id`,
      replayDb`SELECT COUNT(*)::integer AS total FROM virtual_world_user_collectibles
        WHERE collectible_id = ${teamCollectibleId}::uuid
          AND source_treasure_hunt_id = ${teamHuntId}::uuid`,
      replayDb`SELECT minted_count FROM virtual_world_collectible_catalog
        WHERE id = ${teamCollectibleId}::uuid`
    ]);
    assert.deepEqual(postReplayLedger, teamLedger);
    assert.deepEqual(postReplayAllocations, teamAllocations);
    assert.equal(postReplayInventory[0].total, 2);
    assert.equal(Number(postReplaySupply[0].minted_count), 2);
    const completedHints = await loadTeamTreasureHints(db, privatePlayer, Date.now());
    assert.equal(completedHints.length, 0);

    // Two independent teams may progress concurrently, but only one may
    // consume the final hunt-wide reward slot. This exercises the shared hunt
    // row lock plus the final-section advisory lock using separate DB pools.
    const cappedTeamHuntId = randomUUID();
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, enabled,
       reward_earned_credits, max_reward_claims, distribution_mode)
      VALUES (${cappedTeamHuntId}::uuid, ${'team-cap-' + cappedTeamHuntId.slice(0, 8)},
        'Competing team reward claims', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour',
        TRUE, 59, 1, 'team')`;
    for (let sequence = 0; sequence < 2; sequence++) {
      for (let candidate = 0; candidate < 2; candidate++) {
        const point = { id: randomUUID(), sequence,
          interactableId: 'team-cap-' + sequence + '-' + candidate,
          x: sequence * 10 + candidate, y: 1.15, z: candidate };
        await db`INSERT INTO virtual_world_treasure_spawn_points
          (id, hunt_id, sequence, city_id, district_id, interactable_id,
           position_x, position_y, position_z, interaction_radius)
          VALUES (${point.id}::uuid, ${cappedTeamHuntId}::uuid, ${sequence},
            'solsticebay', 'central', ${point.interactableId},
            ${point.x}, ${point.y}, ${point.z}, 2)`;
      }
    }
    const cappedTeamA = await createTreasureTeam(
      db, cappedTeamHuntId, userId, worldId, 2, Date.now(), teamSecret);
    const cappedTeamB = await createTreasureTeam(
      db, cappedTeamHuntId, thirdUserId, worldId, 2, Date.now(), teamSecret);
    assert.equal(cappedTeamA.ok, true);
    assert.equal(cappedTeamB.ok, true);
    assert.equal((await joinTreasureTeam(
      db, cappedTeamA.teamId, secondUserId, worldId, Date.now())).ok, true);
    assert.equal((await joinTreasureTeam(
      db, cappedTeamB.teamId, fourthUserId, worldId, Date.now())).ok, true);
    const cappedTeamRoutes = await Promise.all([cappedTeamA.teamId, cappedTeamB.teamId].map(team => db`
      SELECT assignment.sequence, point.interactable_id AS "interactableId",
        point.city_id AS "cityId", point.district_id AS "districtId",
        point.position_x AS x, point.position_y AS y, point.position_z AS z
      FROM virtual_world_treasure_team_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE assignment.team_id = ${team}::uuid ORDER BY assignment.sequence`));
    assert.equal(cappedTeamRoutes.every(route => route.length === 2), true);
    const cappedTeamPlayers = [
      { teamId: cappedTeamA.teamId, owner: userId, finisher: secondUserId, route: cappedTeamRoutes[0] },
      { teamId: cappedTeamB.teamId, owner: thirdUserId, finisher: fourthUserId, route: cappedTeamRoutes[1] }
    ];
    for (const contender of cappedTeamPlayers) {
      const first = contender.route[0];
      const firstResult = await recordTeamTreasureDiscovery(db,
        { id: contender.owner, worldId, x: Number(first.x), y: Number(first.y), z: Number(first.z) },
        { id: first.interactableId, cityId: first.cityId, districtId: first.districtId },
        Date.now(), teamSecret, instanceId, processId, 1);
      assert.equal(firstResult.discovered, true);
      assert.equal(firstResult.completed, false);
    }
    const concurrentTeamClaims = await Promise.all(cappedTeamPlayers.map((contender, index) => {
      const final = contender.route[1];
      return recordTeamTreasureDiscovery(index === 0 ? db : replayDb,
        { id: contender.finisher, worldId, x: Number(final.x), y: Number(final.y), z: Number(final.z) },
        { id: final.interactableId, cityId: final.cityId, districtId: final.districtId },
        Date.now(), teamSecret, instanceId, processId, 1);
    }));
    assert.equal(concurrentTeamClaims.every(result => result.discovered && result.completed), true);
    // The discovery response reports the completing player's allocated share,
    // not the full team pool. The ledger assertions below verify conservation
    // across every member of the one winning team.
    assert.equal(concurrentTeamClaims.filter(result =>
      BigInt(result.rewardEarnedCredits) > 0n).length, 1);
    assert.equal(concurrentTeamClaims.filter(result => result.code === 'team_treasure_claim_limit_reached').length, 1);
    const [cappedTeamClaims, cappedTeamLedger, cappedTeamAllocations] = await Promise.all([
      db`SELECT COUNT(*)::integer AS total FROM virtual_world_treasure_global_claims
        WHERE hunt_id = ${cappedTeamHuntId}::uuid`,
      replayDb`SELECT COUNT(*)::integer AS total, COALESCE(SUM(amount), 0)::text AS amount
        FROM virtual_world_earned_credit_ledger
        WHERE source_treasure_hunt_id = ${cappedTeamHuntId}::uuid`,
      db`SELECT COUNT(*)::integer AS total FROM virtual_world_treasure_team_reward_allocations
        WHERE team_id = ANY(${cappedTeamPlayers.map(item => item.teamId)}::uuid[])`
    ]);
    assert.equal(cappedTeamClaims[0].total, 1);
    assert.equal(cappedTeamLedger[0].total, 2);
    assert.equal(BigInt(cappedTeamLedger[0].amount), 59n);
    assert.equal(cappedTeamAllocations[0].total, 2);

    // A failure after reward writes but before COMMIT must roll back the
    // completion, ledger, allocations, inventory and minted supply together.
    // Retrying the same final clue must then recover exactly one complete award.
    const recoveryHuntId = randomUUID();
    const recoveryCollectibleId = randomUUID();
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, enabled,
       reward_earned_credits, distribution_mode)
      VALUES (${recoveryHuntId}::uuid, ${'recovery-' + recoveryHuntId.slice(0, 8)},
        'Reward transaction recovery', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour',
        TRUE, 37, 'team')`;
    await db`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES (${recoveryCollectibleId}::uuid, 'recovery-badge-' || ${recoveryHuntId.slice(0, 8)},
        'Recovery Badge', 'badge', 'rare', 2, TRUE)`;
    await db`INSERT INTO virtual_world_treasure_reward_items
      (hunt_id, collectible_id, quantity)
      VALUES (${recoveryHuntId}::uuid, ${recoveryCollectibleId}::uuid, 1)`;
    for (let sequence = 0; sequence < 2; sequence++) {
      const point = { id: randomUUID(), sequence, interactableId: 'recovery-' + sequence,
        x: sequence * 10, y: 1.15, z: 0 };
      await db`INSERT INTO virtual_world_treasure_spawn_points
        (id, hunt_id, sequence, city_id, district_id, interactable_id,
         position_x, position_y, position_z, interaction_radius)
        VALUES (${point.id}::uuid, ${recoveryHuntId}::uuid, ${sequence},
          'solsticebay', 'central', ${point.interactableId}, ${point.x}, ${point.y}, ${point.z}, 2)`;
    }
    const recoveryTeam = await createTreasureTeam(
      db, recoveryHuntId, userId, worldId, 2, Date.now(), teamSecret);
    assert.equal(recoveryTeam.ok, true);
    const recoveryJoin = await joinTreasureTeam(
      db, recoveryTeam.teamId, secondUserId, worldId, Date.now());
    assert.equal(recoveryJoin.ok, true);
    const recoveryRoute = await db`SELECT assignment.sequence,
        point.interactable_id AS "interactableId", point.city_id AS "cityId",
        point.district_id AS "districtId", point.position_x AS x,
        point.position_y AS y, point.position_z AS z
      FROM virtual_world_treasure_team_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE assignment.team_id = ${recoveryTeam.teamId}::uuid
      ORDER BY assignment.sequence`;
    assert.equal(recoveryRoute.length, 2);
    const recoveryFirst = recoveryRoute[0];
    const recoveryFinal = recoveryRoute[1];
    const recoveryFirstResult = await recordTeamTreasureDiscovery(db,
      { id: userId, worldId, x: Number(recoveryFirst.x), y: Number(recoveryFirst.y), z: Number(recoveryFirst.z) },
      { id: recoveryFirst.interactableId, cityId: recoveryFirst.cityId, districtId: recoveryFirst.districtId },
      Date.now(), teamSecret, instanceId, processId, 1);
    assert.equal(recoveryFirstResult.discovered, true);

    // A replacement process takes ownership while the old process still has
    // an unexpired local view of its lease. The database generation fence
    // must reject the old process before it can consume the final clue.
    const takeoverProcessId = randomUUID();
    await db`UPDATE virtual_world_instances
      SET owner_process_id = ${takeoverProcessId}::uuid,
          owner_generation = 2,
          owner_lease_expires_at = NOW() + INTERVAL '1 hour'
      WHERE id = ${instanceId}::uuid`;
    const staleOwnerAttempt = await recordTeamTreasureDiscovery(db,
      { id: secondUserId, worldId, x: Number(recoveryFinal.x), y: Number(recoveryFinal.y), z: Number(recoveryFinal.z) },
      { id: recoveryFinal.interactableId, cityId: recoveryFinal.cityId, districtId: recoveryFinal.districtId },
      Date.now(), teamSecret, instanceId, processId, 1);
    assert.equal(staleOwnerAttempt.handled, true);
    assert.equal(staleOwnerAttempt.discovered, false);
    assert.equal(staleOwnerAttempt.completed, false);
    assert.equal(staleOwnerAttempt.code, 'stale_gateway_owner');
    const fencedProgress = await db`SELECT next_sequence AS "nextSequence"
      FROM virtual_world_treasure_team_progress WHERE team_id = ${recoveryTeam.teamId}::uuid`;
    assert.equal(Number(fencedProgress[0].nextSequence), 1);

    // A stale allocation row must not be accepted merely because the
    // idempotency key prevents a duplicate insert. Completion must fail closed
    // and roll back the final clue until the conflicting row is repaired.
    await db`INSERT INTO virtual_world_treasure_team_reward_allocations
      (team_id, user_id, contribution_points, amount)
      VALUES (${recoveryTeam.teamId}::uuid, ${secondUserId}::uuid, 2, 999)`;
    await assert.rejects(() => recordTeamTreasureDiscovery(db,
      { id: secondUserId, worldId, x: Number(recoveryFinal.x), y: Number(recoveryFinal.y), z: Number(recoveryFinal.z) },
      { id: recoveryFinal.interactableId, cityId: recoveryFinal.cityId, districtId: recoveryFinal.districtId },
      Date.now(), teamSecret, instanceId, takeoverProcessId, 2),
      /team_treasure_allocation_integrity_mismatch/);
    const conflictRollback = await db`SELECT
        (SELECT next_sequence FROM virtual_world_treasure_team_progress WHERE team_id = ${recoveryTeam.teamId}::uuid)::integer AS "nextSequence",
        (SELECT status FROM virtual_world_treasure_teams WHERE id = ${recoveryTeam.teamId}::uuid) AS "teamStatus",
        (SELECT COUNT(*) FROM virtual_world_earned_credit_ledger
          WHERE idempotency_key LIKE ${'team-treasure:' + recoveryTeam.teamId + ':%'})::integer AS ledger,
        (SELECT COUNT(*) FROM virtual_world_user_collectibles
          WHERE source_treasure_hunt_id = ${recoveryHuntId}::uuid)::integer AS inventory`;
    assert.equal(conflictRollback[0].nextSequence, 1);
    assert.equal(conflictRollback[0].teamStatus, 'active');
    assert.equal(conflictRollback[0].ledger, 0);
    assert.equal(conflictRollback[0].inventory, 0);
    await db`DELETE FROM virtual_world_treasure_team_reward_allocations
      WHERE team_id = ${recoveryTeam.teamId}::uuid AND user_id = ${secondUserId}::uuid`;

    // Inject a failure after the Earned Credits ledger writes but before
    // collectible inventory is inserted. The whole completion transaction
    // must roll back, including progress, allocations and ledger rows.
    const failDuringCollectibleGrantDb = {
      begin: fn => db.begin(async tx => {
        const guardedTx = new Proxy(tx, {
          get(target, property) {
            if (property === 'unsafe') return (query, ...args) => {
              if (typeof query === 'string' &&
                  query.includes('INSERT INTO virtual_world_user_collectibles')) {
                throw new Error('simulated_collectible_grant_failure');
              }
              return target.unsafe(query, ...args);
            };
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
          apply(target, thisArg, args) {
            return Reflect.apply(target, thisArg, args);
          }
        });
        return fn(guardedTx);
      })
    };
    await assert.rejects(() => recordTeamTreasureDiscovery(failDuringCollectibleGrantDb,
      { id: secondUserId, worldId, x: Number(recoveryFinal.x), y: Number(recoveryFinal.y), z: Number(recoveryFinal.z) },
      { id: recoveryFinal.interactableId, cityId: recoveryFinal.cityId, districtId: recoveryFinal.districtId },
      Date.now(), teamSecret, instanceId, takeoverProcessId, 2), /simulated_collectible_grant_failure/);
    const partialFailureState = await db`SELECT
        (SELECT next_sequence FROM virtual_world_treasure_team_progress WHERE team_id = ${recoveryTeam.teamId}::uuid)::integer AS "nextSequence",
        (SELECT status FROM virtual_world_treasure_teams WHERE id = ${recoveryTeam.teamId}::uuid) AS "teamStatus",
        (SELECT COUNT(*) FROM virtual_world_earned_credit_ledger
          WHERE idempotency_key LIKE ${'team-treasure:' + recoveryTeam.teamId + ':%'})::integer AS ledger,
        (SELECT COUNT(*) FROM virtual_world_treasure_team_reward_allocations
          WHERE team_id = ${recoveryTeam.teamId}::uuid)::integer AS allocations,
        (SELECT COUNT(*) FROM virtual_world_user_collectibles
          WHERE source_treasure_hunt_id = ${recoveryHuntId}::uuid)::integer AS inventory`;
    assert.equal(partialFailureState[0].nextSequence, 1);
    assert.equal(partialFailureState[0].teamStatus, 'active');
    assert.equal(partialFailureState[0].ledger, 0);
    assert.equal(partialFailureState[0].allocations, 0);
    assert.equal(partialFailureState[0].inventory, 0);

    const failBeforeCommitDb = {
      begin: fn => db.begin(async tx => {
        const result = await fn(tx);
        if (result.completed) throw new Error('simulated_reward_commit_failure');
        return result;
      })
    };
    await assert.rejects(() => recordTeamTreasureDiscovery(failBeforeCommitDb,
      { id: secondUserId, worldId, x: Number(recoveryFinal.x), y: Number(recoveryFinal.y), z: Number(recoveryFinal.z) },
      { id: recoveryFinal.interactableId, cityId: recoveryFinal.cityId, districtId: recoveryFinal.districtId },
      Date.now(), teamSecret, instanceId, takeoverProcessId, 2), /simulated_reward_commit_failure/);
    const rolledBackProgress = await db`SELECT next_sequence AS "nextSequence", completed_at AS "completedAt"
      FROM virtual_world_treasure_team_progress WHERE team_id = ${recoveryTeam.teamId}::uuid`;
    const rolledBackTeam = await db`SELECT status FROM virtual_world_treasure_teams
      WHERE id = ${recoveryTeam.teamId}::uuid`;
    const rolledBackLedger = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_earned_credit_ledger
      WHERE idempotency_key LIKE ${'team-treasure:' + recoveryTeam.teamId + ':%'}`;
    const rolledBackInventory = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_user_collectibles
      WHERE source_treasure_hunt_id = ${recoveryHuntId}::uuid`;
    const rolledBackCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${recoveryCollectibleId}::uuid`;
    assert.equal(Number(rolledBackProgress[0].nextSequence), 1);
    assert.equal(rolledBackProgress[0].completedAt, null);
    assert.equal(rolledBackTeam[0].status, 'active');
    assert.equal(rolledBackLedger[0].total, 0);
    assert.equal(rolledBackInventory[0].total, 0);
    assert.equal(Number(rolledBackCatalog[0].minted_count), 0);
    const recoveredCompletion = await recordTeamTreasureDiscovery(db,
      { id: secondUserId, worldId, x: Number(recoveryFinal.x), y: Number(recoveryFinal.y), z: Number(recoveryFinal.z) },
      { id: recoveryFinal.interactableId, cityId: recoveryFinal.cityId, districtId: recoveryFinal.districtId },
      Date.now(), teamSecret, instanceId, takeoverProcessId, 2);
    assert.equal(recoveredCompletion.completed, true);
    assert.equal(BigInt(recoveredCompletion.rewardEarnedCredits) > 0n, true);
    const recoveredLedger = await db`SELECT COUNT(*)::integer AS total,
        COALESCE(SUM(amount), 0)::text AS amount
      FROM virtual_world_earned_credit_ledger
      WHERE idempotency_key LIKE ${'team-treasure:' + recoveryTeam.teamId + ':%'}`;
    const recoveredInventory = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_user_collectibles
      WHERE source_treasure_hunt_id = ${recoveryHuntId}::uuid`;
    const recoveredCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${recoveryCollectibleId}::uuid`;
    assert.equal(recoveredLedger[0].total, 2);
    assert.equal(BigInt(recoveredLedger[0].amount), 37n);
    assert.equal(recoveredInventory[0].total, 2);
    assert.equal(Number(recoveredCatalog[0].minted_count), 2);

    // Reconnect history must return only the requesting member's completed
    // team allocation, and the receipt amount must match that member's ledger.
    const loadTeamRewardReceipts = user => db`SELECT allocation.team_id AS "teamId",
        hunt.id AS "huntId", hunt.title, allocation.amount::text AS "rewardEarnedCredits",
        allocation.contribution_points AS "contributionPoints",
        allocation.created_at AS "awardedAt"
      FROM virtual_world_treasure_team_reward_allocations AS allocation
      JOIN virtual_world_treasure_teams AS team ON team.id = allocation.team_id
      JOIN virtual_world_treasure_hunts AS hunt ON hunt.id = team.hunt_id
      WHERE allocation.user_id = ${user}::uuid AND team.status = 'completed'
      ORDER BY allocation.created_at DESC, allocation.team_id LIMIT 100`;
    const [ownerReceipts, memberReceipts, unrelatedReceipts] = await Promise.all([
      loadTeamRewardReceipts(userId), loadTeamRewardReceipts(secondUserId),
      loadTeamRewardReceipts(thirdUserId)
    ]);
    assert.equal(ownerReceipts.some(row => row.teamId === recoveryTeam.teamId), true);
    assert.equal(memberReceipts.some(row => row.teamId === recoveryTeam.teamId), true);
    assert.equal(unrelatedReceipts.some(row => row.teamId === recoveryTeam.teamId), false);
    const ownerRecoveryReceipt = ownerReceipts.find(row => row.teamId === recoveryTeam.teamId);
    const memberRecoveryReceipt = memberReceipts.find(row => row.teamId === recoveryTeam.teamId);
    for (const [receipt, expectedUser] of [[ownerRecoveryReceipt, userId], [memberRecoveryReceipt, secondUserId]]) {
      assert.equal(receipt.teamId, recoveryTeam.teamId);
      assert.equal(receipt.huntId, recoveryHuntId);
      const ledgerRows = await db`SELECT amount::text AS amount
        FROM virtual_world_earned_credit_ledger
        WHERE user_id = ${expectedUser}::uuid
          AND idempotency_key = ${'team-treasure:' + recoveryTeam.teamId + ':' + expectedUser}`;
      assert.equal(ledgerRows.length, 1);
      assert.equal(receipt.rewardEarnedCredits, ledgerRows[0].amount);
    }
    const repeatedOwnerReceipts = await loadTeamRewardReceipts(userId);
    assert.deepEqual(repeatedOwnerReceipts, ownerReceipts);

    // Offline reconnect inventory must expose the collectible granted by the
    // completed team hunt to each member, without mutating minted supply.
    const loadUserTreasureInventory = user => db`SELECT catalog.code,
        catalog.display_name AS "displayName", catalog.category, catalog.rarity,
        inventory.quantity, inventory.awarded_at AS "awardedAt"
      FROM virtual_world_user_collectibles AS inventory
      JOIN virtual_world_collectible_catalog AS catalog
        ON catalog.id = inventory.collectible_id
      WHERE inventory.user_id = ${user}::uuid
      ORDER BY inventory.awarded_at DESC, inventory.id DESC LIMIT 100`;
    const [ownerInventory, memberInventory] = await Promise.all([
      loadUserTreasureInventory(userId), loadUserTreasureInventory(secondUserId)
    ]);
    for (const inventory of [ownerInventory, memberInventory]) {
      assert.equal(inventory.some(item => item.code.startsWith('recovery-badge-') && Number(item.quantity) === 1), true);
    }
    const stableMintedSupply = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${recoveryCollectibleId}::uuid`;
    assert.equal(Number(stableMintedSupply[0].minted_count), 2);
    const recoveredReplay = await recordTeamTreasureDiscovery(db,
      { id: secondUserId, worldId, x: Number(recoveryFinal.x), y: Number(recoveryFinal.y), z: Number(recoveryFinal.z) },
      { id: recoveryFinal.interactableId, cityId: recoveryFinal.cityId, districtId: recoveryFinal.districtId },
      Date.now(), teamSecret, instanceId, takeoverProcessId, 2);
    assert.equal(recoveredReplay.discovered, false);
    const finalRecoveryCounts = await db`SELECT
        (SELECT COUNT(*) FROM virtual_world_earned_credit_ledger
          WHERE idempotency_key LIKE ${'team-treasure:' + recoveryTeam.teamId + ':%'})::integer AS ledger,
        (SELECT COUNT(*) FROM virtual_world_user_collectibles
          WHERE source_treasure_hunt_id = ${recoveryHuntId}::uuid)::integer AS inventory`;
    assert.equal(finalRecoveryCounts[0].ledger, 2);
    assert.equal(finalRecoveryCounts[0].inventory, 2);

    // Distinct teams must complete concurrently without serializing ordinary
    // discoveries on the hunt row, while the final reward cap remains strict.
    const cappedHuntId = randomUUID();
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, enabled,
       reward_earned_credits, max_reward_claims, distribution_mode)
      VALUES (${cappedHuntId}::uuid, ${'team-cap-' + cappedHuntId.slice(0, 8)},
        'Concurrent reward-cap test', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour',
        TRUE, 101, 1, 'team')`;
    const cappedCollectibleId = randomUUID();
    await db`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES (${cappedCollectibleId}::uuid, 'competing-team-badge', 'Competing Team Badge',
        'badge', 'rare', 2, TRUE)`;
    await db`INSERT INTO virtual_world_treasure_reward_items
      (hunt_id, collectible_id, quantity)
      VALUES (${cappedHuntId}::uuid, ${cappedCollectibleId}::uuid, 1)`;
    for (let sequence = 0; sequence < 2; sequence++) {
      for (let candidate = 0; candidate < 2; candidate++) {
        const point = { id: randomUUID(), sequence, interactableId: 'cap-' + sequence + '-' + candidate,
          x: sequence * 10 + candidate, y: 1.15, z: candidate };
        await db`INSERT INTO virtual_world_treasure_spawn_points
          (id, hunt_id, sequence, city_id, district_id, interactable_id,
           position_x, position_y, position_z, interaction_radius)
          VALUES (${point.id}::uuid, ${cappedHuntId}::uuid, ${sequence}, 'solsticebay',
            'central', ${point.interactableId}, ${point.x}, ${point.y}, ${point.z}, 2)`;
      }
    }
    const [capTeamA, capTeamB] = await Promise.all([
      createTreasureTeam(db, cappedHuntId, userId, worldId, 2, Date.now(), teamSecret),
      createTreasureTeam(db, cappedHuntId, thirdUserId, worldId, 2, Date.now(), teamSecret)
    ]);
    assert.equal(capTeamA.ok, true);
    assert.equal(capTeamB.ok, true);
    const [capJoinA, capJoinB] = await Promise.all([
      joinTreasureTeam(db, capTeamA.teamId, secondUserId, worldId, Date.now()),
      joinTreasureTeam(db, capTeamB.teamId, fourthUserId, worldId, Date.now())
    ]);
    assert.equal(capJoinA.ok, true);
    assert.equal(capJoinB.ok, true);
    const capRoutes = await Promise.all([capTeamA.teamId, capTeamB.teamId].map(async teamId => db`
      SELECT assignment.sequence, point.interactable_id AS "interactableId",
        point.city_id AS "cityId", point.district_id AS "districtId",
        point.position_x AS x, point.position_y AS y, point.position_z AS z
      FROM virtual_world_treasure_team_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE assignment.team_id = ${teamId}::uuid ORDER BY assignment.sequence`));
    assert.equal(capRoutes.every(route => route.length === 2), true);
    const capPlayers = [
      { owner: userId, member: secondUserId, route: capRoutes[0] },
      { owner: thirdUserId, member: fourthUserId, route: capRoutes[1] }
    ];
    const firstCapDiscoveries = await Promise.all(capPlayers.map(({ owner, route }) => {
      const point = route[0];
      return recordTeamTreasureDiscovery(db,
        { id: owner, worldId, x: Number(point.x), y: Number(point.y), z: Number(point.z) },
        { id: point.interactableId, cityId: point.cityId, districtId: point.districtId },
        Date.now(), teamSecret, instanceId, takeoverProcessId, 2);
    }));
    assert.equal(firstCapDiscoveries.every(result => result.discovered && !result.completed), true, JSON.stringify(firstCapDiscoveries));
    const finalCapDiscoveries = await Promise.all(capPlayers.map(({ member, route }) => {
      const point = route[1];
      return recordTeamTreasureDiscovery(db,
        { id: member, worldId, x: Number(point.x), y: Number(point.y), z: Number(point.z) },
        { id: point.interactableId, cityId: point.cityId, districtId: point.districtId },
        Date.now(), teamSecret, instanceId, takeoverProcessId, 2);
    }));
    assert.equal(finalCapDiscoveries.every(result => result.completed), true);
    assert.equal(finalCapDiscoveries.filter(result => result.code === 'team_treasure_claim_limit_reached').length, 1);
    assert.equal(finalCapDiscoveries.filter(result => BigInt(result.rewardEarnedCredits) > 0n).length, 1);
    const cappedClaims = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_global_claims WHERE hunt_id = ${cappedHuntId}::uuid`;
    assert.equal(cappedClaims[0].total, 1);
    const cappedLedger = await db`SELECT COUNT(*)::integer AS total, COALESCE(SUM(amount), 0)::text AS amount
      FROM virtual_world_earned_credit_ledger
      WHERE source_treasure_hunt_id = ${cappedHuntId}::uuid`;
    assert.equal(cappedLedger[0].total, 2);
    assert.equal(BigInt(cappedLedger[0].amount), 101n);
    const cappedInventory = await db`SELECT user_id AS "userId", quantity
      FROM virtual_world_user_collectibles
      WHERE collectible_id = ${cappedCollectibleId}::uuid
        AND source_treasure_hunt_id = ${cappedHuntId}::uuid
      ORDER BY user_id`;
    assert.equal(cappedInventory.length, 2);
    assert.deepEqual(cappedInventory.map(row => Number(row.quantity)), [1, 1]);
    const cappedCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${cappedCollectibleId}::uuid`;
    assert.equal(Number(cappedCatalog[0].minted_count), 2);
    const losingTeamId = finalCapDiscoveries[0].rewardEarnedCredits === "0"
      ? capTeamA.teamId : capTeamB.teamId;
    const losingMembers = await db`SELECT user_id AS "userId"
      FROM virtual_world_treasure_team_members WHERE team_id = ${losingTeamId}::uuid`;
    assert.equal(cappedInventory.some(row => losingMembers.some(member => member.userId === row.userId)), false);

    // Competing teams in different hunts may complete together while sharing
    // one finite catalog item. The catalog row lock must prevent cross-hunt
    // over-minting even though each hunt has its own completion lock.
    const sharedSupplyCollectibleId = randomUUID();
    await db`INSERT INTO virtual_world_collectible_catalog
      (id, code, display_name, category, rarity, max_supply, enabled)
      VALUES (${sharedSupplyCollectibleId}::uuid, 'cross-hunt-team-badge',
        'Cross-hunt Team Badge', 'badge', 'epic', 2, TRUE)`;
    const sharedSupplyHunts = [randomUUID(), randomUUID()];
    const sharedSupplyTeams = [];
    const sharedSupplyPlayers = [
      { owner: userId, member: secondUserId },
      { owner: thirdUserId, member: fourthUserId }
    ];
    for (const [index, sharedHuntId] of sharedSupplyHunts.entries()) {
      await db`INSERT INTO virtual_world_treasure_hunts
        (id, code, title, world_id, starts_at, ends_at, enabled,
         reward_earned_credits, distribution_mode)
        VALUES (${sharedHuntId}::uuid, ${'shared-supply-' + index + '-' + sharedHuntId.slice(0, 8)},
          'Cross-hunt finite collectible supply', ${worldId}::uuid,
          NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour',
          TRUE, 20, 'team')`;
      await db`INSERT INTO virtual_world_treasure_reward_items
        (hunt_id, collectible_id, quantity)
        VALUES (${sharedHuntId}::uuid, ${sharedSupplyCollectibleId}::uuid, 1)`;
      for (let sequence = 0; sequence < 2; sequence++) {
        const point = { id: randomUUID(), sequence,
          interactableId: 'shared-supply-' + index + '-' + sequence,
          x: sequence * 10 + index, y: 1.15, z: index };
        await db`INSERT INTO virtual_world_treasure_spawn_points
          (id, hunt_id, sequence, city_id, district_id, interactable_id,
           position_x, position_y, position_z, interaction_radius)
          VALUES (${point.id}::uuid, ${sharedHuntId}::uuid, ${sequence},
            'solsticebay', 'central', ${point.interactableId},
            ${point.x}, ${point.y}, ${point.z}, 2)`;
      }
    }
    for (let index = 0; index < sharedSupplyHunts.length; index++) {
      const created = await createTreasureTeam(db, sharedSupplyHunts[index],
        sharedSupplyPlayers[index].owner, worldId, 2, Date.now(), teamSecret);
      assert.equal(created.ok, true);
      const joined = await joinTreasureTeam(db, created.teamId,
        sharedSupplyPlayers[index].member, worldId, Date.now());
      assert.equal(joined.ok, true);
      sharedSupplyTeams.push(created.teamId);
    }
    const sharedSupplyRoutes = await Promise.all(sharedSupplyTeams.map(async teamId => db`
      SELECT assignment.sequence, point.interactable_id AS "interactableId",
        point.city_id AS "cityId", point.district_id AS "districtId",
        point.position_x AS x, point.position_y AS y, point.position_z AS z
      FROM virtual_world_treasure_team_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE assignment.team_id = ${teamId}::uuid ORDER BY assignment.sequence`));
    assert.equal(sharedSupplyRoutes.every(route => route.length === 2), true);
    const sharedFirstResults = await Promise.all(sharedSupplyRoutes.map((route, index) => {
      const point = route[0];
      return recordTeamTreasureDiscovery(db,
        { id: sharedSupplyPlayers[index].owner, worldId,
          x: Number(point.x), y: Number(point.y), z: Number(point.z) },
        { id: point.interactableId, cityId: point.cityId, districtId: point.districtId },
        Date.now(), teamSecret, instanceId, takeoverProcessId, 2);
    }));
    assert.equal(sharedFirstResults.every(result => result.discovered && !result.completed), true);
    const sharedFinalResults = await Promise.all(sharedSupplyRoutes.map((route, index) => {
      const point = route[1];
      return recordTeamTreasureDiscovery(db,
        { id: sharedSupplyPlayers[index].member, worldId,
          x: Number(point.x), y: Number(point.y), z: Number(point.z) },
        { id: point.interactableId, cityId: point.cityId, districtId: point.districtId },
        Date.now(), teamSecret, instanceId, takeoverProcessId, 2);
    }));
    assert.equal(sharedFinalResults.every(result => result.completed), true);
    assert.equal(sharedFinalResults.every(result => BigInt(result.rewardEarnedCredits) > 0n), true);
    const sharedSupplyInventory = await db`SELECT user_id AS "userId", quantity
      FROM virtual_world_user_collectibles
      WHERE collectible_id = ${sharedSupplyCollectibleId}::uuid
      ORDER BY user_id`;
    assert.equal(sharedSupplyInventory.length, 2);
    assert.deepEqual(sharedSupplyInventory.map(row => Number(row.quantity)), [1, 1]);
    const sharedSupplyTeamByUser = new Map([
      [sharedSupplyPlayers[0].owner, sharedSupplyTeams[0]],
      [sharedSupplyPlayers[0].member, sharedSupplyTeams[0]],
      [sharedSupplyPlayers[1].owner, sharedSupplyTeams[1]],
      [sharedSupplyPlayers[1].member, sharedSupplyTeams[1]]
    ]);
    const teamsReceivingSharedSupply = new Set(
      sharedSupplyInventory.map(row => sharedSupplyTeamByUser.get(row.userId))
    );
    assert.equal(teamsReceivingSharedSupply.size, 1);
    const sharedSupplyCatalog = await db`SELECT minted_count FROM virtual_world_collectible_catalog
      WHERE id = ${sharedSupplyCollectibleId}::uuid`;
    assert.equal(Number(sharedSupplyCatalog[0].minted_count), 2);

    // Replaying each team's final discovery after commit must not re-award
    // Earned Credits, collectible inventory, or catalog supply.
    // Replay completed clues concurrently through independent PostgreSQL
    // pools to exercise the database idempotency boundary, not just one client.
    const sharedCompletionReplays = await Promise.all(sharedSupplyRoutes.map(async (route, index) => {
      const point = route[1];
      const replayClient = index % 2 === 0 ? db : replayDb;
      return recordTeamTreasureDiscovery(replayClient,
        { id: sharedSupplyPlayers[index].member, worldId,
          x: Number(point.x), y: Number(point.y), z: Number(point.z) },
        { id: point.interactableId, cityId: point.cityId, districtId: point.districtId },
        Date.now(), teamSecret, instanceId, takeoverProcessId, 2);
    }));
    assert.equal(sharedCompletionReplays.every(result =>
      !result.discovered && !result.completed && result.rewardEarnedCredits === "0"), true);
    const sharedRewardLedger = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_earned_credit_ledger
      WHERE source_type = 'treasure_hunt'
        AND source_treasure_hunt_id = ANY(${sharedSupplyHunts}::uuid[])`;
    assert.equal(Number(sharedRewardLedger[0].total), 4);
    const sharedAllocations = await db`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_team_reward_allocations
      WHERE team_id = ANY(${sharedSupplyTeams}::uuid[])`;
    assert.equal(Number(sharedAllocations[0].total), 4);

    // Two different teams in the same hunt may be joined concurrently by one
    // player. Exactly one membership wins the database uniqueness constraint;
    // the losing transaction must remain usable and return a normal conflict.
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, enabled, reward_earned_credits, distribution_mode)
      VALUES (${competingHuntId}::uuid, ${'team-race-' + competingHuntId.slice(0, 8)},
        'Concurrent membership test', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', TRUE, 10, 'team')`;
    for (let sequence = 0; sequence < 2; sequence++) {
      const point = { id: randomUUID(), sequence, interactableId: 'race-' + sequence };
      await db`INSERT INTO virtual_world_treasure_spawn_points
        (id, hunt_id, sequence, city_id, district_id, interactable_id,
         position_x, position_y, position_z, interaction_radius)
        VALUES (${point.id}::uuid, ${competingHuntId}::uuid, ${sequence},
          'solsticebay', 'central', ${point.interactableId}, ${sequence * 10}, 1.15, 0, 2)`;
    }
    const [teamA, teamB] = await Promise.all([
      createTreasureTeam(db, competingHuntId, userId, worldId, 5, Date.now(), teamSecret),
      createTreasureTeam(db, competingHuntId, secondUserId, worldId, 5, Date.now(), teamSecret)
    ]);
    assert.equal(teamA.ok, true);
    assert.equal(teamB.ok, true);
    const joinAttempts = await Promise.all([
      joinTreasureTeam(db, teamA.teamId, thirdUserId, worldId, Date.now()),
      joinTreasureTeam(db, teamB.teamId, thirdUserId, worldId, Date.now())
    ]);
    assert.equal(joinAttempts.filter(result => result.ok).length, 1);
    assert.equal(joinAttempts.filter(result => result.code === 'already_in_another_team_for_hunt').length, 1);
    const thirdUserMemberships = await db`SELECT team_id FROM virtual_world_treasure_team_members
      WHERE hunt_id = ${competingHuntId}::uuid AND user_id = ${thirdUserId}::uuid`;
    assert.equal(thirdUserMemberships.length, 1);

    // Two concurrent joins competing for the final team seat must serialize
    // on the team row. One member is admitted; the other receives team_full.
    await db`INSERT INTO virtual_world_treasure_hunts
      (id, code, title, world_id, starts_at, ends_at, enabled, reward_earned_credits, distribution_mode)
      VALUES (${capacityHuntId}::uuid, ${'team-capacity-' + capacityHuntId.slice(0, 8)},
        'Concurrent final-seat team join race', ${worldId}::uuid,
        NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', TRUE, 10, 'team')`;
    for (let sequence = 0; sequence < 2; sequence++) {
      await db`INSERT INTO virtual_world_treasure_spawn_points
        (id, hunt_id, sequence, city_id, district_id, interactable_id,
         position_x, position_y, position_z, interaction_radius)
        VALUES (${randomUUID()}::uuid, ${capacityHuntId}::uuid, ${sequence},
          'solsticebay', 'central', ${'capacity-' + sequence}, ${sequence * 10}, 1.15, 0, 2)`;
    }
    const capacityTeam = await createTreasureTeam(
      db, capacityHuntId, fourthUserId, worldId, 2, Date.now(), teamSecret
    );
    assert.equal(capacityTeam.ok, true);
    const finalSeatAttempts = await Promise.all([
      joinTreasureTeam(db, capacityTeam.teamId, userId, worldId, Date.now()),
      joinTreasureTeam(replayDb, capacityTeam.teamId, secondUserId, worldId, Date.now())
    ]);
    assert.equal(finalSeatAttempts.filter(result => result.ok).length, 1);
    assert.equal(finalSeatAttempts.filter(result => result.code === 'team_full').length, 1);
    const capacityMembers = await db`SELECT user_id FROM virtual_world_treasure_team_members
      WHERE team_id = ${capacityTeam.teamId}::uuid`;
    assert.equal(capacityMembers.length, 2);
    const capacityStatus = await db`SELECT status FROM virtual_world_treasure_teams
      WHERE id = ${capacityTeam.teamId}::uuid`;
    assert.equal(capacityStatus[0].status, 'active');

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
    await replayDb.end({ timeout: 2 }).catch(() => undefined);
    await db.end({ timeout: 2 }).catch(() => undefined);
    await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await admin.end({ timeout: 2 });
  }
});
