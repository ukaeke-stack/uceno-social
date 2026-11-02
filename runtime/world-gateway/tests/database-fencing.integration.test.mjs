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
    const resetActivity = (instanceId = ids.old) => withSchema(async tx => {
      await tx`DELETE FROM virtual_world_activity_transfer_tickets WHERE activity_session_id = ${ids.activity}::uuid`;
      await tx`DELETE FROM virtual_world_realtime_events WHERE world_id = ${ids.world}::uuid`;
      await tx`DELETE FROM virtual_world_activity_results WHERE session_id = ${ids.activity}::uuid`;
      await tx`DELETE FROM virtual_world_activity_sessions WHERE id = ${ids.activity}::uuid`;
      await seedActivity(tx, instanceId);
    });
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
        AND EXISTS (SELECT 1 FROM virtual_world_instances replacement_instance
          WHERE replacement_instance.id = ${instanceId}::uuid
            AND replacement_instance.status = 'ready' AND replacement_instance.endpoint IS NOT NULL
            AND replacement_instance.heartbeat_at > NOW() - INTERVAL '30 seconds')
        AND activity.phase IN ('lobby', 'active')
        AND (previous_instance.status <> 'ready' OR previous_instance.heartbeat_at IS NULL
          OR previous_instance.heartbeat_at < NOW() - INTERVAL '30 seconds')
      RETURNING activity.instance_id AS "instanceId", activity.host_generation AS "hostGeneration"
    `);

    await t.test("concurrent player reconnects advance one authoritative session generation", async () => {
      await withSchema(tx => tx`DELETE FROM virtual_world_player_sessions
        WHERE world_id = ${ids.world}::uuid AND user_id = ${ids.host}::uuid`);
      const sessionA = "123e4567-e89b-12d3-a456-426614174050";
      const sessionB = "123e4567-e89b-12d3-a456-426614174051";
      const claim = (instanceId, sessionId) => withSchema(tx => tx`
        INSERT INTO virtual_world_player_sessions
          (world_id, user_id, instance_id, session_id, generation, updated_at)
        VALUES (${ids.world}::uuid, ${ids.host}::uuid, ${instanceId}::uuid,
          ${sessionId}::uuid, 1, NOW())
        ON CONFLICT (world_id, user_id) DO UPDATE SET
          instance_id = EXCLUDED.instance_id, session_id = EXCLUDED.session_id,
          generation = virtual_world_player_sessions.generation + 1, updated_at = NOW()
        RETURNING generation, session_id AS "sessionId"`);
      const claims = await Promise.all([
        claim(ids.newA, sessionA),
        claim(ids.newB, sessionB)
      ]);
      assert.deepEqual(claims.map(rows => Number(rows[0].generation)).sort(), [1, 2]);
      const current = await withSchema(tx => tx`SELECT generation, session_id AS "sessionId"
        FROM virtual_world_player_sessions WHERE world_id = ${ids.world}::uuid
          AND user_id = ${ids.host}::uuid`);
      assert.equal(current.length, 1);
      assert.equal(Number(current[0].generation), 2);
      assert.ok([sessionA, sessionB].includes(current[0].sessionId));
      assert.notEqual(Number(current[0].generation), 1);
      await withSchema(tx => tx`INSERT INTO virtual_world_player_state
        (world_id, user_id, position, rotation, session_generation, state_version, updated_by_session)
        VALUES (${ids.world}::uuid, ${ids.host}::uuid, '{"x":2,"y":1.15,"z":2}'::jsonb,
          '{}'::jsonb, 2, 2, ${current[0].sessionId}::uuid)`);
      const staleCheckpoint = await withSchema(tx => tx`INSERT INTO virtual_world_player_state
        (world_id, user_id, position, rotation, session_generation, state_version, updated_by_session)
        VALUES (${ids.world}::uuid, ${ids.host}::uuid, '{"x":99,"y":1.15,"z":99}'::jsonb,
          '{}'::jsonb, 1, 999, ${sessionA}::uuid)
        ON CONFLICT (world_id, user_id) DO UPDATE SET
          position = EXCLUDED.position, session_generation = EXCLUDED.session_generation,
          state_version = EXCLUDED.state_version, updated_by_session = EXCLUDED.updated_by_session
        WHERE virtual_world_player_state.session_generation < EXCLUDED.session_generation
          OR (virtual_world_player_state.session_generation = EXCLUDED.session_generation
            AND virtual_world_player_state.state_version < EXCLUDED.state_version)
        RETURNING user_id`);
      assert.equal(staleCheckpoint.length, 0);
      const acceptedCheckpoint = await withSchema(tx => tx`INSERT INTO virtual_world_player_state
        (world_id, user_id, position, rotation, session_generation, state_version, updated_by_session)
        VALUES (${ids.world}::uuid, ${ids.host}::uuid, '{"x":3,"y":1.15,"z":3}'::jsonb,
          '{}'::jsonb, 2, 3, ${current[0].sessionId}::uuid)
        ON CONFLICT (world_id, user_id) DO UPDATE SET
          position = EXCLUDED.position, session_generation = EXCLUDED.session_generation,
          state_version = EXCLUDED.state_version, updated_by_session = EXCLUDED.updated_by_session
        WHERE virtual_world_player_state.session_generation < EXCLUDED.session_generation
          OR (virtual_world_player_state.session_generation = EXCLUDED.session_generation
            AND virtual_world_player_state.state_version < EXCLUDED.state_version)
        RETURNING state_version`);
      assert.equal(Number(acceptedCheckpoint[0].state_version), 3);
      const checkpoint = await withSchema(tx => tx`SELECT position FROM virtual_world_player_state
        WHERE world_id = ${ids.world}::uuid AND user_id = ${ids.host}::uuid`);
      assert.equal(checkpoint[0].position.x, 3);
    });

    await t.test("concurrent stale-host takeovers have exactly one winner", async () => {
      await resetActivity();
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
      await resetActivity(ids.newA);
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
      await resetActivity(ids.newA);
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
      await resetActivity(ids.newA);
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

    await t.test("takeover invalidates an issued transfer ticket before it can be consumed", async () => {
      await resetActivity();
      await withSchema(tx => tx`INSERT INTO virtual_world_activity_transfer_tickets
        (id, world_id, user_id, activity_session_id, source_instance_id, target_instance_id,
         host_generation, expires_at)
        VALUES (${ids.ticket}::uuid, ${ids.world}::uuid, ${ids.guest}::uuid,
          ${ids.activity}::uuid, ${ids.old}::uuid, ${ids.newA}::uuid, 1, NOW() + INTERVAL '30 seconds')`);
      const moved = await takeover(ids.newB, ids.host);
      assert.equal(moved.length, 1);
      const consumed = await withSchema(tx => tx`
        UPDATE virtual_world_activity_transfer_tickets ticket
        SET consumed_at = NOW()
        WHERE ticket.id = ${ids.ticket}::uuid
          AND ticket.world_id = ${ids.world}::uuid
          AND ticket.user_id = ${ids.guest}::uuid
          AND ticket.target_instance_id = ${ids.newA}::uuid
          AND ticket.host_generation = 1
          AND ticket.consumed_at IS NULL AND ticket.expires_at > NOW()
          AND EXISTS (SELECT 1 FROM virtual_world_activity_sessions activity
            WHERE activity.id = ticket.activity_session_id
              AND activity.world_id = ticket.world_id
              AND activity.instance_id = ticket.target_instance_id
              AND activity.host_generation = ticket.host_generation
              AND activity.phase = 'lobby')
        RETURNING ticket.id`);
      assert.equal(consumed.length, 0);
      const ticket = await withSchema(tx => tx`SELECT consumed_at
        FROM virtual_world_activity_transfer_tickets WHERE id = ${ids.ticket}::uuid`);
      assert.equal(ticket.length, 1);
      assert.equal(ticket[0].consumed_at, null);
    });

    await t.test("takeover waits while an authorized relay holds the activity row lock", async () => {
      await resetActivity();
      let announceLocked;
      const locked = new Promise(resolve => { announceLocked = resolve; });
      let releaseRelay;
      const relayRelease = new Promise(resolve => { releaseRelay = resolve; });
      const relay = db.begin(async tx => {
        await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
        const authority = await tx`SELECT id FROM virtual_world_activity_sessions
          WHERE id = ${ids.activity}::uuid AND instance_id = ${ids.old}::uuid
            AND host_generation = 1 FOR UPDATE`;
        assert.equal(authority.length, 1);
        announceLocked();
        await relayRelease;
      });

      await locked;
      let takeoverFinished = false;
      const moving = takeover(ids.newA, ids.guest).then(rows => {
        takeoverFinished = true;
        return rows;
      });
      // Give PostgreSQL time to schedule the competing UPDATE; it must wait
      // for the relay transaction's row lock rather than revoke authority
      // halfway through an already-authorized fan-out.
      await new Promise(resolve => setTimeout(resolve, 75));
      assert.equal(takeoverFinished, false);
      releaseRelay();
      await relay;
      const moved = await moving;
      assert.equal(moved.length, 1);
      const current = await withSchema(tx => tx`SELECT instance_id AS "instanceId",
        host_generation AS generation FROM virtual_world_activity_sessions
        WHERE id = ${ids.activity}::uuid`);
      assert.equal(current[0].instanceId, ids.newA);
      assert.equal(Number(current[0].generation), 2);
    });

    await t.test("old gateway queued activity events are suppressed after takeover", async () => {
      await resetActivity();
      // Model an event committed by the old host immediately before takeover.
      await withSchema(tx => tx`INSERT INTO virtual_world_realtime_events
        (world_id, instance_id, event_type, payload)
        VALUES (${ids.world}::uuid, ${ids.old}::uuid, 'activity_state',
          ${JSON.stringify({ type: "activity_state", session: {
            id: ids.activity, worldId: ids.world, instanceId: ids.old, hostGeneration: 1
          } })}::jsonb)`);
      const moved = await takeover(ids.newA, ids.guest);
      assert.equal(moved.length, 1);

      // The relay may still read the queued row, but its authority check must
      // reject it against the now-current activity owner/generation.
      const queued = await withSchema(tx => tx`SELECT id, world_id AS "worldId",
        instance_id AS "instanceId", payload FROM virtual_world_realtime_events
        WHERE world_id = ${ids.world}::uuid AND event_type = 'activity_state'`);
      assert.equal(queued.length, 1);
      const payload = typeof queued[0].payload === "string"
        ? JSON.parse(queued[0].payload) : queued[0].payload;
      assert.equal(payload.session.hostGeneration, 1);
      assert.equal(queued[0].instanceId, ids.old);
      const authority = await withSchema(tx => tx`SELECT 1
        FROM virtual_world_activity_sessions
        WHERE id = ${payload.session.id}::uuid
          AND world_id = ${queued[0].worldId}::uuid
          AND instance_id = ${queued[0].instanceId}::uuid
          AND host_generation = ${payload.session.hostGeneration}
        FOR UPDATE`);
      assert.equal(authority.length, 0);

      const staleWrite = await withSchema(tx => tx`INSERT INTO virtual_world_activity_sessions
        (id, world_id, instance_id, host_user_id, host_generation, activity_kind,
         phase, version, state, created_at)
        VALUES (${ids.activity}::uuid, ${ids.world}::uuid, ${ids.old}::uuid,
          ${ids.host}::uuid, 1, 'sports', 'lobby', 99,
          '{"participants":[],"staleMutation":true}'::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, version = EXCLUDED.version
        WHERE virtual_world_activity_sessions.instance_id = EXCLUDED.instance_id
          AND virtual_world_activity_sessions.host_generation = EXCLUDED.host_generation
          AND virtual_world_activity_sessions.version < EXCLUDED.version
        RETURNING id`);
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
      assert.equal(events[0].count, 1);
    });

    await t.test("independent gateway connections revoke the old host before stale mutation or relay", async () => {
      await resetActivity();
      // Each gateway owns a separate PostgreSQL client/pool, mirroring two
      // independently running gateway processes sharing the same database.
      const gatewayA = postgres(databaseUrl, { max: 2, idle_timeout: 5 });
      const gatewayB = postgres(databaseUrl, { max: 2, idle_timeout: 5 });
      const gatewayTx = client => callback => client.begin(async tx => {
        await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
        return callback(tx);
      });
      const fromA = gatewayTx(gatewayA);
      const fromB = gatewayTx(gatewayB);
      let gatewayAHasAuthority = true;
      const persistAndRelay = (run, instanceId, generation, version, payload) =>
        run(async tx => {
          const saved = await tx`
            UPDATE virtual_world_activity_sessions
            SET version = ${version}, state = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
            WHERE id = ${ids.activity}::uuid
              AND instance_id = ${instanceId}::uuid
              AND host_generation = ${generation}
              AND version < ${version}
            RETURNING id
          `;
          if (!saved.length) return false;
          await tx`INSERT INTO virtual_world_realtime_events
            (world_id, instance_id, event_type, payload)
            VALUES (${ids.world}::uuid, ${instanceId}::uuid, 'activity_state',
              ${JSON.stringify({ type: "activity_state", session: { id: ids.activity, worldId: ids.world, instanceId, hostGeneration: generation, version, state: payload } })}::jsonb)`;
          return true;
        });
      try {
        // Gateway B atomically takes over from stale gateway A.
        const moved = await fromB(tx => tx`
          UPDATE virtual_world_activity_sessions AS activity
          SET instance_id = ${ids.newA}::uuid,
              host_user_id = ${ids.guest}::uuid,
              host_generation = activity.host_generation + 1,
              version = activity.version + 1,
              updated_at = NOW()
          FROM virtual_world_instances AS previous_instance
          WHERE activity.id = ${ids.activity}::uuid
            AND activity.instance_id = previous_instance.id
            AND (previous_instance.status <> 'ready'
              OR previous_instance.heartbeat_at < NOW() - INTERVAL '30 seconds')
            AND EXISTS (SELECT 1 FROM virtual_world_instances replacement
              WHERE replacement.id = ${ids.newA}::uuid AND replacement.status = 'ready'
                AND replacement.endpoint IS NOT NULL
                AND replacement.heartbeat_at > NOW() - INTERVAL '30 seconds')
          RETURNING activity.host_generation AS generation
        `);
        assert.equal(moved.length, 1);
        assert.equal(Number(moved[0].generation), 2);

        // The new host can persist and publish under generation 2.
        const newHostAccepted = await persistAndRelay(fromB, ids.newA, 2, 3,
          { participants: [{ userId: ids.guest, status: "joined" }], hostGeneration: 2 });
        assert.equal(newHostAccepted, true);

        // The old process still has a local session until it attempts a write.
        // Its generation-1 write and relay are rejected atomically.
        const staleAccepted = await persistAndRelay(fromA, ids.old, 1, 99,
          { staleMutation: true, hostGeneration: 1 });
        if (!staleAccepted) gatewayAHasAuthority = false;
        assert.equal(staleAccepted, false);
        assert.equal(gatewayAHasAuthority, false);

        // Once fenced locally, the old process must not attempt a later relay.
        const laterOldBroadcast = gatewayAHasAuthority
          ? await persistAndRelay(fromA, ids.old, 1, 100, { staleBroadcast: true })
          : false;
        assert.equal(laterOldBroadcast, false);

        const current = await withSchema(tx => tx`
          SELECT instance_id AS "instanceId", host_generation AS generation,
            version, state FROM virtual_world_activity_sessions
          WHERE id = ${ids.activity}::uuid
        `);
        assert.equal(current[0].instanceId, ids.newA);
        assert.equal(Number(current[0].generation), 2);
        assert.equal(Number(current[0].version), 3);
        assert.equal(current[0].state.staleMutation, undefined);
        const events = await withSchema(tx => tx`
          SELECT instance_id AS "instanceId", payload FROM virtual_world_realtime_events
          WHERE world_id = ${ids.world}::uuid AND event_type = 'activity_state'
        `);
        assert.equal(events.length, 1);
        assert.equal(events[0].instanceId, ids.newA);
        const relayPayload = typeof events[0].payload === "string"
          ? JSON.parse(events[0].payload) : events[0].payload;
        assert.equal(relayPayload.type, "activity_state");
        assert.equal(relayPayload.session?.hostGeneration, 2);
        assert.equal(relayPayload.session?.version, 3);
      } finally {
        await gatewayA.end({ timeout: 5 });
        await gatewayB.end({ timeout: 5 });
      }
    });

  } finally {
    await db.end({ timeout: 5 });
    await admin`DROP SCHEMA IF EXISTS ${ident} CASCADE`;
    await admin.end({ timeout: 5 });
  }
});
