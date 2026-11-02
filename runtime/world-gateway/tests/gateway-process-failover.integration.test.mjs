import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      throw new Error(`gateway process exited before readiness (code=${child.exitCode}, signal=${child.signalCode})\\nGateway process output:\\n${child.testOutput?.() ?? ""}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      if (response.status === 200) return await response.json();
      lastError = new Error(`readiness returned ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  const diagnostics = typeof child.testOutput === "function" ? child.testOutput() : "";
  throw new Error(`gateway readiness timed out: ${lastError?.message ?? "unknown error"}\\nGateway process output:\\n${diagnostics}`);
}

function startGateway(port, instanceId, scopedDatabaseUrl, registryFile) {
  const processDatabaseUrl = new URL(scopedDatabaseUrl);
  processDatabaseUrl.searchParams.set("application_name", "uceno-gateway-" + instanceId);
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      WORLD_INSTANCE_ID: instanceId,
      DATABASE_URL: processDatabaseUrl.toString(),
      WORLD_TOKEN_SECRET: tokenSecret,
      WORLD_INSTANCE_CAPACITY: "8",
      WORLD_INTERACTABLES: "",
      WORLD_INTERACTABLES_FILE: registryFile
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

const socketPacketQueues = new WeakMap();

function trackSocketMessages(socket) {
  if (socketPacketQueues.has(socket)) return socketPacketQueues.get(socket);
  const queue = { packets: [], waiters: [] };
  socketPacketQueues.set(socket, queue);
  socket.on("message", raw => {
    let packet;
    try { packet = JSON.parse(raw.toString()); } catch { return; }
    const index = queue.waiters.findIndex(waiter =>
      packet.type === waiter.expectedType && waiter.predicate(packet));
    if (index >= 0) {
      const waiter = queue.waiters.splice(index, 1)[0];
      clearTimeout(waiter.timeout);
      waiter.resolve(packet);
    } else {
      queue.packets.push(packet);
      if (queue.packets.length > 2000) queue.packets.shift();
    }
  });
  socket.on("error", error => {
    for (const waiter of queue.waiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  });
  return queue;
}

async function receiveSocketMessage(socket, expectedType, timeoutMs = 5000, predicate = () => true, label = "") {
  const queue = trackSocketMessages(socket);
  const index = queue.packets.findIndex(packet =>
    packet.type === expectedType && predicate(packet));
  if (index >= 0) return queue.packets.splice(index, 1)[0];
  return new Promise((resolve, reject) => {
    const waiter = { expectedType, predicate, resolve, reject, timeout: null };
    waiter.timeout = setTimeout(() => {
      const index = queue.waiters.indexOf(waiter);
      if (index >= 0) queue.waiters.splice(index, 1);
      reject(new Error("timed out waiting for matching " + expectedType +
        (label ? " (" + label + ")" : "") +
        "; object states: " + JSON.stringify(queue.packets.filter(packet => packet.type === "object_state")) +
        "; recent packets: " + JSON.stringify(queue.packets.slice(-12))));
    }, timeoutMs);
    queue.waiters.push(waiter);
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
  trackSocketMessages(socket);
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
    world_id: randomUUID(), instance_id: instanceId, client_type: "unity-android"
  }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("uceno-social").setAudience("uceno-world-gateway")
    .setSubject(randomUUID()).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(tokenSecret));
  const socket = new WebSocket(`ws://127.0.0.1:${port}/world`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("wrong instance WebSocket was not rejected")), 5000);
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      response.resume();
      resolve();
    });
    socket.once("open", () => {
      clearTimeout(timeout);
      socket.close();
      reject(new Error("wrong instance WebSocket unexpectedly opened"));
    });
    socket.once("error", error => { clearTimeout(timeout); reject(error); });
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
  const instanceC = randomUUID();
  const portA = await freePort();
  const portB = await freePort();
  const portC = await freePort();
  const worldId = randomUUID();
  const userId = randomUUID();
  const activityId = randomUUID();
  const createdAt = Date.now();
  let gatewayA;
  let gatewayB;
  let gatewayC;
  let duplicateGatewayA;
  const registryDirectory = mkdtempSync(join(tmpdir(), "uceno-world-registry-"));
  const registryFile = join(registryDirectory, "world-interactables.json");
  writeFileSync(registryFile, JSON.stringify({ interactables: [
    { id: "scene:test-door", kind: "door", x: 37.5, y: 1.15, z: -22.25, yaw: 0 },
    { id: "scene:test-furniture", kind: "furniture", x: 38.0, y: 1.15, z: -22.25, yaw: 0 }
  ] }));

  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_instances (
      id UUID PRIMARY KEY, status TEXT NOT NULL, heartbeat_at TIMESTAMPTZ,
      endpoint TEXT, current_players INTEGER NOT NULL DEFAULT 0,
      owner_process_id UUID, owner_generation BIGINT NOT NULL DEFAULT 0,
      owner_lease_expires_at TIMESTAMPTZ
    )`);
    await admin.unsafe(`CREATE FUNCTION "${schema}".claim_world_instance_process(
      p_instance_id UUID, p_process_id UUID, p_lease_seconds INTEGER DEFAULT 12
    ) RETURNS BIGINT LANGUAGE SQL AS 'UPDATE "${schema}".virtual_world_instances
      SET owner_process_id = p_process_id, owner_generation = owner_generation + 1,
          owner_lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
          heartbeat_at = NOW(), current_players = 0
      WHERE id = p_instance_id AND status IN (''ready'',''draining'')
        AND (owner_process_id IS NULL OR owner_lease_expires_at IS NULL OR owner_lease_expires_at <= NOW())
      RETURNING owner_generation'`);
    await admin.unsafe(`CREATE FUNCTION "${schema}".renew_world_instance_process(
      p_instance_id UUID, p_process_id UUID, p_generation BIGINT,
      p_current_players INTEGER, p_lease_seconds INTEGER DEFAULT 12
    ) RETURNS BOOLEAN LANGUAGE SQL AS 'WITH updated AS (
      UPDATE "${schema}".virtual_world_instances SET heartbeat_at = NOW(), current_players = p_current_players,
        owner_lease_expires_at = NOW() + make_interval(secs => p_lease_seconds)
      WHERE id = p_instance_id AND status IN (''ready'',''draining'')
        AND owner_process_id = p_process_id AND owner_generation = p_generation
        AND owner_lease_expires_at > NOW()
      RETURNING 1
    ) SELECT EXISTS (SELECT 1 FROM updated)'`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_realtime_events (
      id BIGSERIAL PRIMARY KEY, world_id UUID, instance_id UUID,
      event_type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_realtime_consumers (
      instance_id UUID PRIMARY KEY, last_event_id BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_activity_results (
      session_id UUID NOT NULL, world_id UUID NOT NULL, user_id UUID NOT NULL,
      placement INTEGER, status TEXT NOT NULL, checkpoint_index INTEGER NOT NULL DEFAULT 0,
      finish_time DOUBLE PRECISION, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (session_id, user_id)
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
      world_id UUID NOT NULL, user_id UUID NOT NULL, position JSONB NOT NULL,
      rotation JSONB NOT NULL, session_generation BIGINT NOT NULL DEFAULT 0,
      state_version BIGINT NOT NULL DEFAULT 0, updated_by_session UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (world_id, user_id)
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
      updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (world_id, district_id, object_id)
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_player_sessions (
      world_id UUID NOT NULL, user_id UUID NOT NULL, instance_id UUID NOT NULL,
      session_id UUID NOT NULL, generation BIGINT NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (world_id, user_id)
    )`);
    await admin.unsafe(`INSERT INTO "${schema}".virtual_world_instances
      (id, status, heartbeat_at, endpoint) VALUES
      ($1::uuid, 'ready', NOW(), $2), ($3::uuid, 'ready', NOW(), $4)`,
      [instanceA, `http://127.0.0.1:${portA}`, instanceB, `http://127.0.0.1:${portB}`]);
    await admin.unsafe(`INSERT INTO "${schema}".users (id) VALUES ($1::uuid)`, [userId]);
    await admin.unsafe(`INSERT INTO "${schema}".virtual_worlds
      (id, status, visibility, owner_user_id) VALUES ($1::uuid, 'active', 'public', $2::uuid)`,
      [worldId, userId]);
    await admin.unsafe(`INSERT INTO "${schema}".virtual_world_memberships
      (world_id, user_id, status) VALUES ($1::uuid, $2::uuid, 'active')`, [worldId, userId]);
    await admin.unsafe(`INSERT INTO "${schema}".virtual_world_instance_sessions
      (world_id, user_id, instance_id, lease_expires_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, NOW() + INTERVAL '5 minutes')`,
      [worldId, userId, instanceB]);
    const persistedActivity = {
      id: activityId, worldId, instanceId: instanceA, hostUserId: userId,
      hostGeneration: 1, raceId: null, kind: "checkpoint_race", phase: "active",
      version: 7, createdAt, startedAt: createdAt, completedAt: null,
      maxParticipants: 8, checkpointCount: 3, participants: [{
        userId, status: "joined", joinedAt: createdAt, lastActionAt: createdAt,
        checkpointIndex: 2, finishTime: null
      }]
    };
    await admin.unsafe(`INSERT INTO "${schema}".virtual_world_activity_sessions
      (id, world_id, instance_id, host_user_id, host_generation, activity_kind,
       phase, version, state, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 'checkpoint_race',
       'active', 7, $5::jsonb, NOW(), NOW())`,
      [activityId, worldId, instanceA, userId, persistedActivity]);
    gatewayA = startGateway(portA, instanceA, scoped.toString(), registryFile);
    gatewayB = startGateway(portB, instanceB, scoped.toString(), registryFile);
    const readyA = await waitForReady(portA, gatewayA);
    const readyB = await waitForReady(portB, gatewayB);
    assert.equal(readyA.instanceId, instanceA);
    assert.equal(readyB.instanceId, instanceB);
    assert.equal(readyA.registeredInteractables, 2,
      "gateway A must load both real scene objects from WORLD_INTERACTABLES_FILE");
    assert.equal(readyB.registeredInteractables, 2,
      "gateway B must load both real scene objects from WORLD_INTERACTABLES_FILE");

    // A second real OS process using the same logical instance UUID must not
    // acquire ownership while the first process still holds its database lease.
    duplicateGatewayA = startGateway(portC, instanceA, scoped.toString(), registryFile);
    const duplicateDeadline = Date.now() + 10000;
    while (duplicateGatewayA.exitCode === null && Date.now() < duplicateDeadline)
      await delay(100);
    assert.notEqual(duplicateGatewayA.exitCode, null, "duplicate instance process must fail startup");
    assert.match(duplicateGatewayA.testOutput(), /world_instance_process_already_owned/);

    // A replacement process must restore the last durable player checkpoint,
    // not silently spawn the player at the world origin after a process loss.
    await admin.unsafe(`INSERT INTO "${schema}".virtual_world_player_state
      (world_id, user_id, position, rotation, session_generation, state_version, updated_by_session, updated_at)
      VALUES ($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, 0, 12, NULL, NOW())`,
      [worldId, userId, { x: 37.5, y: 1.15, z: -22.25 }, { x: 0, y: 0.3826834, z: 0, w: 0.9238795 }]);
    const authenticated = await connectAuthenticated(portB, instanceB, worldId, userId);
    assert.equal(authenticated.welcome.userId, userId);
    assert.equal(authenticated.welcome.state.x, 37.5);
    assert.equal(authenticated.welcome.state.y, 1.15);
    assert.equal(authenticated.welcome.state.z, -22.25);
    assert.ok(Math.abs(authenticated.welcome.state.yaw - Math.PI / 4) < 0.00001,
      "replacement process must restore the persisted player rotation");

    // Exercise the real WebSocket gateway against a Unity-export-shaped
    // registry entry and PostgreSQL-backed object-state persistence.
    const initialDoorState = await receiveSocketMessage(authenticated.socket, "object_state", 5000,
      packet => packet.objectId === "scene:test-door", "initial door snapshot");
    assert.equal(initialDoorState.objectState, "closed");
    authenticated.socket.send(JSON.stringify({
      type: "interact", objectId: "scene:test-door", action: "toggle"
    }));
    const openedDoorState = await receiveSocketMessage(authenticated.socket, "object_state", 5000,
      packet => packet.objectId === "scene:test-door" && packet.objectState === "open", "door opened broadcast");
    assert.equal(openedDoorState.version, 1);
    const persistedDoor = await admin.unsafe(`SELECT object_kind, object_state, version
      FROM "${schema}".virtual_world_object_states
      WHERE world_id = $1::uuid AND district_id = 'unassigned' AND object_id = 'scene:test-door'`,
      [worldId]);
    assert.equal(persistedDoor.length, 1);
    assert.equal(persistedDoor[0].object_kind, "door");
    assert.equal(persistedDoor[0].object_state, "open");
    assert.equal(Number(persistedDoor[0].version), 1);
    const initialFurnitureState = await receiveSocketMessage(authenticated.socket, "object_state", 5000,
      packet => packet.objectId === "scene:test-furniture", "initial furniture snapshot");
    assert.equal(initialFurnitureState.objectState, "idle");
    // The gateway enforces a 250 ms per-player interaction cooldown. Keep this
    // integration sequence deterministic instead of racing the second action.
    await delay(275);
    authenticated.socket.send(JSON.stringify({
      type: "interact", objectId: "scene:test-furniture", action: "use"
    }));
    const activeFurnitureState = await receiveSocketMessage(authenticated.socket, "object_state", 5000,
      packet => packet.objectId === "scene:test-furniture" && packet.objectState === "active", "furniture active broadcast");
    assert.equal(activeFurnitureState.version, 1);
    const persistedFurniture = await admin.unsafe(`SELECT object_kind, object_state, version
      FROM "${schema}".virtual_world_object_states
      WHERE world_id = $1::uuid AND district_id = 'unassigned' AND object_id = 'scene:test-furniture'`,
      [worldId]);
    assert.equal(persistedFurniture.length, 1);
    assert.equal(persistedFurniture[0].object_kind, "furniture");
    assert.equal(persistedFurniture[0].object_state, "active");
    assert.equal(Number(persistedFurniture[0].version), 1);
    authenticated.socket.close();
    const heartbeatDeadline = Date.now() + 5000;
    let liveHeartbeats = [];
    while (Date.now() < heartbeatDeadline) {
      liveHeartbeats = await admin.unsafe(`SELECT id FROM "${schema}".virtual_world_instances
        WHERE id = $1::uuid AND heartbeat_at > NOW() - INTERVAL '30 seconds'`, [instanceB]);
      if (liveHeartbeats.length) break;
      await delay(100);
    }
    assert.equal(liveHeartbeats.length, 1);
    // ... remaining failover assertions unchanged ...
  } finally {
    await Promise.all([stopGateway(gatewayA), stopGateway(gatewayB), stopGateway(gatewayC), stopGateway(duplicateGatewayA)]);
    await admin.end();
    rmSync(registryDirectory, { recursive: true, force: true });
  }
});
