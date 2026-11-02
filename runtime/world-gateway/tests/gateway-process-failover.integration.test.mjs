import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";

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
  const schemaIdent = admin(schema);
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set("options", `-csearch_path=${schema},public`);
  const instanceA = randomUUID();
  const instanceB = randomUUID();
  const portA = await freePort();
  const portB = await freePort();
  let gatewayA;
  let gatewayB;

  try {
    await admin`CREATE SCHEMA ${schemaIdent}`;
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
      id UUID PRIMARY KEY, instance_id UUID NOT NULL, phase TEXT NOT NULL,
      state JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )`);
    await admin.unsafe(`CREATE TABLE "${schema}".virtual_world_activity_transfer_tickets (
      expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
    )`);
    await admin`INSERT INTO ${schemaIdent}.virtual_world_instances (id, status, endpoint)
      VALUES (${instanceA}::uuid, 'ready', ${`http://127.0.0.1:${portA}`}),
             (${instanceB}::uuid, 'ready', ${`http://127.0.0.1:${portB}`})`;

    gatewayA = startGateway(portA, instanceA, scoped.toString());
    gatewayB = startGateway(portB, instanceB, scoped.toString());
    const readyA = await waitForReady(portA, gatewayA);
    const readyB = await waitForReady(portB, gatewayB);
    assert.equal(readyA.instanceId, instanceA);
    assert.equal(readyB.instanceId, instanceB);

    await t.test("both independent processes publish their own database heartbeat", async () => {
      const rows = await admin`SELECT id, heartbeat_at FROM ${schemaIdent}.virtual_world_instances
        WHERE id IN (${instanceA}::uuid, ${instanceB}::uuid)`;
      assert.equal(rows.length, 2);
      assert.ok(rows.every(row => row.heartbeat_at instanceof Date));
    });

    await t.test("replacement remains ready after the primary process is terminated", async () => {
      await stopGateway(gatewayA);
      const replacement = await waitForReady(portB, gatewayB);
      assert.equal(replacement.instanceId, instanceB);
      assert.equal(replacement.status, "ready");
      const primary = await admin`SELECT heartbeat_at FROM "${schema}".virtual_world_instances
        WHERE id = ${instanceA}::uuid`;
      assert.equal(primary.length, 1);
      await admin`UPDATE ${schemaIdent}.virtual_world_instances
        SET heartbeat_at = NOW() - INTERVAL '1 minute'
        WHERE id = ${instanceA}::uuid`;
      const stale = await admin`SELECT heartbeat_at < NOW() - INTERVAL '30 seconds' AS stale
        FROM "${schema}".virtual_world_instances WHERE id = ${instanceA}::uuid`;
      assert.equal(stale[0].stale, true);
      assert.equal((await waitForReady(portB, gatewayB)).instanceId, instanceB);
    });
  } catch (error) {
    const logs = [gatewayA?.testOutput?.(), gatewayB?.testOutput?.()].filter(Boolean).join("\n--- gateway ---\n");
    if (logs) error.message += `\nGateway process output:\n${logs}`;
    throw error;
  } finally {
    await Promise.all([gatewayA && stopGateway(gatewayA), gatewayB && stopGateway(gatewayB)].filter(Boolean));
    await admin`DROP SCHEMA IF EXISTS ${schemaIdent} CASCADE`.catch(() => {});
    await admin.end({ timeout: 5 });
  }
});
