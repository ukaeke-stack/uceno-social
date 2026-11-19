import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

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
  const userId = randomUUID();
  const worldId = randomUUID();
  const activityId = randomUUID();
  const resultSessionId = randomUUID();
  const missionTemplateId = randomUUID();
  const missionInstanceId = randomUUID();
  const huntId = randomUUID();
  const clueId = randomUUID();

  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    await db.unsafe("CREATE TABLE users (id UUID PRIMARY KEY)");
    await db.unsafe("CREATE TABLE virtual_worlds (id UUID PRIMARY KEY)");
    await db.unsafe("CREATE TABLE virtual_world_activity_sessions (id UUID PRIMARY KEY)");
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
    await db.unsafe(migration);
    await db.unsafe("INSERT INTO users(id) VALUES ($1)", [userId]);
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
