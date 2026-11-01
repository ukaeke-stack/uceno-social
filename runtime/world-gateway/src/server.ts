import { createServer } from "node:http";
import { jwtVerify } from "jose";
import postgres from "postgres";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 8080);
const INSTANCE_ID = process.env.WORLD_INSTANCE_ID || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TOKEN_SECRET = process.env.WORLD_TOKEN_SECRET || "";
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const MAX_CLIENTS = Number(process.env.WORLD_INSTANCE_CAPACITY || 64);
const WORLD_BOUNDS = Number(process.env.WORLD_BOUNDS || 10000);
const MOVE_SPEED = 5.5;
const RUN_SPEED = 8.0;
const JUMP_SPEED = 6.5;
const GRAVITY = 18;
const GROUND_Y = 1.15;
const MAX_INPUTS_PER_SECOND = 30;

if (!/^[0-9a-f-]{36}$/i.test(INSTANCE_ID) || !DATABASE_URL || TOKEN_SECRET.length < 32)
  throw new Error("WORLD_INSTANCE_ID, DATABASE_URL and a 32+ character WORLD_TOKEN_SECRET are required");

const sql = postgres(DATABASE_URL, { max: 8, idle_timeout: 20, connect_timeout: 10 });
const secret = new TextEncoder().encode(TOKEN_SECRET);
type Player = {
  id: string; worldId: string; token: string; socket: WebSocket; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; yaw: number; grounded: boolean;
  moveX: number; moveZ: number; sprint: boolean; jumpQueued: boolean;
  lastInputAt: number; inputCount: number; inputWindowAt: number;
  lastSequence: number; lastCheckpointAt: number; lastAuthorizationCheck: number; authorizationCheckInProgress: boolean;
};
const players = new Map<string, Player>();

function send(socket: WebSocket, value: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}
function fail(socket: WebSocket, code: string) {
  send(socket, { type: "error", code });
  socket.close(1008, code);
}
function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

async function authenticate(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"], issuer: "uceno-social", audience: "uceno-world-gateway"
  });
  if (typeof payload.sub !== "string" || typeof payload.world_id !== "string" ||
      payload.instance_id !== INSTANCE_ID ||
      !["unity-android", "unity-desktop"].includes(String(payload.client_type)))
    throw new Error("invalid_scope");

  const rows = await sql`
    SELECT u.id, u.moderation_status AS "moderationStatus",
      u.suspended_until AS "suspendedUntil",
      w.status AS "worldStatus", w.visibility, w.owner_user_id AS "ownerUserId",
      COALESCE(m.status, 'none') AS "membershipStatus",
      EXISTS (
        SELECT 1 FROM virtual_world_instance_sessions s
        JOIN virtual_world_instances i ON i.id = s.instance_id
        WHERE s.world_id = ${payload.world_id}::uuid
          AND s.user_id = u.id AND s.instance_id = ${INSTANCE_ID}::uuid
          AND s.lease_expires_at > NOW() AND i.status = 'ready'
          AND i.endpoint IS NOT NULL AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
      ) AS "leaseHealthy",
      EXISTS (
        SELECT 1 FROM user_blocks b
        JOIN virtual_worlds vw ON vw.id = ${payload.world_id}::uuid
        WHERE (b.blocker_id = u.id AND b.blocked_id = vw.owner_user_id)
           OR (b.blocker_id = vw.owner_user_id AND b.blocked_id = u.id)
      ) AS blocked
    FROM users u
    JOIN virtual_worlds w ON w.id = ${payload.world_id}::uuid
    LEFT JOIN virtual_world_memberships m
      ON m.world_id = w.id AND m.user_id = u.id
    WHERE u.id = ${payload.sub}::uuid LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.moderationStatus === "disabled" ||
      (row.moderationStatus === "suspended" &&
       (!row.suspendedUntil || new Date(row.suspendedUntil).getTime() > Date.now())) ||
      row.worldStatus !== "published" || row.blocked || !row.leaseHealthy ||
      row.membershipStatus === "banned" || row.membershipStatus === "suspended" ||
      (row.visibility === "private" && row.membershipStatus !== "active" && row.ownerUserId !== row.id))
    throw new Error("access_revoked");
  return { userId: row.id as string, worldId: payload.world_id as string };
}

async function loadPlayer(userId: string, worldId: string, token: string, socket: WebSocket): Promise<Player> {
  const rows = await sql`
    SELECT position FROM virtual_world_player_state
    WHERE world_id = ${worldId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  const p = rows[0]?.position || { x: 0, y: GROUND_Y, z: 0 };
  const x = finiteNumber(p.x, -WORLD_BOUNDS, WORLD_BOUNDS) ? p.x : 0;
  const y = finiteNumber(p.y, GROUND_Y, WORLD_BOUNDS) ? p.y : GROUND_Y;
  const z = finiteNumber(p.z, -WORLD_BOUNDS, WORLD_BOUNDS) ? p.z : 0;
  return {
    id: userId, worldId, token, socket, x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, grounded: y <= GROUND_Y + 0.01,
    moveX: 0, moveZ: 0, sprint: false, jumpQueued: false,
    lastInputAt: Date.now(), inputCount: 0, inputWindowAt: Date.now(),
    lastSequence: 0, lastCheckpointAt: Date.now(), lastAuthorizationCheck: Date.now(), authorizationCheckInProgress: false
  };
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ service: "uceno-world-gateway", status: "online", instanceId: INSTANCE_ID, players: players.size, capacity: MAX_CLIENTS }));
    return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
const upgradeIdentity = new WeakMap<WebSocket, { userId: string; worldId: string; token: string }>();

server.on("upgrade", async (req, socket, head) => {
  try {
    if (req.url !== "/world" || !req.headers.authorization?.startsWith("Bearer "))
      throw new Error("unauthorized");
    const token = req.headers.authorization.slice(7);\n    const identity = await authenticate(token);
    if (players.size >= MAX_CLIENTS && !players.has(identity.userId)) throw new Error("instance_full");
    wss.handleUpgrade(req, socket, head, (ws) => {
      upgradeIdentity.set(ws, { ...identity, token });
      wss.emit("connection", ws, req);
    });
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});

wss.on("connection", async (socket: WebSocket) => {
  const identity = upgradeIdentity.get(socket);
  if (!identity) { fail(socket, "missing_identity"); return; }
  try {
    const old = players.get(identity.userId);
    if (old) { old.socket.close(4001, "replaced_by_reconnect"); players.delete(identity.userId); }
    const player = await loadPlayer(identity.userId, identity.worldId, identity.token, socket);
    players.set(identity.userId, player);
    send(socket, { type: "welcome", userId: identity.userId, tickRate: TICK_RATE,
      state: { x: player.x, y: player.y, z: player.z, yaw: player.yaw } });

    socket.on("message", (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { fail(socket, "invalid_json"); return; }
      if (!msg || msg.type !== "input" || !Number.isSafeInteger(msg.sequence) ||
          msg.sequence <= player.lastSequence || !finiteNumber(msg.moveX, -1, 1) ||
          !finiteNumber(msg.moveZ, -1, 1) || !finiteNumber(msg.yaw, -Math.PI * 4, Math.PI * 4) ||
          typeof msg.sprint !== "boolean" || typeof msg.jump !== "boolean") {
        fail(socket, "invalid_input"); return;
      }
      const now = Date.now();
      if (now - player.inputWindowAt >= 1000) { player.inputWindowAt = now; player.inputCount = 0; }
      if (++player.inputCount > MAX_INPUTS_PER_SECOND) { fail(socket, "input_rate_exceeded"); return; }
      player.lastSequence = msg.sequence;
      player.lastInputAt = now;
      player.moveX = msg.moveX; player.moveZ = msg.moveZ;
      player.yaw = msg.yaw; player.sprint = msg.sprint;
      if (msg.jump && player.grounded) player.jumpQueued = true;
    });
    socket.on("close", () => {
      if (players.get(identity.userId)?.socket === socket) players.delete(identity.userId);
    });
    socket.on("error", () => {
      if (players.get(identity.userId)?.socket === socket) players.delete(identity.userId);
    });
  } catch {
    fail(socket, "session_initialization_failed");
  }
});

// Re-check the original signed session periodically so bans, suspensions, blocks,\n// world shutdowns and expired tokens revoke already-open sockets.\nsetInterval(() => {\n  const now = Date.now();\n  for (const player of players.values()) {\n    if (now - player.lastAuthorizationCheck < 15000 || player.authorizationCheckInProgress) continue;\n    player.lastAuthorizationCheck = now;\n    player.authorizationCheckInProgress = true;\n    void authenticate(player.token).catch(() => {\n      if (players.get(player.id)?.socket === player.socket) {\n        send(player.socket, { type: "error", code: "access_revoked" });\n        player.socket.close(4003, "access_revoked");\n        players.delete(player.id);\n      }\n    }).finally(() => { player.authorizationCheckInProgress = false; });\n  }\n}, 5000);\n\nlet lastTick = Date.now();
setInterval(async () => {
  const now = Date.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;
  const snapshots: Array<{ userId: string; x: number; y: number; z: number; yaw: number; grounded: boolean }> = [];
  for (const p of players.values()) {
    if (p.socket.readyState !== WebSocket.OPEN) continue;
    if (now - p.lastInputAt > 1500) { p.moveX = 0; p.moveZ = 0; p.sprint = false; }
    const magnitude = Math.hypot(p.moveX, p.moveZ);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const speed = p.sprint ? RUN_SPEED : MOVE_SPEED;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const localX = p.moveX * scale, localZ = p.moveZ * scale;
    p.vx = (localX * cos + localZ * sin) * speed;
    p.vz = (-localX * sin + localZ * cos) * speed;
    if (p.jumpQueued && p.grounded) { p.vy = JUMP_SPEED; p.grounded = false; }
    p.jumpQueued = false;
    p.vy -= GRAVITY * dt;
    p.x = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, p.x + p.vx * dt));
    p.z = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, p.z + p.vz * dt));
    p.y += p.vy * dt;
    if (p.y <= GROUND_Y) { p.y = GROUND_Y; p.vy = 0; p.grounded = true; }
    snapshots.push({ userId: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, grounded: p.grounded });
    if (now - p.lastCheckpointAt >= 5000) {
      p.lastCheckpointAt = now;
      void sql`
        INSERT INTO virtual_world_player_state (world_id, user_id, position, rotation, updated_at)
        SELECT s.world_id, ${p.id}::uuid,
          ${JSON.stringify({ x: p.x, y: p.y, z: p.z })}::jsonb,
          ${JSON.stringify({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) })}::jsonb, NOW()
        FROM virtual_world_instance_sessions s
        WHERE s.user_id = ${p.id}::uuid AND s.instance_id = ${INSTANCE_ID}::uuid
          AND s.lease_expires_at > NOW()
        ON CONFLICT (world_id, user_id) DO UPDATE SET
          position = EXCLUDED.position, rotation = EXCLUDED.rotation, updated_at = NOW()
      `.catch((error) => console.error("checkpoint_write_failed", error));
    }
  }
  if (snapshots.length) {
    const packet = JSON.stringify({ type: "snapshot", serverTime: now, players: snapshots });
    for (const p of players.values()) if (p.socket.readyState === WebSocket.OPEN) p.socket.send(packet);
  }
}, TICK_MS);

const heartbeat = async () => {
  try {
    await sql`
      UPDATE virtual_world_instances SET heartbeat_at = NOW(),
        current_players = ${players.size}
      WHERE id = ${INSTANCE_ID}::uuid AND status IN ('ready', 'draining')
    `;
  } catch (error) { console.error("instance_heartbeat_failed", error); }
};
void heartbeat();
setInterval(heartbeat, 10000);

server.listen(PORT, () => console.log(`UCENO world gateway listening on ${PORT} for instance ${INSTANCE_ID}`));
process.on("SIGTERM", async () => {
  for (const p of players.values()) p.socket.close(1001, "server_shutdown");
  await sql.end({ timeout: 5 });
  server.close();
});
