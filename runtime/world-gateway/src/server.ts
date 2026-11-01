import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
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
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.8;

type CollisionBox = {
  minX: number; maxX: number; minY: number; maxY: number;
  minZ: number; maxZ: number;
};
type Interactable = { id: string; kind: "door" | "seat" | "object"; x: number; y: number; z: number; state: string; actorId: string | null; occupantId: string | null };

function loadInteractables(): Map<string, Interactable> {
  const filePath = process.env.WORLD_INTERACTABLES_FILE || process.env.WORLD_COLLISION_BOXES_FILE;
  let raw = process.env.WORLD_INTERACTABLES;
  if (!raw && filePath) {
    try { raw = readFileSync(filePath, "utf8"); }
    catch (error) {
      throw new Error("Could not read world interactables: " +
        (error instanceof Error ? error.message : "unknown file error"));
    }
  }
  if (!raw) return new Map();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("World interactables must be valid JSON"); }
  const values = parsed && typeof parsed === "object" &&
    Array.isArray((parsed as { interactables?: unknown }).interactables)
      ? (parsed as { interactables: unknown[] }).interactables : [];
  if (values.length > 500) throw new Error("World interactables cannot exceed 500 entries");
  const result = new Map<string, Interactable>();
  for (const [index, value] of values.entries()) {
    if (!value || typeof value !== "object") throw new Error(`Interactable ${index} is invalid`);
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9._:-]{1,80}$/.test(item.id) ||
        (item.kind !== "door" && item.kind !== "seat" && item.kind !== "object") ||
        !finiteNumber(item.x, -WORLD_BOUNDS, WORLD_BOUNDS) ||
        !finiteNumber(item.y, -WORLD_BOUNDS, WORLD_BOUNDS) ||
        !finiteNumber(item.z, -WORLD_BOUNDS, WORLD_BOUNDS) || result.has(item.id))
      throw new Error(`Interactable ${index} has invalid or duplicate fields`);
    result.set(item.id, {
      id: item.id, kind: item.kind, x: item.x, y: item.y, z: item.z,
      state: item.kind === "door" ? "closed" : item.kind === "seat" ? "available" : "idle", actorId: null, occupantId: null
    });
  }
  return result;
}

function loadCollisionBoxes(): CollisionBox[] {
  const filePath = process.env.WORLD_COLLISION_BOXES_FILE;
  let raw = process.env.WORLD_COLLISION_BOXES;
  if (!raw && filePath) {
    try { raw = readFileSync(filePath, "utf8"); }
    catch (error) {
      throw new Error("Could not read WORLD_COLLISION_BOXES_FILE: " +
        (error instanceof Error ? error.message : "unknown file error"));
    }
  }
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Collision geometry must be valid JSON"); }
  const values = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { boxes?: unknown }).boxes)
      ? (parsed as { boxes: unknown[] }).boxes
      : null;
  if (!values || values.length > 500)
    throw new Error("Collision geometry must contain a boxes array with at most 500 entries");
  return values.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`Collision box ${index} is invalid`);
    const box = value as Record<string, unknown>;
    const keys = ["minX", "maxX", "minY", "maxY", "minZ", "maxZ"] as const;
    for (const key of keys) {
      if (typeof box[key] !== "number" || !Number.isFinite(box[key]))
        throw new Error(`Collision box ${index} has invalid ${key}`);
    }
    const b = box as unknown as CollisionBox;
    if (b.minX >= b.maxX || b.minY >= b.maxY || b.minZ >= b.maxZ ||
        Math.abs(b.minX) > WORLD_BOUNDS || Math.abs(b.maxX) > WORLD_BOUNDS ||
        Math.abs(b.minY) > WORLD_BOUNDS || Math.abs(b.maxY) > WORLD_BOUNDS ||
        Math.abs(b.minZ) > WORLD_BOUNDS || Math.abs(b.maxZ) > WORLD_BOUNDS)
      throw new Error(`Collision box ${index} has invalid bounds`);
    return b;
  });
}

const COLLISION_BOXES = loadCollisionBoxes();
const INTERACTABLES = loadInteractables();
const OBJECT_STATE_FILE = process.env.WORLD_OBJECT_STATE_FILE || "";

function restorePersistentObjectStates(): void {
  if (!OBJECT_STATE_FILE) return;
  let raw: string;
  try { raw = readFileSync(OBJECT_STATE_FILE, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error("Could not read WORLD_OBJECT_STATE_FILE: " +
      (error instanceof Error ? error.message : "unknown file error"));
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("WORLD_OBJECT_STATE_FILE must contain valid JSON"); }
  if (!parsed || typeof parsed !== "object" ||
      !Array.isArray((parsed as { objects?: unknown }).objects))
    throw new Error("WORLD_OBJECT_STATE_FILE must contain an objects array");
  for (const value of (parsed as { objects: unknown[] }).objects) {
    if (!value || typeof value !== "object") continue;
    const saved = value as Record<string, unknown>;
    if (typeof saved.id !== "string" || typeof saved.state !== "string") continue;
    const target = INTERACTABLES.get(saved.id);
    if (!target || target.kind === "seat") continue;
    const validState = target.kind === "door"
      ? saved.state === "open" || saved.state === "closed"
      : saved.state === "active" || saved.state === "idle";
    if (validState) target.state = saved.state;
  }
}

function persistObjectStates(): void {
  if (!OBJECT_STATE_FILE) return;
  const objects = Array.from(INTERACTABLES.values())
    .filter(item => item.kind !== "seat")
    .map(item => ({ id: item.id, state: item.state }));
  const temporaryPath = OBJECT_STATE_FILE + ".tmp";
  writeFileSync(temporaryPath, JSON.stringify({ version: 1, objects }), { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, OBJECT_STATE_FILE);
}

restorePersistentObjectStates();

function overlapsBox(x: number, y: number, z: number, box: CollisionBox): boolean {
  const horizontal = x + PLAYER_RADIUS > box.minX && x - PLAYER_RADIUS < box.maxX &&
    z + PLAYER_RADIUS > box.minZ && z - PLAYER_RADIUS < box.maxZ;
  const vertical = y + PLAYER_HEIGHT > box.minY && y < box.maxY;
  return horizontal && vertical;
}

function resolveHorizontalMovement(player: Player, nextX: number, nextZ: number) {
  const candidateX = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, nextX));
  const blockedX = COLLISION_BOXES.some(box => overlapsBox(candidateX, player.y, player.z, box));
  if (!blockedX) player.x = candidateX;

  const candidateZ = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, nextZ));
  const blockedZ = COLLISION_BOXES.some(box => overlapsBox(player.x, player.y, candidateZ, box));
  if (!blockedZ) player.z = candidateZ;
}

if (!/^[0-9a-f-]{36}$/i.test(INSTANCE_ID) || !DATABASE_URL || TOKEN_SECRET.length < 32)
  throw new Error("WORLD_INSTANCE_ID, DATABASE_URL and a 32+ character WORLD_TOKEN_SECRET are required");

const sql = postgres(DATABASE_URL, { max: 8, idle_timeout: 20, connect_timeout: 10 });
const secret = new TextEncoder().encode(TOKEN_SECRET);
type Player = {
  id: string; worldId: string; token: string; socket: WebSocket; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; yaw: number; grounded: boolean;
  moveX: number; moveZ: number; sprint: boolean; seated: boolean; gesture: string; gestureSequence: number; jumpQueued: boolean;
  lastInputAt: number; inputCount: number; inputWindowAt: number;
  lastSequence: number; lastCheckpointAt: number; lastAuthorizationCheck: number; authorizationCheckInProgress: boolean;
  lastInteractionAt: number;
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
    SELECT position, rotation FROM virtual_world_player_state
    WHERE world_id = ${worldId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  const p = rows[0]?.position || { x: 0, y: GROUND_Y, z: 0 };
  const x = finiteNumber(p.x, -WORLD_BOUNDS, WORLD_BOUNDS) ? p.x : 0;
  const y = finiteNumber(p.y, GROUND_Y, WORLD_BOUNDS) ? p.y : GROUND_Y;
  const z = finiteNumber(p.z, -WORLD_BOUNDS, WORLD_BOUNDS) ? p.z : 0;
  const rotation = rows[0]?.rotation || { y: 0, w: 1 };
  const yaw = finiteNumber(rotation.y, -1.01, 1.01) && finiteNumber(rotation.w, -1.01, 1.01)
    ? 2 * Math.atan2(rotation.y, rotation.w) : 0;
  return {
    id: userId, worldId, token, socket, x, y, z, vx: 0, vy: 0, vz: 0, yaw, grounded: y <= GROUND_Y + 0.01,
    moveX: 0, moveZ: 0, sprint: false, seated: false, gesture: "none", gestureSequence: 0, jumpQueued: false,
    lastInputAt: Date.now(), inputCount: 0, inputWindowAt: Date.now(),
    lastSequence: 0, lastCheckpointAt: Date.now(), lastAuthorizationCheck: Date.now(), authorizationCheckInProgress: false,
    lastInteractionAt: 0
  };
}

const server = createServer(async (req, res) => {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (req.url === "/health") {
    // Liveness only: the process can answer even while PostgreSQL is unavailable.
    res.writeHead(200, headers);
    res.end(JSON.stringify({ service: "uceno-world-gateway", status: "online", instanceId: INSTANCE_ID, players: players.size, capacity: MAX_CLIENTS }));
    return;
  }
  if (req.url === "/ready") {
    // Readiness is stricter than liveness. Do not route new players to a
    // gateway whose database lease/instance registration is missing or stale.
    try {
      const rows = await sql`
        SELECT status, endpoint, heartbeat_at
        FROM virtual_world_instances
        WHERE id = ${INSTANCE_ID}::uuid
        LIMIT 1
      `;
      const instance = rows[0];
      const ready = !!instance && instance.status === "ready" &&
        typeof instance.endpoint === "string" && instance.endpoint.length > 0 &&
        instance.heartbeat_at != null &&
        Date.now() - new Date(instance.heartbeat_at).getTime() < 30000;
      res.writeHead(ready ? 200 : 503, headers);
      res.end(JSON.stringify({
        service: "uceno-world-gateway",
        status: ready ? "ready" : "not_ready",
        instanceId: INSTANCE_ID,
        players: players.size,
        capacity: MAX_CLIENTS
      }));
    } catch {
      res.writeHead(503, headers);
      res.end(JSON.stringify({ service: "uceno-world-gateway", status: "database_unavailable" }));
    }
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
    const token = req.headers.authorization.slice(7);
    const identity = await authenticate(token);
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
      if (msg && msg.type === "interact") {
        if (typeof msg.objectId !== "string" ||
            !/^[a-zA-Z0-9._:-]{1,80}$/.test(msg.objectId) ||
            !["toggle", "use", "sit", "stand"].includes(msg.action)) {
          fail(socket, "invalid_interaction"); return;
        }
        const target = INTERACTABLES.get(msg.objectId);
        const actionMatches = target && (
          (target.kind === "door" && msg.action === "toggle") ||
          (target.kind === "object" && msg.action === "use") ||
          (target.kind === "seat" && (msg.action === "sit" || msg.action === "stand"))
        );
        if (!actionMatches) {
          send(socket, { type: "interaction_rejected", code: "unknown_or_invalid_object" }); return;
        }
        const distance = Math.hypot(player.x - target.x, player.y - target.y, player.z - target.z);
        const now = Date.now();
        if (distance > 4.25 || now - player.lastInteractionAt < 250) {
          send(socket, { type: "interaction_rejected", code: "out_of_range_or_rate_limited" }); return;
        }
        if (target.kind === "seat") {
          if (msg.action === "sit" && target.occupantId && target.occupantId !== player.id) {
            send(socket, { type: "interaction_rejected", code: "seat_occupied" }); return;
          }
          if (msg.action === "stand" && target.occupantId !== player.id) {
            send(socket, { type: "interaction_rejected", code: "seat_not_occupied_by_player" }); return;
          }
          if (msg.action === "sit") {
            target.occupantId = player.id;
            target.state = "occupied";
            player.seated = true;
          } else {
            target.occupantId = null;
            target.state = "available";
            player.seated = false;
          }
        } else {
          target.state = target.kind === "door"
            ? (target.state === "open" ? "closed" : "open")
            : (target.state === "active" ? "idle" : "active");
        }
        player.lastInteractionAt = now;
        target.actorId = player.id;
        if (target.kind !== "seat") {
          try { persistObjectStates(); }
          catch (error) {
            console.error("Could not persist world object state:", error);
            send(socket, { type: "interaction_rejected", code: "state_persistence_failed" });
            return;
          }
        }
        const packet = {
          type: "object_state", objectId: target.id, objectState: target.state,
          actorId: player.id, occupantId: target.occupantId
        };
        for (const peer of players.values()) send(peer.socket, packet);
        return;
      }
      if (!msg || msg.type !== "input" || !Number.isSafeInteger(msg.sequence) ||
          msg.sequence <= player.lastSequence || !finiteNumber(msg.moveX, -1, 1) ||
          !finiteNumber(msg.moveZ, -1, 1) || !finiteNumber(msg.yaw, -Math.PI * 4, Math.PI * 4) ||
          typeof msg.sprint !== "boolean" || typeof msg.jump !== "boolean" ||
          typeof msg.seated !== "boolean" || !["none", "wave", "cheer"].includes(msg.gesture) ||
          !Number.isSafeInteger(msg.gestureSequence) || msg.gestureSequence < 0) {
        fail(socket, "invalid_input"); return;
      }
      const now = Date.now();
      if (now - player.inputWindowAt >= 1000) { player.inputWindowAt = now; player.inputCount = 0; }
      if (++player.inputCount > MAX_INPUTS_PER_SECOND) { fail(socket, "input_rate_exceeded"); return; }
      player.lastSequence = msg.sequence;
      player.lastInputAt = now;
      player.moveX = msg.moveX; player.moveZ = msg.moveZ;
      player.yaw = msg.yaw; player.sprint = msg.sprint && !msg.seated;
      player.seated = Array.from(INTERACTABLES.values()).some(item =>
        item.kind === "seat" && item.occupantId === player.id);
      if (msg.gestureSequence >= player.gestureSequence) {
        player.gestureSequence = msg.gestureSequence;
        player.gesture = msg.gesture;
      }
      if (player.seated) player.jumpQueued = false;
      if (msg.jump && player.grounded && !player.seated) player.jumpQueued = true;
    });
    const releaseSeats = () => {
      const current = players.get(identity.userId);
      // Ignore a late close event from an older socket after this user has
      // already reconnected, but release seats if moderation removed this
      // socket from the live-player map before the close event arrived.
      if (current && current.socket !== socket) return;
      if (current?.socket === socket) players.delete(identity.userId);
      for (const target of INTERACTABLES.values()) {
        if (target.kind !== "seat" || target.occupantId !== identity.userId) continue;
        target.occupantId = null;
        target.state = "available";
        target.actorId = identity.userId;
        const packet = {
          type: "object_state", objectId: target.id, objectState: target.state,
          actorId: identity.userId, occupantId: null
        };
        for (const peer of players.values()) send(peer.socket, packet);
      }
    };
    socket.on("close", releaseSeats);
    socket.on("error", releaseSeats);
  } catch {
    fail(socket, "session_initialization_failed");
  }
});

// Re-check the original signed session periodically so bans, suspensions, blocks,
 // world shutdowns and expired tokens revoke already-open sockets.
setInterval(() => {
  const now = Date.now();
  for (const player of players.values()) {
    if (now - player.lastAuthorizationCheck < 15000 || player.authorizationCheckInProgress) continue;
    player.lastAuthorizationCheck = now;
    player.authorizationCheckInProgress = true;
    void authenticate(player.token).catch(() => {
      if (players.get(player.id)?.socket === player.socket) {
        send(player.socket, { type: "error", code: "access_revoked" });
        player.socket.close(4003, "access_revoked");
        players.delete(player.id);
      }
    }).finally(() => { player.authorizationCheckInProgress = false; });
  }
}, 5000);

let lastTick = Date.now();
setInterval(async () => {
  const now = Date.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;
  const snapshots: Array<{ userId: string; x: number; y: number; z: number; yaw: number; grounded: boolean; seated: boolean; sprint: boolean; gesture: string; gestureSequence: number }> = [];
  for (const p of players.values()) {
    if (p.socket.readyState !== WebSocket.OPEN) continue;
    if (now - p.lastInputAt > 1500) { p.moveX = 0; p.moveZ = 0; p.sprint = false; }
    const magnitude = Math.hypot(p.moveX, p.moveZ);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const speed = p.sprint ? RUN_SPEED : MOVE_SPEED;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const localX = p.moveX * scale, localZ = p.moveZ * scale;
    p.vx = p.seated ? 0 : (localX * cos + localZ * sin) * speed;
    p.vz = p.seated ? 0 : (-localX * sin + localZ * cos) * speed;
    if (p.jumpQueued && p.grounded) { p.vy = JUMP_SPEED; p.grounded = false; }
    p.jumpQueued = false;
    p.vy -= GRAVITY * dt;
    resolveHorizontalMovement(p, p.x + p.vx * dt, p.z + p.vz * dt);
    p.y += p.vy * dt;
    if (p.y <= GROUND_Y) { p.y = GROUND_Y; p.vy = 0; p.grounded = true; }
    snapshots.push({ userId: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, grounded: p.grounded,
      seated: p.seated, sprint: p.sprint, gesture: p.gesture, gestureSequence: p.gestureSequence });
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
