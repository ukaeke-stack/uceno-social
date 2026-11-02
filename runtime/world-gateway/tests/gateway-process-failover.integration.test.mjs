import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import WebSocket from "ws";
import { SignJWT } from "jose";

const databaseUrl = process.env.TEST_DATABASE_URL;
const tokenSecret = "process-failover-test-secret-with-more-than-32-characters";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = address.port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForReady(port, child, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`gateway process exited before readiness (code=${child.exitCode}, signal=${child.signalCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      if (response.status === 200) return await response.json();
      lastError = new Error(`readiness returned ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw lastError ?? new Error("gateway readiness timed out");
}

function startGateway(port, instanceId, scopedDatabaseUrl) {
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      WORLD_INSTANCE_ID: instanceId,
      DATABASE_URL: scopedDatabaseUrl,
      WORLD_TOKEN_SECRET: tokenSecret,
      WORLD_INSTANCE_CAPACITY: "8"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  child.testOutput = () => output;
  return child;
}

async function receiveSocketMessage(socket, expectedType, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const seen = [];
    const timeout = setTimeout(() => reject(new Error(`timed out waiting for ${expectedType}; received: ${JSON.stringify(seen)}`)), timeoutMs);
    const onMessage = raw => {
      let packet;
      try { packet = JSON.parse(raw.toString()); } catch { return; }
      seen.push(packet);
      if (packet.type !== expectedType) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(packet);
    };
    socket.on("message", onMessage);
    socket.once("error", error => { clearTimeout(timeout); reject(error); });
  });
}

async function connectAuthenticated(port, instanceId, worldId, userId) {
  const token = await new SignJWT({
    world_id: worldId, instance_id: instanceId, client_type: "unity-android"
  }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("uceno-social").setAudience("uceno-world-gateway")
    .setSubject(userId).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(tokenSecret));
  const socket = new WebSocket(`ws://127.0.0.1:${port}/world`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("authenticated WebSocket upgrade timed out")), 5000);
    socket.once("open", () => { clearTimeout(timeout); resolve(); });
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      response.resume();
      reject(new Error(`authenticated WebSocket upgrade rejected: ${response.statusCode}`));
    });
    socket.once("error", error => { clearTimeout(timeout); reject(error); });
  });
  const welcome = await receiveSocketMessage(socket, "welcome");
  assert.equal(welcome.instanceId, instanceId);
  return { socket, welcome };
}

async function assertWebSocketRejectsWrongInstance(port, instanceId) {
  const token = await new SignJWT({
    world_id: randomUUID(),
    instance_id: randomUUID(),
    client_type: "unity-android"
  }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("uceno-social").setAudience("uceno-world-gateway")
    .setSubject(randomUUID()).setIssuedAt().setExpirationTime("1m")
    .sign(new TextEncoder().encode(tokenSecret));
  assert.notEqual(instanceId, "", "test instance id must be configured");
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/world`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("WebSocket authentication rejection timed out"));
    }, 5000);
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      assert.equal(response.statusCode, 401);
      response.resume();
      resolve();
    });
    socket.once("open", () => {
      clearTimeout(timeout);
      socket.terminate();
      reject(new Error("gateway accepted a token scoped to a different instance"));
    });
    socket.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function stopGateway(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    child.once("exit", resolve);
    child.kill("SIGKILL");
  });
}

test("two real gateway processes: primary loss leaves the replacement process ready", {
  skip: !databaseUrl,
  timeout: 45000
}, async t => {
  const admin = postgres(databaseUrl, { max: 6, idle_timeout: 5 });
  const schema = `uceno_gateway_process_${randomUUID().replace(/-/g, "")}`;
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set("options", `-csearch_path=${schema},public`);
  const instanceA = randomUUID();
  const instanceB = randomUUID();
  const portA = await freePort();
  const portB = await freePort();
  const worldId = randomUUID();
  const userId = randomUUID();
  const activityId = randomUUID();
  const createdAt = Date.now();
  let gatewayA;
  let gatewayB;

  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_instances (
      id UUID PRIMARY KEY, status TEXT NOT NULL, heartbeat_at TIMESTAMPTZ,
      endpoint TEXT, current_players INTEGER NOT NULL DEFAULT 0
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_realtime_events (
      id BIGSERIAL PRIMARY KEY, world_id UUID, instance_id UUID,
      event_type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_activity_sessions (
      id UUID PRIMARY KEY, world_id UUID NOT NULL, instance_id UUID NOT NULL,
      host_user_id UUID, host_generation BIGINT NOT NULL DEFAULT 1,
      race_id UUID, activity_kind TEXT NOT NULL DEFAULT 'race', phase TEXT NOT NULL,
      version BIGINT NOT NULL DEFAULT 1, state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_activity_transfer_tickets (
      id UUID PRIMARY KEY, world_id UUID NOT NULL, user_id UUID NOT NULL,
      target_instance_id UUID NOT NULL, activity_session_id UUID NOT NULL,
      host_generation BIGINT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".users (
      id UUID PRIMARY KEY, moderation_status TEXT NOT NULL DEFAULT 'active',
      suspended_until TIMESTAMPTZ
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_worlds (
      id UUID PRIMARY KEY, status TEXT NOT NULL, visibility TEXT NOT NULL,
      owner_user_id UUID NOT NULL
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_memberships (
      world_id UUID NOT NULL, user_id UUID NOT NULL, status TEXT NOT NULL,
      PRIMARY KEY (world_id, user_id)
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".user_blocks (
      blocker_id UUID NOT NULL, blocked_id UUID NOT NULL
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_instance_sessions (
      world_id UUID NOT NULL, user_id UUID NOT NULL, instance_id UUID NOT NULL,
      lease_expires_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (world_id, user_id)
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_player_state (
      world_id UUID NOT NULL, user_id UUID NOT NULL, position JSONB, rotation JSONB,
      session_generation BIGINT NOT NULL DEFAULT 0, state_version BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (world_id, user_id)
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".user_avatar_wardrobe_equipped (
      user_id UUID NOT NULL, slot TEXT NOT NULL, item_id TEXT NOT NULL
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".user_avatar_wardrobe_inventory (
      user_id UUID NOT NULL, item_id TEXT NOT NULL
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".avatar_wardrobe_items (
      item_id TEXT NOT NULL, slot TEXT NOT NULL, enabled BOOLEAN NOT NULL
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_object_states (
      world_id UUID NOT NULL, district_id TEXT NOT NULL, object_id TEXT NOT NULL,
      object_kind TEXT NOT NULL, object_state TEXT NOT NULL, version BIGINT NOT NULL DEFAULT 1,
      updated_by UUID
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_player_sessions (
      world_id UUID NOT NULL, user_id UUID NOT NULL, instance_id UUID NOT NULL,
      session_id UUID NOT NULL, generation BIGINT NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (world_id, user_id)
    )`);
    await admin.unsafe(`INSERT INTO "${schema}".virtual_world_instances (id, status, endpoint)
      VALUES ($1::uuid, 'ready', $2), ($3::uuid, 'ready', $4)`,
      [instanceA, `http://127.0.0.1:${portA}`, instanceB, `http://127.0.0.1:${portB}`]);

    await admin.unsafe(`INSERT INTO "${schema}".users (id) VALUES ($1::uuid)`, [userId]);
    await admin.unsafe(`INSERT INTO "${schema}".virtual_worlds (id, status, visibility, owner_user_id)
      VALUES ($1::uuid, 'published', 'public', $2::uuid)`, [worldId, userId]);
    await admin.unsafe(`INSERT INTO "${schema}".virtual_world_instance_sessions
      (world_id, user_id, instance_id, lease_expires_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, NOW() + INTERVAL '5 minutes')`,
      [worldId, userId, instanceB]);
    const persistedActivity = {
      id: activityId, worldId, instanceId: instanceA, hostUserId: userId,
      hostGeneration: 1, raceId: null, kind: "checkpoint_race", phase: "lobby",
      version: 1, createdAt, startedAt: null, completedAt: null,
      maxParticipants: 8, checkpointCount: 2, participants: []
    };
    await admin.unsafe(`INSERT INTO "${schema}".virtual_world_activity_sessions
      (id, world_id, instance_id, host_user_id, host_generation, activity_kind,
       phase, version, state, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 'checkpoint_race',
       'lobby', 1, $5::jsonb, NOW(), NOW())`,
      [activityId, worldId, instanceA, userId, JSON.stringify(persistedActivity)]);
    gatewayA = startGateway(portA, instanceA, scoped.toString());
    gatewayB = startGateway(portB, instanceB, scoped.toString());
    const readyA = await waitForReady(portA, gatewayA);
    const readyB = await waitForReady(portB, gatewayB);
    assert.equal(readyA.instanceId, instanceA);
    assert.equal(readyB.instanceId, instanceB);
    await assertWebSocketRejectsWrongInstance(portA, instanceA);
    await assertWebSocketRejectsWrongInstance(portB, instanceB);
    const authenticated = await connectAuthenticated(portB, instanceB, worldId, userId);
    assert.equal(authenticated.welcome.userId, userId);
    authenticated.socket.close();
    const heartbeatDeadline = Date.now() + 5000;
    let liveHeartbeats = [];
    while (Date.now() < heartbeatDeadline) {
      liveHeartbeats = await admin.unsafe(`SELECT id FROM "${schema}".virtual_world_instances
        WHERE id IN ($1::uuid, $2::uuid) AND heartbeat_at > NOW() - INTERVAL '30 seconds'`,
        [instanceA, instanceB]);
      if (liveHeartbeats.length === 2) break;
      await delay(100);
    }
    assert.equal(liveHeartbeats.length, 2, "both running gateway processes must renew their database heartbeat");

    await t.test("both independent processes publish their own database heartbeat", async () => {
      const rows = await admin.unsafe(`SELECT id, heartbeat_at FROM "${schema}".virtual_world_instances
        WHERE id IN ($1::uuid, $2::uuid)`, [instanceA, instanceB]);
      assert.equal(rows.length, 2);
      assert.ok(rows.every(row => row.heartbeat_at instanceof Date));
      assert.deepEqual(new Set(rows.map(row => row.id)), new Set([instanceA, instanceB]));
    });

    await t.test("replacement remains ready after the primary process is terminated", async () => {
      await stopGateway(gatewayA);
      assert.equal(gatewayA.signalCode, "SIGKILL", "primary gateway must have been terminated as an OS process");
      await assert.rejects(fetch(`http://127.0.0.1:${portA}/health`), "terminated primary must stop serving HTTP");
      const replacement = await waitForReady(portB, gatewayB);
      assert.equal(replacement.instanceId, instanceB);
      assert.equal(replacement.status, "ready");
      const primary = await admin.unsafe(`SELECT heartbeat_at FROM "${schema}".virtual_world_instances
        WHERE id = $1::uuid`, [instanceA]);
      assert.equal(primary.length, 1);
      await admin.unsafe(`UPDATE "${schema}".virtual_world_instances
        SET heartbeat_at = NOW() - INTERVAL '1 minute' WHERE id = $1::uuid`, [instanceA]);
      const stale = await admin.unsafe(`SELECT heartbeat_at < NOW() - INTERVAL '30 seconds' AS stale
        FROM "${schema}".virtual_world_instances WHERE id = $1::uuid`, [instanceA]);
      assert.equal(stale[0].stale, true);
      assert.equal((await waitForReady(portB, gatewayB)).instanceId, instanceB);
      const replacementSocket = await connectAuthenticated(portB, instanceB, worldId, userId);
      replacementSocket.socket.send(JSON.stringify({ type: "activity_join", id: activityId }));
      let recovered;
      try {
        recovered = await receiveSocketMessage(replacementSocket.socket, "activity_host_recovered");
      } catch (error) {
        error.message += `\nReplacement gateway logs:\n${gatewayB.testOutput()}\nPersisted activity:\n${JSON.stringify(await admin.unsafe(`SELECT instance_id, host_generation, phase, state FROM "${schema}".virtual_world_activity_sessions WHERE id = $1::uuid`, [activityId]))}`;
        throw error;
      }
      assert.equal(recovered.sessionId, activityId);
      assert.equal(recovered.hostGeneration, 2);
      const authority = await admin.unsafe(`SELECT instance_id, host_user_id, host_generation, version, state
        FROM "${schema}".virtual_world_activity_sessions WHERE id = $1::uuid`, [activityId]);
      assert.equal(authority[0].instance_id, instanceB);
      assert.equal(authority[0].host_user_id, userId);
      assert.equal(Number(authority[0].host_generation), 2);
      assert.equal(Number(authority[0].version), 2);
      assert.equal(authority[0].state.instanceId, instanceB);
      assert.equal(Number(authority[0].state.hostGeneration), 2);
      replacementSocket.socket.close();
    });
  } catch (error) {
    const logs = [gatewayA?.testOutput?.(), gatewayB?.testOutput?.()].filter(Boolean).join("\n--- gateway ---\n");
    if (logs) error.message += `\nGateway process output:\n${logs}`;
    throw error;
  } finally {
    await Promise.all([gatewayA && stopGateway(gatewayA), gatewayB && stopGateway(gatewayB)].filter(Boolean));
    await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await admin.end({ timeout: 5 });
  }
});
