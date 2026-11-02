import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrations = [
  "029_player_session_fencing.sql",
  "030_world_realtime_event_stream.sql",
  "031_durable_activity_sessions.sql",
  "032_activity_cross_instance_discovery.sql",
  "033_activity_gateway_transfer_tickets.sql",
  "034_activity_transfer_host_fencing.sql"
];

test("PostgreSQL session and activity fencing integration", { skip: !databaseUrl }, async t => {
  const admin = postgres(databaseUrl, { max: 8, idle_timeout: 5 });
  const schema = `uceno_fence_${randomUUID().replace(/-/g, "")}`;
  const ident = admin(schema);
  const db = postgres(databaseUrl, { max: 8, idle_timeout: 5 });
  const withSchema = callback => db.begin(async tx => {
    await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
    return callback(tx);
  });

  try {
    await admin`CREATE SCHEMA ${ident}`;
    await withSchema(async tx => {
      await tx`CREATE TABLE users (id UUID PRIMARY KEY)`;
      await tx`CREATE TABLE virtual_worlds (id UUID PRIMARY KEY)`;
      await tx`CREATE TABLE virtual_world_instances (
        id UUID PRIMARY KEY, status TEXT NOT NULL, heartbeat_at TIMESTAMPTZ, endpoint TEXT
      )`;
      await tx`CREATE TABLE virtual_world_player_state (
        world_id UUID NOT NULL, user_id UUID NOT NULL, position JSONB NOT NULL DEFAULT '{}'::jsonb,
        rotation JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (world_id, user_id)
      )`;
      for (const migration of migrations) {
        const path = new URL(`../../../db/migrations/${migration}`, import.meta.url);
        await tx.unsafe(readFileSync(path, "utf8"));
      }
      await tx`INSERT INTO users (id) VALUES
        ('123e4567-e89b-12d3-a456-426614174001'),
        ('123e4567-e89b-12d3-a456-426614174002')`;
      await tx`INSERT INTO virtual_worlds (id)
        VALUES ('123e4567-e89b-12d3-a456-426614174010')`;
      await tx`INSERT INTO virtual_world_instances (id, status, heartbeat_at, endpoint) VALUES
        ('123e4567-e89b-12d3-a456-426614174020', 'ready', NOW() - INTERVAL '2 minutes', 'wss://old.invalid'),
        ('123e4567-e89b-12d3-a456-426614174021', 'ready', NOW(), 'wss://new-a.invalid'),
        ('123e4567-e89b-12d3-a456-426614174022', 'ready', NOW(), 'wss://new-b.invalid')`;
    });

    const ids = {
      world: "123e4567-e89b-12d3-a456-426614174010",
      old: "123e4567-e89b-12d3-a456-426614174020",
      newA: "123e4567-e89b-12d3-a456-426614174021",
      newB: "123e4567-e89b-12d3-a456-426614174022",
      host: "123e4567-e89b-12d3-a456-426614174001",
      guest: "123e4567-e89b-12d3-a456-426614174002",
      activity: "123e4567-e89b-12d3-a456-426614174030",
      ticket: "123e4567-e89b-12d3-a456-426614174040"
    };
    const seedActivity = (tx, instanceId = ids.old, generation = 1) => tx`
      INSERT INTO virtual_world_activity_sessions
        (id, world_id, instance_id, host_user_id, host_generation, activity_kind,
         phase, version, state, created_at)
      VALUES (${ids.activity}::uuid, ${ids.world}::uuid, ${instanceId}::uuid,
        ${ids.host}::uuid, ${generation}, 'sports', 'lobby', 1,
        ${JSON.stringify({ participants: [{ userId: ids.guest, status: "joined" }] })}::jsonb,
        NOW())
    `;
    const takeover = (instanceId, hostId) => withSchema(tx => tx`
      UPDATE virtual_world_activity_sessions AS activity
      SET instance_id = ${instanceId}::uuid,
          host_user_id = ${hostId}::uuid,
          host_generation = activity.host_generation + 1,
          version = activity.version + 1,
          updated_at = NOW()
      FROM virtual_world_instances AS previous_instance
      WHERE activity.id = ${ids.activity}::uuid
        AND activity.world_id = ${ids.world}::uuid
        AND activity.instance_id = previous_instance.id
        AND activity.phase IN ('lobby', 'active')
        AND (previous_instance.status <> 'ready' OR previous_instance.heartbeat_at IS NULL
          OR previous_instance.heartbeat_at < NOW() - INTERVAL '30 seconds')
      RETURNING activity.instance_id AS "instanceId", activity.host_generation AS "hostGeneration"
    `);

    await t.test("concurrent stale-host takeovers have exactly one winner", async () => {
      await withSchema(seedActivity);
      const results = await Promise.all([
        takeover(ids.newA, ids.host),
        takeover(ids.newB, ids.guest)
      ]);
      assert.equal(results.filter(rows => rows.length === 1).length, 1);
      const current = await withSchema(tx => tx`SELECT instance_id AS "instanceId", host_generation AS generation
        FROM virtual_world_activity_sessions WHERE id = ${ids.activity}::uuid`);
      assert.ok([ids.newA, ids.newB].includes(current[0].instanceId));
      assert.equal(Number(current[0].generation), 2);
    });

    await t.test("transfer ticket consumption is atomic and replay-safe", async () => {
      await withSchema(seedActivity);
      await withSchema(tx => tx`INSERT INTO virtual_world_activity_transfer_tickets
        (id, world_id, user_id, activity_session_id, source_instance_id, target_instance_id,
         host_generation, expires_at)
        VALUES (${ids.ticket}::uuid, ${ids.world}::uuid, ${ids.guest}::uuid,
          ${ids.activity}::uuid, ${ids.old}::uuid, ${ids.newA}::uuid, 1, NOW() + INTERVAL '30 seconds')`);
      const consume = () => withSchema(tx => tx`
        UPDATE virtual_world_activity_transfer_tickets ticket SET consumed_at = NOW()
        WHERE ticket.id = ${ids.ticket}::uuid AND ticket.world_id = ${ids.world}::uuid
          AND ticket.user_id = ${ids.guest}::uuid AND ticket.target_instance_id = ${ids.newA}::uuid
          AND ticket.activity_session_id = ${ids.activity}::uuid
          AND ticket.host_generation = 1 AND ticket.consumed_at IS NULL
          AND ticket.expires_at > NOW()
          AND EXISTS (SELECT 1 FROM virtual_world_activity_sessions activity
            WHERE activity.id = ticket.activity_session_id AND activity.world_id = ticket.world_id
              AND activity.instance_id = ticket.target_instance_id
              AND activity.host_generation = ticket.host_generation
              AND activity.phase = 'lobby')
        RETURNING ticket.id`);
      const results = await Promise.all([consume(), consume()]);
      assert.equal(results.reduce((n, rows) => n + rows.length, 0), 1);
      const replay = await consume();
      assert.equal(replay.length, 0);
    });

    await t.test("expired tickets cannot be consumed", async () => {
      await withSchema(seedActivity);
      await withSchema(tx => tx`INSERT INTO virtual_world_activity_transfer_tickets
        (id, world_id, user_id, activity_session_id, source_instance_id, target_instance_id,
         host_generation, expires_at)
        VALUES (${ids.ticket}::uuid, ${ids.world}::uuid, ${ids.guest}::uuid,
          ${ids.activity}::uuid, ${ids.old}::uuid, ${ids.newA}::uuid, 1, NOW() - INTERVAL '1 second')`);
      const rows = await withSchema(tx => tx`UPDATE virtual_world_activity_transfer_tickets
        SET consumed_at = NOW() WHERE id = ${ids.ticket}::uuid
          AND consumed_at IS NULL AND expires_at > NOW() RETURNING id`);
      assert.equal(rows.length, 0);
    });

    await t.test("ticket authorization binds user, world, target, activity and host generation", async () => {
      await withSchema(seedActivity);
      await withSchema(tx => tx`INSERT INTO virtual_world_activity_transfer_tickets
        (id, world_id, user_id, activity_session_id, source_instance_id, target_instance_id,
         host_generation, expires_at)
        VALUES (${ids.ticket}::uuid, ${ids.world}::uuid, ${ids.guest}::uuid,
          ${ids.activity}::uuid, ${ids.old}::uuid, ${ids.newA}::uuid, 1, NOW() + INTERVAL '30 seconds')`);
      const authorized = async (userId, worldId, targetId, generation) => withSchema(tx => tx`
        SELECT 1 FROM virtual_world_activity_transfer_tickets ticket
        JOIN virtual_world_activity_sessions activity ON activity.id = ticket.activity_session_id
        WHERE ticket.id = ${ids.ticket}::uuid AND ticket.user_id = ${userId}::uuid
          AND ticket.world_id = ${worldId}::uuid AND ticket.target_instance_id = ${targetId}::uuid
          AND ticket.host_generation = ${generation} AND ticket.consumed_at IS NULL
          AND ticket.expires_at > NOW() AND activity.instance_id = ticket.target_instance_id
          AND activity.host_generation = ticket.host_generation AND activity.phase = 'lobby'`);
      assert.equal((await authorized(ids.guest, ids.world, ids.newA, 1)).length, 1);
      assert.equal((await authorized(ids.host, ids.world, ids.newA, 1)).length, 0);
      assert.equal((await authorized(ids.guest, "123e4567-e89b-12d3-a456-426614174099", ids.newA, 1)).length, 0);
      assert.equal((await authorized(ids.guest, ids.world, ids.newB, 1)).length, 0);
      assert.equal((await authorized(ids.guest, ids.world, ids.newA, 2)).length, 0);
    });

    await t.test("old gateway cannot mutate or enqueue a broadcast after takeover", async () => {
      await withSchema(seedActivity);
      const moved = await takeover(ids.newA, ids.guest);
      assert.equal(moved.length, 1);
      const staleWrite = await withSchema(async tx => {
        const rows = await tx`INSERT INTO virtual_world_activity_sessions
          (id, world_id, instance_id, host_user_id, host_generation, activity_kind,
           phase, version, state, created_at)
          VALUES (${ids.activity}::uuid, ${ids.world}::uuid, ${ids.old}::uuid,
            ${ids.host}::uuid, 1, 'sports', 'lobby', 99,
            '{"participants":[],"staleMutation":true}'::jsonb, NOW())
          ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, version = EXCLUDED.version
          WHERE virtual_world_activity_sessions.instance_id = EXCLUDED.instance_id
            AND virtual_world_activity_sessions.host_generation = EXCLUDED.host_generation
            AND virtual_world_activity_sessions.version < EXCLUDED.version
          RETURNING id`;
        if (rows[0]) await tx`INSERT INTO virtual_world_realtime_events
          (world_id, instance_id, event_type, payload)
          VALUES (${ids.world}::uuid, ${ids.old}::uuid, 'activity_state',
            '{"type":"activity_state","session":{"id":"${ids.activity}","hostGeneration":1}}'::jsonb)`;
        return rows;
      });
      assert.equal(staleWrite.length, 0);
      const persisted = await withSchema(tx => tx`SELECT instance_id AS "instanceId",
        host_generation AS generation, version, state FROM virtual_world_activity_sessions
        WHERE id = ${ids.activity}::uuid`);
      assert.equal(persisted[0].instanceId, ids.newA);
      assert.equal(Number(persisted[0].generation), 2);
      assert.equal(Number(persisted[0].version), 2);
      assert.equal(persisted[0].state.staleMutation, undefined);
      const events = await withSchema(tx => tx`SELECT count(*)::int AS count
        FROM virtual_world_realtime_events WHERE world_id = ${ids.world}::uuid`);
      assert.equal(events[0].count, 0);
    });
  } finally {
    await db.end({ timeout: 5 });
    await admin`DROP SCHEMA IF EXISTS ${ident} CASCADE`;
    await admin.end({ timeout: 5 });
  }
});
