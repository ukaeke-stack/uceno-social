import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { createActivitySession, joinActivity, startActivity, recordCheckpoint, leaveActivity, cancelActivity, selectNextActivityHost, type ActivitySession } from "./activity-session.js";
import { serializeActivitySession, restoreActivitySession } from "./activity-persistence.js";
import { parseWorldDistricts, findWorldDistrict, type WorldDistrict } from "./district-policy.js";
import { matchesDistrictTransition, planDistrictTransition } from "./district-transition-policy.js";
import { parseDistrictCollisionManifest } from "./district-collision-policy.js";
import { sameSpatialVoiceRoom, isWithinVoiceRange, isWithinVoiceRangeWithHysteresis, isValidVoiceSignal } from "./voice-policy.js";
import { resolveInteraction, isInteractionAllowed } from "./interaction-policy.js";
import { isPersistentObjectState, defaultPersistentObjectState } from "./district-object-policy.js";
import { checkpointVersionForSession } from "./session-fence-policy.js";
import { shouldPublishWorldSnapshot, WORLD_RELAY_BATCH_SIZE, WORLD_RELAY_POLL_INTERVAL_MS } from "./world-relay-policy.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { jwtVerify, SignJWT } from "jose";
import postgres from "postgres";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 8080);
const INSTANCE_ID = process.env.WORLD_INSTANCE_ID || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TOKEN_SECRET = process.env.WORLD_TOKEN_SECRET || "";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
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
type Interactable = { id: string; districtId: string; kind: "door" | "seat" | "object" | "furniture" | "vehicle"; x: number; y: number; z: number; yaw: number; state: string; version: number; actorId: string | null; occupantId: string | null };
type EquippedWardrobeItem = { slot: string; itemId: string };

function loadWorldDistricts(): WorldDistrict[] {
  const filePath = process.env.WORLD_DISTRICTS_FILE;
  let raw = process.env.WORLD_DISTRICTS;
  if (!raw && filePath) {
    try { raw = readFileSync(filePath, "utf8"); }
    catch (error) {
      throw new Error("Could not read WORLD_DISTRICTS_FILE: " +
        (error instanceof Error ? error.message : "unknown file error"));
    }
  }
  return parseWorldDistricts(raw, WORLD_BOUNDS);
}

const WORLD_DISTRICTS = loadWorldDistricts();

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
        (item.kind !== "door" && item.kind !== "seat" && item.kind !== "object" && item.kind !== "furniture" && item.kind !== "vehicle") ||
        !finiteNumber(item.x, -WORLD_BOUNDS, WORLD_BOUNDS) ||
        !finiteNumber(item.y, -WORLD_BOUNDS, WORLD_BOUNDS) ||
        !finiteNumber(item.z, -WORLD_BOUNDS, WORLD_BOUNDS) ||
        (item.yaw !== undefined && !finiteNumber(item.yaw, -Math.PI * 4, Math.PI * 4)) || result.has(item.id))
      throw new Error(`Interactable ${index} has invalid or duplicate fields`);
    const owningDistrict = findWorldDistrict(WORLD_DISTRICTS, item.x, item.z);
    if (WORLD_DISTRICTS.length > 0 && !owningDistrict)
      throw new Error(`Interactable ${item.id} is outside every configured world district`);
    result.set(item.id, {
      id: item.id, districtId: owningDistrict?.id ?? "unassigned",
      kind: item.kind, x: item.x, y: item.y, z: item.z,
      yaw: typeof item.yaw === "number" ? item.yaw : 0,
      state: item.kind === "seat" ? "available" : defaultPersistentObjectState(item.kind),
      version: 0, actorId: null, occupantId: null
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

type DistrictCollisionMaps = Map<string, CollisionBox[]>;

function loadDistrictCollisionMaps(): DistrictCollisionMaps {
  const manifestPath = process.env.WORLD_DISTRICT_MAP_MANIFEST_FILE;
  if (!manifestPath) return new Map();
  let raw: string;
  try { raw = readFileSync(manifestPath, "utf8"); }
  catch (error) {
    throw new Error("Could not read WORLD_DISTRICT_MAP_MANIFEST_FILE: " +
      (error instanceof Error ? error.message : "invalid JSON"));
  }
  return parseDistrictCollisionManifest(raw, WORLD_DISTRICTS, WORLD_BOUNDS, (filename, districtId) => {
    const mapPath = resolve(dirname(resolve(manifestPath)), filename);
    try { return readFileSync(mapPath, "utf8"); }
    catch (error) {
      throw new Error(`Could not read district map ${districtId}: ` +
        (error instanceof Error ? error.message : "unknown file error"));
    }
  });
}

const DISTRICT_COLLISION_BOXES = loadDistrictCollisionMaps();
const INTERACTABLES = loadInteractables();

type RaceCheckpoint = { x: number; y: number; z: number; radius: number };
type RaceDefinition = { id: string; checkpoints: RaceCheckpoint[] };

function loadActivityRaces(): Map<string, RaceDefinition> {
  const filePath = process.env.WORLD_ACTIVITY_RACES_FILE;
  let raw = process.env.WORLD_ACTIVITY_RACES;
  if (!raw && filePath) {
    try { raw = readFileSync(filePath, "utf8"); }
    catch (error) {
      throw new Error("Could not read WORLD_ACTIVITY_RACES_FILE: " +
        (error instanceof Error ? error.message : "unknown file error"));
    }
  }
  if (!raw) return new Map();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("WORLD_ACTIVITY_RACES must be valid JSON"); }
  const values = parsed && typeof parsed === "object" &&
    Array.isArray((parsed as { races?: unknown }).races)
      ? (parsed as { races: unknown[] }).races : null;
  if (!values || values.length > 100)
    throw new Error("WORLD_ACTIVITY_RACES must contain a races array with at most 100 entries");
  const races = new Map<string, RaceDefinition>();
  for (const [index, value] of values.entries()) {
    if (!value || typeof value !== "object") throw new Error(`Race ${index} is invalid`);
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
        races.has(item.id) || !Array.isArray(item.checkpoints) ||
        item.checkpoints.length < 2 || item.checkpoints.length > 100)
      throw new Error(`Race ${index} has invalid or duplicate fields`);
    const checkpoints: RaceCheckpoint[] = item.checkpoints.map((rawCheckpoint, checkpointIndex) => {
      if (!rawCheckpoint || typeof rawCheckpoint !== "object")
        throw new Error(`Race ${item.id} checkpoint ${checkpointIndex} is invalid`);
      const checkpoint = rawCheckpoint as Record<string, unknown>;
      if (!finiteNumber(checkpoint.x, -WORLD_BOUNDS, WORLD_BOUNDS) ||
          !finiteNumber(checkpoint.y, GROUND_Y, WORLD_BOUNDS) ||
          !finiteNumber(checkpoint.z, -WORLD_BOUNDS, WORLD_BOUNDS) ||
          (checkpoint.radius !== undefined && !finiteNumber(checkpoint.radius, 0.5, 20)))
        throw new Error(`Race ${item.id} checkpoint ${checkpointIndex} has invalid coordinates/radius`);
      return {
        x: checkpoint.x, y: checkpoint.y, z: checkpoint.z,
        radius: typeof checkpoint.radius === "number" ? checkpoint.radius : 2.5
      };
    });
    races.set(item.id, { id: item.id, checkpoints });
  }
  return races;
}

const ACTIVITY_RACES = loadActivityRaces();

function overlapsBox(x: number, y: number, z: number, box: CollisionBox): boolean {
  const horizontal = x + PLAYER_RADIUS > box.minX && x - PLAYER_RADIUS < box.maxX &&
    z + PLAYER_RADIUS > box.minZ && z - PLAYER_RADIUS < box.maxZ;
  const vertical = y + PLAYER_HEIGHT > box.minY && y < box.maxY;
  return horizontal && vertical;
}

function resolveHorizontalMovement(player: Player, nextX: number, nextZ: number) {
  if (player.homeAnchor) {
    // Residential interiors are a server-owned 12 x 10 metre room.
    // The client cannot walk through walls or move the home anchor.
    const dx = nextX - player.homeAnchor.x;
    const dz = nextZ - player.homeAnchor.z;
    const cos = Math.cos(player.homeAnchor.yaw);
    const sin = Math.sin(player.homeAnchor.yaw);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const boundedX = Math.max(-5.45, Math.min(5.45, localX));
    const boundedZ = Math.max(-4.45, Math.min(4.45, localZ));
    player.x = player.homeAnchor.x + boundedX * cos + boundedZ * sin;
    player.z = player.homeAnchor.z - boundedX * sin + boundedZ * cos;
    return;
  }
  const candidateX = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, nextX));
  const collisionBoxes = player.activeDistrictId && DISTRICT_COLLISION_BOXES.has(player.activeDistrictId)
    ? DISTRICT_COLLISION_BOXES.get(player.activeDistrictId)! : COLLISION_BOXES;
  const blockedX = collisionBoxes.some(box => overlapsBox(candidateX, player.y, player.z, box));
  if (!blockedX) player.x = candidateX;

  const candidateZ = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, nextZ));
  const blockedZ = collisionBoxes.some(box => overlapsBox(player.x, player.y, candidateZ, box));
  if (!blockedZ) player.z = candidateZ;
}

if (!/^[0-9a-f-]{36}$/i.test(INSTANCE_ID) || !DATABASE_URL || TOKEN_SECRET.length < 32)
  throw new Error("WORLD_INSTANCE_ID, DATABASE_URL and a 32+ character WORLD_TOKEN_SECRET are required");

const sql = postgres(DATABASE_URL, { max: 8, idle_timeout: 20, connect_timeout: 10 });
const PROCESS_ID = randomUUID();
const PROCESS_LEASE_MS = 12000;
let processGeneration = 0;
let processAuthority = false;
let processLeaseUntil = 0;

async function acquireProcessOwnership(): Promise<void> {
  const rows = await sql`SELECT claim_world_instance_process(
    ${INSTANCE_ID}::uuid, ${PROCESS_ID}::uuid, 12
  ) AS generation`;
  const generation = Number(rows[0]?.generation);
  if (!Number.isSafeInteger(generation) || generation < 1)
    throw new Error("world_instance_process_already_owned");
  processGeneration = generation;
  processAuthority = true;
  processLeaseUntil = Date.now() + PROCESS_LEASE_MS;
  console.log("instance_process_ownership_acquired", { processId: PROCESS_ID, generation });
}

function fenceProcess(reason: string): void {
  if (!processAuthority) return;
  processAuthority = false;
  console.error("instance_process_fenced", { processId: PROCESS_ID, generation: processGeneration, reason });
  for (const player of players.values()) player.socket.close(1012, "instance_process_replaced");
  if (server.listening) server.close();
  void sql.end({ timeout: 2 }).finally(() => process.exit(1));
}

function assertProcessAuthority(): void {
  if (!processAuthority || Date.now() >= processLeaseUntil) {
    fenceProcess("process_lease_expired");
    throw new Error("instance_process_not_authoritative");
  }
}

const loadedObjectWorlds = new Set<string>();
async function ensureObjectStatesLoaded(worldId: string): Promise<void> {
  if (loadedObjectWorlds.has(worldId)) return;
  const rows = await sql`
    SELECT district_id AS "districtId", object_id AS "objectId",
      object_kind AS "objectKind", object_state AS "objectState", version
    FROM virtual_world_object_states WHERE world_id = ${worldId}::uuid
  `;
  for (const row of rows) {
    const target = INTERACTABLES.get(row.objectId);
    if (!target || target.kind === "seat" || target.districtId !== row.districtId ||
        target.kind !== row.objectKind || !isPersistentObjectState(target.kind, row.objectState)) continue;
    target.state = row.objectState;
    target.version = Number(row.version);
  }
  loadedObjectWorlds.add(worldId);
}

async function persistDatabaseObjectState(worldId: string, actorId: string, target: Interactable): Promise<boolean> {
  const version = await sql.begin(async tx => {
    // Serialize object mutations against process takeover. The row lock is
    // held until the object-state write commits.
    const owner = await tx`SELECT id FROM virtual_world_instances
      WHERE id = ${INSTANCE_ID}::uuid
        AND owner_process_id = ${PROCESS_ID}::uuid
        AND owner_generation = ${processGeneration}
        AND owner_lease_expires_at > clock_timestamp()
      FOR SHARE`;
    if (!owner.length) return null;
    const rows = await tx`
      INSERT INTO virtual_world_object_states
        (world_id, district_id, object_id, object_kind, object_state, updated_by, version, updated_at)
      VALUES (${worldId}::uuid, ${target.districtId}, ${target.id}, ${target.kind}, ${target.state}, ${actorId}::uuid, 1, NOW())
      ON CONFLICT (world_id, district_id, object_id) DO UPDATE SET
        object_kind = EXCLUDED.object_kind, object_state = EXCLUDED.object_state,
        updated_by = EXCLUDED.updated_by, version = virtual_world_object_states.version + 1,
        updated_at = NOW()
      WHERE virtual_world_object_states.version = ${target.version}
        AND virtual_world_object_states.object_kind = EXCLUDED.object_kind
      RETURNING version
    `;
    return rows[0] ? Number(rows[0].version) : null;
  });
  if (version === null) return false;
  target.version = version;
  return true;
}

async function refreshDistrictObjectStates(worldId: string, districtId: string): Promise<void> {
  const rows = await sql`
    SELECT object_id AS "objectId", object_kind AS "objectKind",
      object_state AS "objectState", version, updated_by AS "updatedBy"
    FROM virtual_world_object_states
    WHERE world_id = ${worldId}::uuid AND district_id = ${districtId}
  `;
  for (const row of rows) {
    const target = INTERACTABLES.get(row.objectId);
    if (!target || target.kind === "seat" || target.districtId !== districtId ||
        target.kind !== row.objectKind || !isPersistentObjectState(target.kind, row.objectState) ||
        Number(row.version) <= target.version) continue;
    target.state = row.objectState;
    target.version = Number(row.version);
    target.actorId = row.updatedBy ?? null;
  }
}
const secret = new TextEncoder().encode(TOKEN_SECRET);
type Player = {
  id: string; worldId: string; token: string; socket: WebSocket; sessionId: string; sessionGeneration: number; stateVersion: number; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; yaw: number; grounded: boolean;
  moveX: number; moveZ: number; sprint: boolean; seated: boolean; gesture: string; gestureSequence: number; jumpQueued: boolean;
  lastInputAt: number; inputCount: number; inputWindowAt: number;
  lastSequence: number; lastCheckpointAt: number; lastAuthorizationCheck: number; authorizationCheckInProgress: boolean;
  lastInteractionAt: number;
  lastWardrobeRefreshAt: number;
  voiceActive: boolean;
  lastVoiceSignalAt: number;
  voiceSignalWindowAt: number;
  voiceSignalCount: number;
  homeId: string | null;
  homeAnchor: { x: number; y: number; z: number; yaw: number } | null;
  eventId: string | null;
  wardrobe: EquippedWardrobeItem[];
  returnState: { x: number; y: number; z: number; yaw: number } | null;
  activeDistrictId: string | null;
  pendingDistrict: { id: string; contentLabel: string; nonce: string; createdAt: number } | null;
};
const players = new Map<string, Player>();
const voiceVisiblePairs = new Set<string>();
const voiceBlockCheckAt = new Map<string, number>();
const voicePairRooms = new Map<string, string>();
const livekitRooms = LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET ? new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) : null;

function voicePairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
// Activity sessions are persisted in PostgreSQL; each instance owns its local authoritative copy.
const activitySessions = new Map<string, ActivitySession>();
const fencedActivitySessions = new Set<string>();
let lastWorldSnapshotRelayAt = 0;
let worldRelayCursor = 0;
let worldRelayCursorReady = false;
async function initializeWorldRelayCursor(): Promise<void> {
  if (worldRelayCursorReady) return;
  try {
    // The consumer key is the stable world-instance UUID, not the OS process.
    // Replacements for the same instance resume from the last acknowledged row.
    await sql`INSERT INTO virtual_world_realtime_consumers (instance_id, last_event_id, updated_at)
      VALUES (${INSTANCE_ID}::uuid, 0, NOW()) ON CONFLICT (instance_id) DO NOTHING`;
    const rows = await sql`SELECT last_event_id AS cursor FROM virtual_world_realtime_consumers
      WHERE instance_id = ${INSTANCE_ID}::uuid`;
    const cursor = Number(rows[0]?.cursor ?? -1);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("invalid_world_relay_cursor");
    worldRelayCursor = cursor;
    worldRelayCursorReady = true;
    console.log("world_relay_cursor_initialized", worldRelayCursor);
  } catch (error) {
    console.error("world_relay_cursor_init_failed_retrying", error);
    setTimeout(() => { void initializeWorldRelayCursor(); }, 5000);
  }
}
void initializeWorldRelayCursor();

async function persistWorldRelayCursor(eventId: number): Promise<void> {
  const rows = await sql.begin(async tx => {
    const owner = await tx`SELECT id FROM virtual_world_instances
      WHERE id = ${INSTANCE_ID}::uuid
        AND owner_process_id = ${PROCESS_ID}::uuid
        AND owner_generation = ${processGeneration}
        AND owner_lease_expires_at > clock_timestamp()
      FOR SHARE`;
    if (!owner.length) return null;
    const updated = await tx`UPDATE virtual_world_realtime_consumers
      SET last_event_id = GREATEST(last_event_id, ${eventId}), updated_at = NOW()
      WHERE instance_id = ${INSTANCE_ID}::uuid
      RETURNING last_event_id`;
    return updated[0] ? Number(updated[0].last_event_id) : null;
  });
  if (rows === null) throw new Error("world_relay_consumer_cursor_missing_or_process_fenced");
  worldRelayCursor = Number(rows);
  if (!Number.isSafeInteger(worldRelayCursor) || worldRelayCursor < eventId)
    throw new Error("invalid_world_relay_cursor_update");
}
const activityHosts = new Map<string, string>();
const activityHostGenerations = new Map<string, number>();
const activityRaceIds = new Map<string, string>();
const MAX_ACTIVITY_SESSIONS = 256;
const MAX_NONTERMINAL_ACTIVITIES_PER_WORLD = 32;
const ACTIVITY_LOBBY_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_MAX_RUNTIME_MS = 2 * 60 * 60 * 1000;
const ACTIVITY_TERMINAL_RETENTION_MS = 30 * 60 * 1000;

function activityPayload(session: ActivitySession) {
  return {
    type: "activity_state",
    session: {
      id: session.id,
      hostUserId: activityHosts.get(session.id) || "",
      raceId: activityRaceIds.get(session.id) || "",
      worldId: session.worldId,
      instanceId: session.instanceId,
      hostGeneration: activityHostGenerations.get(session.id) ?? 1,
      kind: session.kind,
      phase: session.phase,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      version: session.version,
      maxParticipants: session.maxParticipants,
      checkpointCount: session.checkpointCount,
      participants: Array.from(session.participants.values()).map(participant => ({
        userId: participant.userId,
        status: participant.status,
        joinedAt: participant.joinedAt,
        checkpointIndex: participant.checkpointIndex,
        finishTime: participant.finishTime
      }))
    }
  };
}

async function persistActivity(session: ActivitySession): Promise<boolean> {
  const hostUserId = activityHosts.get(session.id);
  if (!hostUserId || fencedActivitySessions.has(session.id)) return false;
  const hostGeneration = activityHostGenerations.get(session.id) ?? 1;
  const raceId = activityRaceIds.get(session.id) ?? null;
  const state = serializeActivitySession(session, hostUserId, hostGeneration, raceId);

  // Persist the authoritative state and its relay event in one transaction.
  // A takeover that wins the row lock first makes this write a no-op; a takeover
  // that follows this transaction makes the relay reject the now-stale event.
  let saved = false;
  try {
    saved = await sql.begin(async tx => {
      // Lock the logical instance ownership row for the duration of this
      // authoritative write. A takeover UPDATE must wait until this
      // transaction commits; an expired or replaced process cannot begin it.
      const owner = await tx`SELECT id FROM virtual_world_instances
        WHERE id = ${INSTANCE_ID}::uuid
          AND owner_process_id = ${PROCESS_ID}::uuid
          AND owner_generation = ${processGeneration}
          AND owner_lease_expires_at > clock_timestamp()
        FOR SHARE`;
      if (!owner.length) return false;
      const rows = await tx`INSERT INTO virtual_world_activity_sessions
        (id, world_id, instance_id, host_user_id, host_generation, race_id, activity_kind,
         phase, version, state, created_at, started_at, completed_at)
        VALUES (${session.id}::uuid, ${session.worldId}::uuid, ${session.instanceId}::uuid,
          ${hostUserId}::uuid, ${hostGeneration}, ${raceId}, ${session.kind}, ${session.phase},
          ${session.version}, ${JSON.stringify(state)}::jsonb,
          to_timestamp(${session.createdAt / 1000}),
          ${session.startedAt === null ? null : new Date(session.startedAt)},
          ${session.completedAt === null ? null : new Date(session.completedAt)})
        ON CONFLICT (id) DO UPDATE SET host_user_id = EXCLUDED.host_user_id,
          host_generation = EXCLUDED.host_generation, race_id = EXCLUDED.race_id,
          phase = EXCLUDED.phase, version = EXCLUDED.version, state = EXCLUDED.state,
          started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at, updated_at = NOW()
        WHERE virtual_world_activity_sessions.instance_id = EXCLUDED.instance_id
          AND virtual_world_activity_sessions.host_generation = EXCLUDED.host_generation
          AND virtual_world_activity_sessions.version < EXCLUDED.version
        RETURNING id`;
      if (!rows[0]) return false;
      await tx`INSERT INTO virtual_world_realtime_events
        (world_id, instance_id, event_type, payload)
        VALUES (${session.worldId}::uuid, ${INSTANCE_ID}::uuid, 'activity_state',
          ${JSON.stringify(activityPayload(session))}::jsonb)`;
      return true;
    });
  } catch (error) {
    console.error("activity_persistence_failed", session.id, error);
    return false;
  }

  if (!saved) {
    const current = await sql`SELECT instance_id AS "instanceId",
        host_generation AS "hostGeneration"
      FROM virtual_world_activity_sessions WHERE id = ${session.id}::uuid LIMIT 1`
      .catch(() => []);
    const row = current[0];
    const stillOwned = row && row.instanceId === INSTANCE_ID &&
      Number(row.hostGeneration) === hostGeneration;
    if (!stillOwned) {
      fencedActivitySessions.add(session.id);
      activitySessions.delete(session.id);
      activityHosts.delete(session.id);
      activityHostGenerations.delete(session.id);
      activityRaceIds.delete(session.id);
      for (const peer of players.values()) {
        if (peer.worldId === session.worldId) send(peer.socket, {
          type: "activity_host_fenced", sessionId: session.id
        });
      }
      console.warn("activity_host_authority_revoked", session.id, hostGeneration);
    }
    return false;
  }

  if (session.phase !== "completed" && session.phase !== "cancelled") return true;
  const ordered = [...session.participants.values()]
    .filter(p => p.status === "finished" || p.status === "dnf" || p.status === "left")
    .sort((a, b) => a.status === "finished" && b.status === "finished"
      ? (a.finishTime ?? Number.MAX_SAFE_INTEGER) - (b.finishTime ?? Number.MAX_SAFE_INTEGER)
      : a.status === "finished" ? -1 : b.status === "finished" ? 1 : a.joinedAt - b.joinedAt);
  try {
    const resultsSaved = await sql.begin(async tx => {
      const owner = await tx`SELECT id FROM virtual_world_instances
        WHERE id = ${INSTANCE_ID}::uuid
          AND owner_process_id = ${PROCESS_ID}::uuid
          AND owner_generation = ${processGeneration}
          AND owner_lease_expires_at > clock_timestamp()
        FOR SHARE`;
      if (!owner.length) return false;
      const authority = await tx`SELECT 1 FROM virtual_world_activity_sessions
        WHERE id = ${session.id}::uuid AND instance_id = ${INSTANCE_ID}::uuid
          AND host_generation = ${hostGeneration} AND phase IN ('completed', 'cancelled')
        FOR UPDATE`;
      if (!authority[0]) return false;
      for (const [index, participant] of ordered.entries()) {
        await tx`INSERT INTO virtual_world_activity_results
          (session_id, world_id, user_id, placement, status, checkpoint_index, finish_time)
          VALUES (${session.id}::uuid, ${session.worldId}::uuid, ${participant.userId}::uuid,
            ${participant.status === "finished" ? index + 1 : null}, ${participant.status},
            ${participant.checkpointIndex}, ${participant.finishTime})
          ON CONFLICT (session_id, user_id) DO UPDATE SET
            placement = EXCLUDED.placement, status = EXCLUDED.status,
            checkpoint_index = EXCLUDED.checkpoint_index, finish_time = EXCLUDED.finish_time`;
      }
      return true;
    });
    return resultsSaved;
  } catch (error) {
    console.error("activity_results_persistence_failed", session.id, error);
    return false;
  }
}

async function broadcastActivity(session: ActivitySession) {
  // Activity state is delivered only through the durable relay. The relay
  // re-checks the persisted host generation immediately before fan-out.
  await persistActivity(session);
}

async function restorePersistedActivities(): Promise<void> {
  const rows = await sql`SELECT state FROM virtual_world_activity_sessions
    WHERE instance_id = ${INSTANCE_ID}::uuid
      AND (phase IN ('lobby', 'active') OR completed_at > NOW() - INTERVAL '30 minutes')
    ORDER BY updated_at DESC LIMIT ${MAX_ACTIVITY_SESSIONS}`;
  for (const row of rows) {
    const restored = restoreActivitySession(row.state);
    if (!restored || restored.session.instanceId !== INSTANCE_ID) {
      console.warn("activity_restore_skipped_invalid_state");
      continue;
    }
    activitySessions.set(restored.session.id, restored.session);
    activityHosts.set(restored.session.id, restored.hostUserId);
    activityHostGenerations.set(restored.session.id, restored.hostGeneration);
    if (restored.raceId) activityRaceIds.set(restored.session.id, restored.raceId);
  }
}

/**
 * Atomically claims a lobby whose previous gateway has stopped renewing its
 * heartbeat. The row version and host generation advance together, so only
 * one healthy instance can become the replacement host.
 */
async function tryTakeoverStaleActivity(sessionId: string, player: Player): Promise<ActivitySession | null> {
  if (activitySessions.has(sessionId) || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const rows = await sql.begin(async tx => {
    const owner = await tx`SELECT id FROM virtual_world_instances
      WHERE id = ${INSTANCE_ID}::uuid
        AND owner_process_id = ${PROCESS_ID}::uuid
        AND owner_generation = ${processGeneration}
        AND owner_lease_expires_at > clock_timestamp()
      FOR SHARE`;
    if (!owner.length) return null;
    const updated = await tx`UPDATE virtual_world_activity_sessions AS activity
    SET instance_id = ${INSTANCE_ID}::uuid,
        host_user_id = ${player.id}::uuid,
        host_generation = activity.host_generation + 1,
        version = activity.version + 1,
        state = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(activity.state, '{instanceId}', to_jsonb(${INSTANCE_ID}::text)),
              '{hostUserId}', to_jsonb(${player.id}::text)),
            '{hostGeneration}', to_jsonb(activity.host_generation + 1)),
          '{version}', to_jsonb(activity.version + 1)),
        updated_at = NOW()
    FROM virtual_world_instances AS previous_instance
    WHERE activity.id = ${sessionId}::uuid
      AND activity.world_id = ${player.worldId}::uuid
      AND activity.instance_id = previous_instance.id
      AND EXISTS (
        SELECT 1 FROM virtual_world_instances replacement_instance
        WHERE replacement_instance.id = ${INSTANCE_ID}::uuid
          AND replacement_instance.status = 'ready'
          AND replacement_instance.endpoint IS NOT NULL
          AND replacement_instance.heartbeat_at > NOW() - INTERVAL '30 seconds'
      )
      AND activity.phase IN ('lobby', 'active')
      AND (activity.phase = 'lobby' OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(activity.state->'participants') participant
        WHERE participant->>'userId' = ${player.id} 
          AND participant->>'status' = 'joined'
      ))
      AND (previous_instance.status <> 'ready'
        OR previous_instance.heartbeat_at IS NULL
        OR previous_instance.heartbeat_at < NOW() - INTERVAL '30 seconds')
    RETURNING activity.state`;
    return updated[0]?.state ?? null;
  });
  if (!rows) return null;
  const restored = restoreActivitySession(rows);
  if (!restored || restored.session.instanceId !== INSTANCE_ID ||
      restored.hostUserId !== player.id) {
    console.error("activity_takeover_returned_invalid_state", sessionId);
    return null;
  }
  activitySessions.set(sessionId, restored.session);
  activityHosts.set(sessionId, restored.hostUserId);
  activityHostGenerations.set(sessionId, restored.hostGeneration);
  if (restored.raceId) activityRaceIds.set(sessionId, restored.raceId);
  return restored.session;
}

function findAccessibleActivity(sessionId: unknown, player: Player): ActivitySession | null {
  if (typeof sessionId !== "string" || fencedActivitySessions.has(sessionId)) return null;
  const session = activitySessions.get(sessionId);
  return session && session.worldId === player.worldId &&
    session.instanceId === INSTANCE_ID ? session : null;
}

function leaveVoiceRoom(player: Player): void {
  if (!player.voiceActive) return;
  player.voiceActive = false;
  for (const key of [...voiceVisiblePairs]) {
    const [a, b] = key.split(":");
    if (a !== player.id && b !== player.id) continue;
    const peerId = a === player.id ? b : a;
    const peer = players.get(peerId);
    if (peer) {
      send(peer.socket, { type: "voice_presence", userId: player.id, active: false });
      send(player.socket, { type: "voice_presence", userId: peer.id, active: false });
    }
    voiceVisiblePairs.delete(key);
    voiceBlockCheckAt.delete(key);
    void revokeVoicePairRoom(key);
  }
}

function voiceRoomName(key: string): string {
  const digest = createHash("sha256").update(`${INSTANCE_ID}:${key}`).digest("hex").slice(0, 32);
  return `uceno-pair-${digest}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function revokeVoicePairRoom(key: string): Promise<void> {
  const room = voicePairRooms.get(key);
  voicePairRooms.delete(key);
  if (!room || !livekitRooms) return;

  // Evict both known identities before deleting the room. Room deletion alone
  // can fail transiently while connected participants remain attached.
  const [a, b] = key.split(":");
  const evictions = await Promise.allSettled([
    livekitRooms.removeParticipant(room, a),
    livekitRooms.removeParticipant(room, b)
  ]);
  for (const result of evictions) {
    if (result.status === "rejected")
      console.warn("livekit_pair_participant_eviction_failed", result.reason);
  }
  try { await livekitRooms.deleteRoom(room); }
  catch (error) { console.error("livekit_pair_room_cleanup_failed", error); }
}

async function isBlockedPair(a: string, b: string): Promise<boolean> {
  const rows = await sql`
    SELECT EXISTS (SELECT 1 FROM user_blocks
      WHERE (blocker_id = ${a}::uuid AND blocked_id = ${b}::uuid)
         OR (blocker_id = ${b}::uuid AND blocked_id = ${a}::uuid)) AS blocked
  `;
  return rows[0]?.blocked === true;
}

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

function releasePlayerSeats(userId: string) {
  for (const target of INTERACTABLES.values()) {
    if (target.kind !== "seat" || target.occupantId !== userId) continue;
    target.occupantId = null;
    target.state = "available";
    target.actorId = userId;
    const packet = {
      type: "object_state", objectId: target.id, objectState: target.state,
      actorId: userId, occupantId: null
    };
    for (const peer of players.values()) send(peer.socket, packet);
  }
}

function readSpatialTransform(value: unknown, zOffset = 0) {
  if (!value || typeof value !== "object") return null;
  const transform = value as Record<string, unknown>;
  if (!finiteNumber(transform.x, -WORLD_BOUNDS, WORLD_BOUNDS) ||
      !finiteNumber(transform.y, GROUND_Y, WORLD_BOUNDS) ||
      !finiteNumber(transform.z, -WORLD_BOUNDS, WORLD_BOUNDS) ||
      (transform.yaw !== undefined && !finiteNumber(transform.yaw, -360, 360))) return null;
  return {
    x: transform.x,
    y: transform.y,
    z: transform.z + zOffset,
    yaw: ((typeof transform.yaw === "number" ? transform.yaw : 0) * Math.PI) / 180
  };
}

async function authenticate(token: string, allowActivityTransfer = false) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"], issuer: "uceno-social", audience: "uceno-world-gateway"
  });
  const transfer = payload.scope === "activity-transfer";
  if (typeof payload.sub !== "string" || typeof payload.world_id !== "string" ||
      payload.instance_id !== INSTANCE_ID ||
      !["unity-android", "unity-desktop"].includes(String(payload.client_type)) ||
      (transfer && (!allowActivityTransfer || typeof payload.jti !== "string" || typeof payload.transfer_session_id !== "string" || payload.target_instance_id !== INSTANCE_ID)) ||
      (!transfer && payload.scope !== undefined)) throw new Error("invalid_scope");

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
      row.worldStatus !== "published" || row.blocked || (!transfer && !row.leaseHealthy) ||
      row.membershipStatus === "banned" || row.membershipStatus === "suspended" ||
      (row.visibility === "private" && row.membershipStatus !== "active" && row.ownerUserId !== row.id))
    throw new Error("access_revoked");
  return { userId: row.id as string, worldId: payload.world_id as string };
}

async function loadPlayer(userId: string, worldId: string, token: string, socket: WebSocket, sessionId: string, sessionGeneration: number): Promise<Player> {
  const rows = await sql`
    SELECT position, rotation, session_generation AS "sessionGeneration",
      state_version AS "stateVersion"
    FROM virtual_world_player_state
    WHERE world_id = ${worldId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  const p = rows[0]?.position || { x: 0, y: GROUND_Y, z: 0 };
  const x = finiteNumber(p.x, -WORLD_BOUNDS, WORLD_BOUNDS) ? p.x : 0;
  const y = finiteNumber(p.y, GROUND_Y, WORLD_BOUNDS) ? p.y : GROUND_Y;
  const z = finiteNumber(p.z, -WORLD_BOUNDS, WORLD_BOUNDS) ? p.z : 0;
  const wardrobeRows = await sql`
    SELECT e.slot, e.item_id AS "itemId"
    FROM user_avatar_wardrobe_equipped e
    JOIN user_avatar_wardrobe_inventory i
      ON i.user_id = e.user_id AND i.item_id = e.item_id
    JOIN avatar_wardrobe_items c
      ON c.item_id = e.item_id AND c.slot = e.slot AND c.enabled = TRUE
    WHERE e.user_id = ${userId}::uuid
    ORDER BY e.slot
  `;
  const rotation = rows[0]?.rotation || { y: 0, w: 1 };
  const yaw = finiteNumber(rotation.y, -1.01, 1.01) && finiteNumber(rotation.w, -1.01, 1.01)
    ? 2 * Math.atan2(rotation.y, rotation.w) : 0;
  return {
    id: userId, worldId, token, socket, sessionId, sessionGeneration,
    stateVersion: checkpointVersionForSession(rows[0]?.sessionGeneration, rows[0]?.stateVersion, sessionGeneration),
    x, y, z, vx: 0, vy: 0, vz: 0, yaw, grounded: y <= GROUND_Y + 0.01,
    moveX: 0, moveZ: 0, sprint: false, seated: false, gesture: "none", gestureSequence: 0, jumpQueued: false,
    lastInputAt: Date.now(), inputCount: 0, inputWindowAt: Date.now(),
    lastSequence: 0, lastCheckpointAt: Date.now(), lastAuthorizationCheck: Date.now(), authorizationCheckInProgress: false,
    lastInteractionAt: 0, lastWardrobeRefreshAt: 0, voiceActive: false, lastVoiceSignalAt: 0, voiceSignalWindowAt: Date.now(), voiceSignalCount: 0, homeId: null, homeAnchor: null, eventId: null, wardrobe: wardrobeRows.map(item => ({ slot: item.slot, itemId: item.itemId })), returnState: null,
    activeDistrictId: null, pendingDistrict: null
  };
}

const server = createServer(async (req, res) => {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (req.url !== "/health" && !processAuthority) {
    res.writeHead(503, headers);
    res.end(JSON.stringify({ error: "instance_process_not_authoritative" }));
    return;
  }
  if (req.url === "/activity/transfer-ticket" && req.method === "POST") {
    try {
      const authorization = req.headers.authorization || "";
      if (!authorization.startsWith("Bearer ")) throw new Error("unauthorized");
      const sourceToken = authorization.slice(7);
      const identity = await authenticate(sourceToken);
      const sourceClaims = await jwtVerify(sourceToken, secret, {
        algorithms: ["HS256"], issuer: "uceno-social", audience: "uceno-world-gateway"
      });
      const clientType = String(sourceClaims.payload.client_type);
      if (clientType !== "unity-android" && clientType !== "unity-desktop") throw new Error("invalid_request");
      const chunks: Buffer[] = [];
      let bodySize = 0;
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bodySize += bytes.length;
        if (bodySize > 4096) throw new Error("invalid_request");
        chunks.push(bytes);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { sessionId?: unknown };
      if (typeof body.sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.sessionId)) throw new Error("invalid_request");
      const player = players.get(identity.userId);
      if (!player || player.worldId !== identity.worldId || player.socket.readyState !== WebSocket.OPEN || player.homeId || player.eventId || player.returnState) throw new Error("player_not_transferable");
      const target = await sql`SELECT activity.instance_id AS "instanceId", instance.endpoint,
          activity.phase, activity.host_generation AS "hostGeneration", activity.state
        FROM virtual_world_activity_sessions activity
        JOIN virtual_world_instances instance ON instance.id = activity.instance_id
        WHERE activity.id = ${body.sessionId}::uuid
          AND activity.world_id = ${identity.worldId}::uuid
          AND activity.phase IN ('lobby', 'active')
          AND instance.status = 'ready' AND instance.endpoint IS NOT NULL
          AND instance.heartbeat_at > NOW() - INTERVAL '30 seconds'
          AND activity.instance_id <> ${INSTANCE_ID}::uuid
        LIMIT 1`;
      if (!target[0] || typeof target[0].endpoint !== "string") throw new Error("activity_target_unavailable");
      const persisted = restoreActivitySession(target[0].state);
      const participant = persisted?.session.participants.get(identity.userId);
      if (!persisted || persisted.hostGeneration !== Number(target[0].hostGeneration) ||
          (target[0].phase === "active" && (!participant || participant.status !== "joined"))) {
        throw new Error("activity_transfer_not_allowed");
      }
      const jti = randomUUID();
      await sql.begin(async tx => {
        const authority = await tx`SELECT id FROM virtual_world_instances
          WHERE id = ${INSTANCE_ID}::uuid
            AND owner_process_id = ${PROCESS_ID}::uuid
            AND owner_generation = ${processGeneration}
            AND owner_lease_expires_at > clock_timestamp()
          FOR SHARE`;
        if (!authority[0]) throw new Error("gateway_process_fenced");
        await tx`INSERT INTO virtual_world_activity_transfer_tickets
          (id, world_id, user_id, activity_session_id, source_instance_id,
           target_instance_id, host_generation, expires_at, created_at)
          VALUES (${jti}::uuid, ${identity.worldId}::uuid, ${identity.userId}::uuid,
            ${body.sessionId}::uuid, ${INSTANCE_ID}::uuid, ${target[0].instanceId}::uuid,
            ${persisted.hostGeneration}, NOW() + INTERVAL '30 seconds', NOW())`;
      });
      const ticket = await new SignJWT({
        world_id: identity.worldId, instance_id: target[0].instanceId,
        target_instance_id: target[0].instanceId, client_type: clientType,
        scope: "activity-transfer", transfer_session_id: body.sessionId,
        transfer_host_generation: persisted.hostGeneration
      }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer("uceno-social")
        .setAudience("uceno-world-gateway").setSubject(identity.userId)
        .setJti(jti).setIssuedAt().setExpirationTime("30s").sign(secret);
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ticket, endpoint: target[0].endpoint,
        instanceId: target[0].instanceId, sessionId: body.sessionId, expiresInSeconds: 30 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const status = message === "unauthorized" ? 401 : message === "invalid_request" ? 400 : message === "player_not_transferable" ? 403 : message === "activity_target_unavailable" ? 409 : 503;
      res.writeHead(status, headers);
      res.end(JSON.stringify({ error: ["unauthorized", "invalid_request", "player_not_transferable", "activity_target_unavailable"].includes(message) ? message : "transfer_ticket_unavailable" }));
    }
    return;
  }
  if (req.url?.startsWith("/voice/token?")) {
    try {
      if (!livekitRooms || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        res.writeHead(503, headers);
        res.end(JSON.stringify({ error: "voice_service_not_configured" }));
        return;
      }
      const authorization = req.headers.authorization || "";
      if (!authorization.startsWith("Bearer ")) throw new Error("unauthorized");
      const identity = await authenticate(authorization.slice(7));
      const requestUrl = new URL(req.url, "http://gateway.local");
      const peerId = requestUrl.searchParams.get("peerUserId") || "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(peerId) || peerId === identity.userId) {
        res.writeHead(400, headers);
        res.end(JSON.stringify({ error: "invalid_peer" }));
        return;
      }
      const caller = players.get(identity.userId);
      const peer = players.get(peerId);
      const key = voicePairKey(identity.userId, peerId);
      if (!caller || !peer || caller.worldId !== identity.worldId || peer.worldId !== identity.worldId ||
          !caller.voiceActive || !peer.voiceActive || !voiceVisiblePairs.has(key) ||
          !sameSpatialVoiceRoom(caller, peer) || !isWithinVoiceRange(caller, peer) ||
          caller.socket.readyState !== WebSocket.OPEN || peer.socket.readyState !== WebSocket.OPEN ||
          await isBlockedPair(identity.userId, peerId)) {
        res.writeHead(403, headers);
        res.end(JSON.stringify({ error: "voice_peer_not_eligible" }));
        return;
      }
      const room = voicePairRooms.get(key) || voiceRoomName(key);
      voicePairRooms.set(key, room);
      const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: identity.userId,
        ttl: "15s",
        metadata: JSON.stringify({ worldId: identity.worldId, instanceId: INSTANCE_ID, scope: "uceno-spatial-pair" })
      });
      token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false });
      const jwt = await token.toJwt();
      res.writeHead(200, headers);
      res.end(JSON.stringify({ token: jwt, url: LIVEKIT_URL, room, identity: identity.userId, peerUserId: peerId, expiresIn: 15 }));
    } catch (error) {
      const unauthorized = error instanceof Error && error.message === "unauthorized";
      res.writeHead(unauthorized ? 401 : 503, headers);
      res.end(JSON.stringify({ error: unauthorized ? "unauthorized" : "voice_token_unavailable" }));
    }
    return;
  }
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
      const ready = processAuthority && Date.now() < processLeaseUntil && !!instance && instance.status === "ready" &&
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
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
const upgradeIdentity = new WeakMap<WebSocket, { userId: string; worldId: string; token: string; sessionId: string; sessionGeneration: number; clientType: string; isTransfer: boolean }>();

server.on("upgrade", async (req, socket, head) => {
  try {
    assertProcessAuthority();
    if (req.url !== "/world" || !req.headers.authorization?.startsWith("Bearer "))
      throw new Error("unauthorized");
    const token = req.headers.authorization.slice(7);
    const identity = await authenticate(token, true);
    const verified = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer: "uceno-social", audience: "uceno-world-gateway" });
    const payload = verified.payload;
    const isTransfer = payload.scope === "activity-transfer";
    await ensureObjectStatesLoaded(identity.worldId);
    if (players.size >= MAX_CLIENTS && !players.has(identity.userId)) throw new Error("instance_full");
    const sessionId = randomUUID();
    const claimed = await sql.begin(async tx => {
      // Hold the logical instance ownership row while claiming the player
      // generation. A process takeover cannot race a stale upgrade handler.
      const owner = await tx`SELECT id FROM virtual_world_instances
        WHERE id = ${INSTANCE_ID}::uuid
          AND owner_process_id = ${PROCESS_ID}::uuid
          AND owner_generation = ${processGeneration}
          AND owner_lease_expires_at > clock_timestamp()
        FOR SHARE`;
      if (!owner.length) return null;
      if (isTransfer) {
        // Consume the ticket and claim the new player-session generation in
        // one transaction. A failed fence claim rolls ticket consumption back.
        const consumed = await tx`UPDATE virtual_world_activity_transfer_tickets ticket
          SET consumed_at = NOW()
          WHERE ticket.id = ${String(payload.jti)}::uuid
            AND ticket.world_id = ${identity.worldId}::uuid
            AND ticket.user_id = ${identity.userId}::uuid
            AND ticket.target_instance_id = ${INSTANCE_ID}::uuid
            AND ticket.activity_session_id = ${String(payload.transfer_session_id)}::uuid
            AND ticket.host_generation = ${Number(payload.transfer_host_generation)}
            AND ticket.consumed_at IS NULL AND ticket.expires_at > NOW()
            AND EXISTS (
              SELECT 1 FROM virtual_world_activity_sessions activity
              WHERE activity.id = ticket.activity_session_id
                AND activity.world_id = ticket.world_id
                AND activity.instance_id = ticket.target_instance_id
                AND activity.host_generation = ticket.host_generation
                AND (
                  activity.phase = 'lobby'
                  OR (activity.phase = 'active' AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(activity.state->'participants') participant
                    WHERE participant->>'userId' = ticket.user_id::text
                      AND participant->>'status' = 'joined'
                  ))
                )
            )
          RETURNING ticket.id`;
        if (!consumed[0]) return null;
        const fenced = await tx`INSERT INTO virtual_world_player_sessions
          (world_id, user_id, instance_id, session_id, generation, updated_at)
          SELECT ${identity.worldId}::uuid, ${identity.userId}::uuid,
            ${INSTANCE_ID}::uuid, ${sessionId}::uuid, 1, NOW()
          WHERE EXISTS (
            SELECT 1 FROM virtual_world_activity_transfer_tickets ticket
            WHERE ticket.id = ${String(payload.jti)}::uuid
              AND ticket.consumed_at IS NOT NULL
              AND ticket.user_id = ${identity.userId}::uuid
              AND ticket.target_instance_id = ${INSTANCE_ID}::uuid
              AND ticket.host_generation = ${Number(payload.transfer_host_generation)}
          )
          ON CONFLICT (world_id, user_id) DO UPDATE
            SET instance_id = EXCLUDED.instance_id,
                session_id = EXCLUDED.session_id,
                generation = virtual_world_player_sessions.generation + 1,
                updated_at = NOW()
          RETURNING generation`;
        return fenced[0] ? fenced : null;
      }
      const normal = await tx`
        INSERT INTO virtual_world_player_sessions
          (world_id, user_id, instance_id, session_id, generation, updated_at)
        SELECT s.world_id, s.user_id, s.instance_id, ${sessionId}::uuid, 1, NOW()
        FROM virtual_world_instance_sessions s
        WHERE s.world_id = ${identity.worldId}::uuid AND s.user_id = ${identity.userId}::uuid
          AND s.instance_id = ${INSTANCE_ID}::uuid AND s.lease_expires_at > NOW()
        ON CONFLICT (world_id, user_id) DO UPDATE
          SET instance_id = EXCLUDED.instance_id, session_id = EXCLUDED.session_id,
              generation = virtual_world_player_sessions.generation + 1, updated_at = NOW()
        RETURNING generation
      `;
      return normal[0] ? normal : null;
    });
    if (!claimed || !claimed[0]) throw new Error(isTransfer ? "transfer_ticket_invalid_or_used" : "session_lease_unavailable");
    const sessionGeneration = Number(claimed[0].generation);
    assertProcessAuthority();
    wss.handleUpgrade(req, socket, head, (ws) => {
      upgradeIdentity.set(ws, { ...identity, token, sessionId, sessionGeneration, clientType: String(payload.client_type), isTransfer });
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
    const player = await loadPlayer(identity.userId, identity.worldId, identity.token, socket, identity.sessionId, identity.sessionGeneration);
    const currentFence = await sql`
      SELECT session_id AS "sessionId", generation
      FROM virtual_world_player_sessions
      WHERE world_id = ${identity.worldId}::uuid AND user_id = ${identity.userId}::uuid
      LIMIT 1
    `;
    if (!currentFence[0] || currentFence[0].sessionId !== identity.sessionId ||
        Number(currentFence[0].generation) !== identity.sessionGeneration) {
      fail(socket, "session_superseded"); return;
    }
    players.set(identity.userId, player);
    const renewedAccessToken = identity.isTransfer ? await new SignJWT({
      world_id: identity.worldId, instance_id: INSTANCE_ID, client_type: identity.clientType
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("uceno-social").setAudience("uceno-world-gateway")
      .setSubject(identity.userId).setIssuedAt().setExpirationTime("1h").sign(secret) : "";
    send(socket, { type: "welcome", userId: identity.userId, tickRate: TICK_RATE,
      sessionGeneration: player.sessionGeneration, stateVersion: player.stateVersion,
      accessToken: renewedAccessToken, instanceId: INSTANCE_ID, expiresInSeconds: renewedAccessToken ? 3600 : 0,
      state: { x: player.x, y: player.y, z: player.z, yaw: player.yaw } });
    for (const activity of activitySessions.values()) {
      if (activity.worldId === player.worldId && activity.instanceId === INSTANCE_ID)
        send(socket, activityPayload(activity));
    }

    // A joining or reconnecting client must receive the current authoritative
    // state of every scene interactable. Broadcasting only future changes
    // leaves late joiners with stale door/object visuals and unknown seat use.
    const joiningDistrictId = findWorldDistrict(WORLD_DISTRICTS, player.x, player.z)?.id ?? "unassigned";
    for (const target of INTERACTABLES.values()) {
      if (target.districtId !== joiningDistrictId) continue;
      send(socket, {
        type: "object_state",
        objectId: target.id,
        objectState: target.state,
        actorId: target.actorId,
        occupantId: target.occupantId,
        version: target.version
      });
    }

    socket.on("message", async (raw) => {
      if (players.get(player.id) !== player || player.socket !== socket) return;
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { fail(socket, "invalid_json"); return; }
      if (msg && msg.type === "district_content_ready") {
        const pending = player.pendingDistrict;
        if (matchesDistrictTransition(pending, msg.districtId, msg.nonce)) {
          await refreshDistrictObjectStates(player.worldId, pending.id);
          // The refresh yields to the event loop; reject an acknowledgement if
          // this exact transition was cancelled or superseded while it ran.
          if (players.get(player.id) !== player || player.socket !== socket ||
              !matchesDistrictTransition(player.pendingDistrict, pending.id, pending.nonce) ||
              socket.readyState !== WebSocket.OPEN) return;
          player.activeDistrictId = pending.id;
          player.pendingDistrict = null;
          // Fetch the latest durable district version before sending the scene
          // snapshot; this also covers a fast re-entry on another runtime instance.
          for (const target of INTERACTABLES.values()) {
            if (target.districtId !== pending.id) continue;
            send(socket, { type: "object_state", objectId: target.id,
              objectState: target.state, actorId: target.actorId,
              occupantId: target.occupantId, version: target.version });
          }
          send(socket, { type: "district_content_accepted", districtId: msg.districtId, nonce: pending.nonce });
        }
        return;
      }
      if (msg && msg.type === "activity_create") {
        if (player.homeId || player.eventId || player.returnState ||
            !["checkpoint_race", "dance", "sports", "adventure"].includes(msg.kind) ||
            (msg.maxParticipants !== undefined &&
              (!Number.isInteger(msg.maxParticipants) || msg.maxParticipants < 2 || msg.maxParticipants > 64))) {
          send(socket, { type: "activity_rejected", code: "invalid_activity_request_or_context_active" }); return;
        }
        const nonterminalInWorld = [...activitySessions.values()].filter(session =>
          session.worldId === player.worldId &&
          session.phase !== "completed" && session.phase !== "cancelled").length;
        if (activitySessions.size >= MAX_ACTIVITY_SESSIONS ||
            nonterminalInWorld >= MAX_NONTERMINAL_ACTIVITIES_PER_WORLD) {
          send(socket, { type: "activity_rejected", code: "activity_capacity_reached" }); return;
        }
        let checkpointCount = 2;
        if (msg.kind === "checkpoint_race") {
          if (typeof msg.raceId !== "string" || !ACTIVITY_RACES.has(msg.raceId)) {
            send(socket, { type: "activity_rejected", code: "race_not_configured" }); return;
          }
          checkpointCount = ACTIVITY_RACES.get(msg.raceId)!.checkpoints.length;
        }
        const id = randomUUID();
        const created = createActivitySession({
          id, worldId: player.worldId, instanceId: INSTANCE_ID,
          kind: msg.kind, maxParticipants: msg.maxParticipants ?? 16,
          checkpointCount
        });
        if (!created.ok) {
          send(socket, { type: "activity_rejected", code: created.code }); return;
        }
        const joined = joinActivity(created.session, player.id);
        if (!joined.ok) {
          send(socket, { type: "activity_rejected", code: joined.code }); return;
        }
        activitySessions.set(id, created.session);
        activityHosts.set(id, player.id);
        activityHostGenerations.set(id, 1);
        if (msg.kind === "checkpoint_race") activityRaceIds.set(id, msg.raceId);
        broadcastActivity(created.session);
        return;
      }
      if (msg && msg.type === "activity_discover") {
        if (player.homeId || player.eventId || player.returnState) {
          send(socket, { type: "activity_discovery", sessions: [] }); return;
        }
        try {
          const rows = await sql`SELECT s.id, s.instance_id AS "instanceId",
              i.endpoint, s.activity_kind AS kind, s.phase, s.created_at AS "createdAt",
              s.updated_at AS "updatedAt", s.state
            FROM virtual_world_activity_sessions s
            JOIN virtual_world_instances i ON i.id = s.instance_id
            WHERE s.world_id = ${player.worldId}::uuid
              AND s.phase IN ('lobby', 'active')
              AND i.status = 'ready' AND i.endpoint IS NOT NULL
              AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
            ORDER BY s.created_at DESC LIMIT 50`;
          send(socket, { type: "activity_discovery", sessions: rows.map(row => {
            const restored = restoreActivitySession(row.state);
            return restored ? {
              id: row.id, instanceId: row.instanceId, endpoint: row.endpoint,
              kind: row.kind, phase: row.phase, createdAt: row.createdAt,
              startedAt: restored.session.startedAt, completedAt: restored.session.completedAt,
              version: restored.session.version, maxParticipants: restored.session.maxParticipants,
              checkpointCount: restored.session.checkpointCount, raceId: restored.raceId,
              hostUserId: restored.hostUserId,
              participants: [...restored.session.participants.values()].map(p => ({
                userId: p.userId, status: p.status, checkpointIndex: p.checkpointIndex
              }))
            } : null;
          }).filter(Boolean) });
        } catch (error) {
          console.error("activity_discovery_failed", error);
          send(socket, { type: "activity_discovery", sessions: [], error: "temporarily_unavailable" });
        }
        return;
      }
      if (msg && msg.type === "activity_join") {
        if (player.homeId || player.eventId || player.returnState) {
          send(socket, { type: "activity_rejected", code: "activity_context_active" }); return;
        }
        let session = findAccessibleActivity(msg.id, player);
        if (!session && typeof msg.id === "string" && /^[0-9a-f-]{36}$/i.test(msg.id)) {
          try {
            session = await tryTakeoverStaleActivity(msg.id, player);
            if (session) {
              broadcastActivity(session);
              send(socket, { type: "activity_host_recovered", sessionId: session.id,
                hostGeneration: activityHostGenerations.get(session.id) });
            }
          } catch (error) {
            console.error("activity_host_takeover_failed", msg.id, error);
          }
        }
        if (!session) {
          if (typeof msg.id === "string" && /^[0-9a-f-]{36}$/i.test(msg.id)) {
            const route = await sql`SELECT s.instance_id AS "instanceId", i.endpoint
              FROM virtual_world_activity_sessions s
              JOIN virtual_world_instances i ON i.id = s.instance_id
              WHERE s.id = ${msg.id}::uuid AND s.world_id = ${player.worldId}::uuid
                AND s.phase IN ('lobby', 'active')
                AND (s.phase = 'lobby' OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(s.state->'participants') participant
                  WHERE participant->>'userId' = ${player.id}
                    AND participant->>'status' = 'joined'
                ))
                AND i.status = 'ready'
                AND i.heartbeat_at > NOW() - INTERVAL '30 seconds' LIMIT 1`;
            if (route[0]) send(socket, { type: "activity_route_required",
              sessionId: msg.id, instanceId: route[0].instanceId, endpoint: route[0].endpoint });
            else send(socket, { type: "activity_rejected", code: "activity_not_found_or_unavailable" });
          } else send(socket, { type: "activity_rejected", code: "activity_not_found" });
          return;
        }
        const joined = joinActivity(session, player.id);
        if (!joined.ok) {
          send(socket, { type: "activity_rejected", code: joined.code }); return;
        }
        broadcastActivity(session);
        return;
      }
      if (msg && msg.type === "activity_start") {
        const session = findAccessibleActivity(msg.id, player);
        if (!session) {
          send(socket, { type: "activity_rejected", code: "activity_not_found" }); return;
        }
        const started = startActivity(session, activityHosts.get(session.id) === player.id);
        if (!started.ok) {
          send(socket, { type: "activity_rejected", code: started.code }); return;
        }
        broadcastActivity(session);
        return;
      }
      if (msg && msg.type === "activity_leave") {
        const session = findAccessibleActivity(msg.id, player);
        if (!session) {
          send(socket, { type: "activity_rejected", code: "activity_not_found" }); return;
        }
        const left = leaveActivity(session, player.id);
        if (!left.ok) {
          send(socket, { type: "activity_rejected", code: left.code }); return;
        }
        if (activityHosts.get(session.id) === player.id) {
          const replacementHost = selectNextActivityHost(session, player.id);
          if (replacementHost) {
            activityHosts.set(session.id, replacementHost);
            activityHostGenerations.set(session.id, (activityHostGenerations.get(session.id) ?? 1) + 1);
          }
          else if (session.phase !== "completed" && session.phase !== "cancelled") {
            const cancelled = cancelActivity(session, true, Date.now());
            if (!cancelled.ok) console.warn("activity_host_departure_cancel_failed", session.id, cancelled.code);
          }
        }
        broadcastActivity(session);
        return;
      }
      if (msg && msg.type === "activity_cancel") {
        const session = findAccessibleActivity(msg.id, player);
        if (!session) {
          send(socket, { type: "activity_rejected", code: "activity_not_found" }); return;
        }
        const cancelled = cancelActivity(session, activityHosts.get(session.id) === player.id);
        if (!cancelled.ok) {
          send(socket, { type: "activity_rejected", code: cancelled.code }); return;
        }
        broadcastActivity(session);
        return;
      }
      if (msg && msg.type === "home_enter") {
        if (typeof msg.id !== "string" || !/^[0-9a-f-]{36}$/i.test(msg.id) ||
            player.homeId || player.eventId || player.returnState) {
          send(socket, { type: "spatial_location_rejected", code: "invalid_home_request_or_context_active" }); return;
        }
        try {
          const rows = await sql`
            SELECT h.id, h.world_id AS "worldId", h.owner_user_id AS "ownerUserId",
              h.visibility, h.transform, w.status AS "worldStatus",
              w.visibility AS "worldVisibility", w.owner_user_id AS "worldOwnerId",
              COALESCE(wm.status, 'none') AS "membershipStatus",
              hm.permission,
              EXISTS (SELECT 1 FROM user_blocks b
                WHERE (b.blocker_id = h.owner_user_id AND b.blocked_id = ${player.id}::uuid)
                   OR (b.blocker_id = ${player.id}::uuid AND b.blocked_id = h.owner_user_id)) AS blocked
            FROM virtual_homes h
            JOIN virtual_worlds w ON w.id = h.world_id
            LEFT JOIN virtual_world_memberships wm
              ON wm.world_id = h.world_id AND wm.user_id = ${player.id}::uuid
            LEFT JOIN virtual_home_members hm
              ON hm.home_id = h.id AND hm.user_id = ${player.id}::uuid
            WHERE h.id = ${msg.id}::uuid AND h.world_id = ${player.worldId}::uuid
            LIMIT 1
          `;
          const home = rows[0];
          const allowed = !!home && home.worldStatus === "published" && !home.blocked &&
            home.membershipStatus !== "banned" && home.membershipStatus !== "suspended" &&
            (home.worldVisibility !== "private" || home.membershipStatus === "active" ||
              home.worldOwnerId === player.id) &&
            (home.ownerUserId === player.id ||
              (home.visibility === "invite" && !!home.permission));
          const anchor = allowed ? readSpatialTransform(home.transform) : null;
          if (!allowed || !anchor) {
            send(socket, { type: "spatial_location_rejected", code: "home_access_denied_or_invalid_anchor" }); return;
          }
          releasePlayerSeats(player.id);
          leaveVoiceRoom(player);
          player.returnState = { x: player.x, y: player.y, z: player.z, yaw: player.yaw };
          player.homeId = home.id;
          player.homeAnchor = anchor;
          player.eventId = null;
          player.x = anchor.x; player.y = anchor.y; player.z = anchor.z - 4.0; player.yaw = anchor.yaw;
          player.vx = 0; player.vy = 0; player.vz = 0;
          player.moveX = 0; player.moveZ = 0; player.sprint = false;
          player.grounded = true; player.seated = false; player.jumpQueued = false;
          send(socket, { type: "spatial_location_entered", contextType: "home",
            contextId: home.id, state: { x: player.x, y: player.y, z: player.z, yaw: player.yaw } });
        } catch (error) {
          console.error("home_entry_validation_failed", error);
          send(socket, { type: "spatial_location_rejected", code: "home_entry_unavailable" });
        }
        return;
      }
      if (msg && msg.type === "home_exit") {
        if (!player.homeId || !player.returnState) {
          send(socket, { type: "spatial_location_rejected", code: "not_inside_home" }); return;
        }
        const destination = player.returnState;
        leaveVoiceRoom(player);
        player.homeId = null; player.homeAnchor = null; player.returnState = null;
        player.x = destination.x; player.y = destination.y; player.z = destination.z; player.yaw = destination.yaw;
        player.vx = 0; player.vy = 0; player.vz = 0;
        player.moveX = 0; player.moveZ = 0; player.sprint = false;
        player.grounded = true; player.seated = false; player.jumpQueued = false;
        send(socket, { type: "spatial_location_exited",
          state: { x: player.x, y: player.y, z: player.z, yaw: player.yaw } });
        return;
      }
      if (msg && msg.type === "event_join") {
        if (typeof msg.id !== "string" || !/^[0-9a-f-]{36}$/i.test(msg.id) ||
            player.homeId || player.eventId || player.returnState) {
          send(socket, { type: "spatial_location_rejected", code: "invalid_event_request_or_context_active" }); return;
        }
        try {
          const rows = await sql`
            SELECT e.id, e.world_id AS "worldId", e.location, e.location_label AS "locationLabel",
              e.activity_type AS "activityType", e.starts_at AS "startsAt", e.ends_at AS "endsAt",
              e.status AS "eventStatus", w.status AS "worldStatus", w.visibility,
              w.owner_user_id AS "worldOwnerId",
              COALESCE(m.status, 'none') AS "membershipStatus",
              EXISTS (SELECT 1 FROM user_blocks b
                WHERE (b.blocker_id = w.owner_user_id AND b.blocked_id = ${player.id}::uuid)
                   OR (b.blocker_id = ${player.id}::uuid AND b.blocked_id = w.owner_user_id)) AS blocked,
              EXISTS (SELECT 1 FROM virtual_world_event_attendees a
                WHERE a.event_id = e.id AND a.user_id = ${player.id}::uuid
                  AND a.attendance_status = 'going') AS attending
            FROM virtual_world_events e
            JOIN virtual_worlds w ON w.id = e.world_id
            LEFT JOIN virtual_world_memberships m
              ON m.world_id = w.id AND m.user_id = ${player.id}::uuid
            WHERE e.id = ${msg.id}::uuid AND e.world_id = ${player.worldId}::uuid
            LIMIT 1
          `;
          const event = rows[0];
          const now = Date.now();
          const starts = event ? new Date(event.startsAt).getTime() : 0;
          const ends = event ? new Date(event.endsAt).getTime() : 0;
          const allowed = !!event && event.eventStatus === "scheduled" &&
            event.worldStatus === "published" && !event.blocked && event.attending &&
            event.membershipStatus !== "banned" && event.membershipStatus !== "suspended" &&
            (event.visibility !== "private" || event.membershipStatus === "active" ||
              event.worldOwnerId === player.id) &&
            ends > now && starts <= now + 30 * 60 * 1000;
          const destination = allowed ? readSpatialTransform(event.location) : null;
          if (!allowed || !destination) {
            send(socket, { type: "spatial_location_rejected", code: "event_join_denied_or_not_open" }); return;
          }
          releasePlayerSeats(player.id);
          leaveVoiceRoom(player);
          player.returnState = { x: player.x, y: player.y, z: player.z, yaw: player.yaw };
          player.eventId = event.id;
          player.homeId = null;
          player.homeAnchor = null;
          player.x = destination.x; player.y = destination.y; player.z = destination.z; player.yaw = destination.yaw;
          player.vx = 0; player.vy = 0; player.vz = 0;
          player.moveX = 0; player.moveZ = 0; player.sprint = false;
          player.grounded = true; player.seated = false; player.jumpQueued = false;
          send(socket, { type: "spatial_location_entered", contextType: "event",
            contextId: event.id, activityType: event.activityType,
            locationLabel: event.locationLabel,
            state: { x: player.x, y: player.y, z: player.z, yaw: player.yaw } });
        } catch (error) {
          console.error("event_join_validation_failed", error);
          send(socket, { type: "spatial_location_rejected", code: "event_join_unavailable" });
        }
        return;
      }
      if (msg && msg.type === "event_exit") {
        if (!player.eventId || !player.returnState) {
          send(socket, { type: "spatial_location_rejected", code: "not_inside_event" }); return;
        }
        const destination = player.returnState;
        leaveVoiceRoom(player);
        player.eventId = null; player.homeAnchor = null; player.returnState = null;
        player.x = destination.x; player.y = destination.y; player.z = destination.z; player.yaw = destination.yaw;
        player.vx = 0; player.vy = 0; player.vz = 0;
        player.moveX = 0; player.moveZ = 0; player.sprint = false;
        player.grounded = true; player.seated = false; player.jumpQueued = false;
        send(socket, { type: "spatial_location_exited",
          state: { x: player.x, y: player.y, z: player.z, yaw: player.yaw } });
        return;
      }
      if (msg && msg.type === "interact") {
        if (typeof msg.objectId !== "string" ||
            !/^[a-zA-Z0-9._:-]{1,80}$/.test(msg.objectId) ||
            !["toggle", "use", "sit", "stand"].includes(msg.action)) {
          fail(socket, "invalid_interaction"); return;
        }
        const target = INTERACTABLES.get(msg.objectId);
        if (!target) {
          send(socket, { type: "interaction_rejected", code: "unknown_or_invalid_object" }); return;
        }
        const playerDistrictId = findWorldDistrict(WORLD_DISTRICTS, player.x, player.z)?.id ?? "unassigned";
        if (player.homeId || player.eventId || playerDistrictId !== target.districtId) {
          send(socket, { type: "interaction_rejected", code: "object_in_different_district" }); return;
        }
        const distance = Math.hypot(player.x - target.x, player.y - target.y, player.z - target.z);
        const now = Date.now();
        if (!isInteractionAllowed(distance, now - player.lastInteractionAt)) {
          send(socket, { type: "interaction_rejected", code: "out_of_range_or_rate_limited" }); return;
        }
        const previousState = target.state;
        const previousActorId = target.actorId;
        const previousOccupantId = target.occupantId;
        const transition = resolveInteraction(target, player.id, msg.action);
        if (!transition.ok) {
          send(socket, { type: "interaction_rejected", code: transition.code }); return;
        }
        target.state = transition.state;
        target.occupantId = transition.occupantId;
        if (target.kind === "seat") {
          if (transition.seated) {
            // Seat markers are authored at the avatar's feet/root anchor.
            player.x = target.x; player.y = target.y; player.z = target.z;
            player.yaw = target.yaw;
            player.vx = 0; player.vy = 0; player.vz = 0;
            player.grounded = true; player.jumpQueued = false;
          }
          player.seated = transition.seated;
        }
        target.actorId = player.id;
        if (target.kind !== "seat") {
          try {
            const persisted = await persistDatabaseObjectState(player.worldId, player.id, target);
            if (!persisted) throw new Error("object_state_version_conflict");
          }
          catch (error) {
            target.state = previousState;
            target.actorId = previousActorId;
            target.occupantId = previousOccupantId;
            console.error("Could not persist world object state:", error);
            send(socket, { type: "interaction_rejected", code: "state_persistence_failed" });
            return;
          }
        }
        player.lastInteractionAt = now;
        const packet = {
          type: "object_state", objectId: target.id, objectState: target.state,
          actorId: player.id, occupantId: target.occupantId, version: target.version
        };
        for (const peer of players.values()) {
          const peerDistrictId = findWorldDistrict(WORLD_DISTRICTS, peer.x, peer.z)?.id ?? "unassigned";
          if (peer.worldId === player.worldId && !peer.homeId && !peer.eventId && peerDistrictId === target.districtId)
            send(peer.socket, packet);
        }
        return;
      }
      if (msg && msg.type === "voice_join") {
        const joinNow = Date.now();
        if (joinNow - player.lastVoiceSignalAt < 1000) return;
        player.lastVoiceSignalAt = joinNow;
        player.voiceActive = true;
        // The reconciliation loop announces only peers that are currently
        // nearby, in the same spatial context, and not blocked.
        return;
      }
      if (msg && msg.type === "voice_leave") {
        leaveVoiceRoom(player);
        return;
      }
      if (msg && msg.type === "voice_signal") {
        const targetId = typeof msg.targetUserId === "string" ? msg.targetUserId : "";
        const target = players.get(targetId);
        const payloadValid = isValidVoiceSignal(msg.signalType, msg.sdp, msg.candidate);
        if (!player.voiceActive || !target || !target.voiceActive || !payloadValid ||
            targetId === player.id || !sameSpatialVoiceRoom(player, target) || !isWithinVoiceRange(player, target)) {
          send(socket, { type: "voice_signal_rejected", code: "peer_unavailable_or_invalid_signal" }); return;
        }
        const signalNow = Date.now();
        if (signalNow - player.voiceSignalWindowAt >= 1000) {
          player.voiceSignalWindowAt = signalNow; player.voiceSignalCount = 0;
        }
        if (++player.voiceSignalCount > 30) {
          send(socket, { type: "voice_signal_rejected", code: "signal_rate_limited" }); return;
        }
        player.lastVoiceSignalAt = signalNow;
        try {
          if (await isBlockedPair(player.id, target.id)) {
            send(socket, { type: "voice_signal_rejected", code: "peer_blocked" }); return;
          }
          send(target.socket, { type: "voice_signal", fromUserId: player.id, signalType: msg.signalType,
            sdp: msg.signalType === "candidate" ? undefined : msg.sdp,
            candidate: msg.signalType === "candidate" ? msg.candidate : undefined,
            sdpMid: typeof msg.sdpMid === "string" ? msg.sdpMid.slice(0, 128) : null,
            sdpMLineIndex: Number.isInteger(msg.sdpMLineIndex) ? msg.sdpMLineIndex : null });
        } catch (error) {
          console.error("voice_signal_relay_failed", error);
          send(socket, { type: "voice_signal_rejected", code: "voice_signaling_unavailable" });
        }
        return;
      }
      if (msg && msg.type === "wardrobe_refresh") {
        const refreshNow = Date.now();
        if (refreshNow - player.lastWardrobeRefreshAt < 1000) return;
        player.lastWardrobeRefreshAt = refreshNow;
        try {
          const wardrobeRows = await sql`
            SELECT e.slot, e.item_id AS "itemId"
            FROM user_avatar_wardrobe_equipped e
            JOIN user_avatar_wardrobe_inventory i
              ON i.user_id = e.user_id AND i.item_id = e.item_id
            JOIN avatar_wardrobe_items c
              ON c.item_id = e.item_id AND c.slot = e.slot AND c.enabled = TRUE
            WHERE e.user_id = ${player.id}::uuid
            ORDER BY e.slot
          `;
          player.wardrobe = wardrobeRows.map(item => ({ slot: item.slot, itemId: item.itemId }));
        } catch (error) {
          console.error("wardrobe_snapshot_refresh_failed", error);
          send(socket, { type: "wardrobe_refresh_rejected", code: "wardrobe_unavailable" });
        }
        return;
      }
      if (!msg || msg.type !== "input" || !Number.isSafeInteger(msg.sequence) ||
          msg.sequence <= player.lastSequence || !finiteNumber(msg.moveX, -1, 1) ||
          !finiteNumber(msg.moveZ, -1, 1) || !finiteNumber(msg.yaw, -Math.PI * 4, Math.PI * 4) ||
          typeof msg.sprint !== "boolean" || typeof msg.jump !== "boolean" ||
          typeof msg.seated !== "boolean" || !["none", "wave", "cheer", "dance"].includes(msg.gesture) ||
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
      if (!current || current.socket !== socket || current.sessionId !== identity.sessionId) return;
      // Ignore a late close event from an older socket after this user has
      // already reconnected, but release seats if moderation removed this
      // socket from the live-player map before the close event arrived.
      if (current && current.socket !== socket) return;
      if (current?.voiceActive) leaveVoiceRoom(current);
      const destination = current.returnState ?? { x: current.x, y: current.y, z: current.z, yaw: current.yaw };
      current.stateVersion += 1;
      {
        void sql`
          INSERT INTO virtual_world_player_state
            (world_id, user_id, position, rotation, session_generation, state_version, updated_by_session, updated_at)
          SELECT ${current.worldId}::uuid, ${current.id}::uuid,
            ${JSON.stringify({ x: destination.x, y: destination.y, z: destination.z })}::jsonb,
            ${JSON.stringify({ x: 0, y: Math.sin(destination.yaw / 2), z: 0, w: Math.cos(destination.yaw / 2) })}::jsonb,
            ${current.sessionGeneration}, ${current.stateVersion}, ${current.sessionId}::uuid, NOW()
          WHERE EXISTS (SELECT 1 FROM virtual_world_player_sessions ps
            WHERE ps.world_id = ${current.worldId}::uuid AND ps.user_id = ${current.id}::uuid
              AND ps.session_id = ${current.sessionId}::uuid AND ps.generation = ${current.sessionGeneration})
          ON CONFLICT (world_id, user_id) DO UPDATE SET
            position = EXCLUDED.position, rotation = EXCLUDED.rotation,
            session_generation = EXCLUDED.session_generation, state_version = EXCLUDED.state_version,
            updated_by_session = EXCLUDED.updated_by_session, updated_at = NOW()
          WHERE virtual_world_player_state.session_generation < EXCLUDED.session_generation
             OR (virtual_world_player_state.session_generation = EXCLUDED.session_generation
                 AND virtual_world_player_state.state_version < EXCLUDED.state_version)
        `.catch(error => console.error("spatial_return_checkpoint_failed", error));
      }
      players.delete(identity.userId);
      for (const session of activitySessions.values()) {
        const participant = session.participants.get(identity.userId);
        if (!participant || participant.status === "left" || participant.status === "dnf" || participant.status === "finished") continue;
        const left = leaveActivity(session, identity.userId);
        if (left.ok) {
          if (activityHosts.get(session.id) === identity.userId) {
            const replacementHost = selectNextActivityHost(session, identity.userId);
            if (replacementHost) activityHosts.set(session.id, replacementHost);
            else {
              const cancelled = cancelActivity(session, true, Date.now());
              if (!cancelled.ok) console.warn("activity_host_departure_cancel_failed", session.id, cancelled.code);
            }
          }
          broadcastActivity(session);
        }
      }
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
    void (async () => {
      let failureCode = "";
      try { await authenticate(player.token); }
      catch { failureCode = "access_revoked"; }
      if (!failureCode) {
        try {
          const fence = await sql`
            SELECT 1 FROM virtual_world_player_sessions
            WHERE world_id = ${player.worldId}::uuid AND user_id = ${player.id}::uuid
              AND session_id = ${player.sessionId}::uuid AND generation = ${player.sessionGeneration}
            LIMIT 1
          `;
          if (!fence[0]) failureCode = "session_superseded";
        } catch { failureCode = "session_check_unavailable"; }
      }
      if (failureCode && players.get(player.id)?.socket === player.socket) {
        send(player.socket, { type: "error", code: failureCode });
        leaveVoiceRoom(player);
        releasePlayerSeats(player.id);
        players.delete(player.id);
        player.socket.close(4003, failureCode);
      }
      player.authorizationCheckInProgress = false;
    })();
  }
}, 5000);

// Keep short-lived transfer authorization rows bounded. Retain expired and
// consumed records for one day for operational diagnosis, then remove them.
let transferTicketCleanupInProgress = false;
setInterval(async () => {
  if (transferTicketCleanupInProgress) return;
  transferTicketCleanupInProgress = true;
  try {
    await sql`DELETE FROM virtual_world_activity_transfer_tickets
      WHERE expires_at < NOW() - INTERVAL '1 day'
         OR consumed_at < NOW() - INTERVAL '1 day'`;
  } catch (error) {
    console.error("activity_transfer_ticket_cleanup_failed", error);
  } finally {
    transferTicketCleanupInProgress = false;
  }
}, 60_000);

let voiceReconciliationInProgress = false;
setInterval(async () => {
  if (voiceReconciliationInProgress) return;
  voiceReconciliationInProgress = true;
  try {
    const desired = new Map<string, [Player, Player]>();
    const active = [...players.values()].filter(p => p.voiceActive && p.socket.readyState === WebSocket.OPEN);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        const key = voicePairKey(a.id, b.id);
        if (!sameSpatialVoiceRoom(a, b) ||
            !isWithinVoiceRangeWithHysteresis(a, b, voiceVisiblePairs.has(key))) continue;
        desired.set(key, [a, b]);
      }
    }
    for (const [key, [a, b]] of desired) {
      const alreadyVisible = voiceVisiblePairs.has(key);
      const lastBlockCheck = voiceBlockCheckAt.get(key) ?? 0;
      // New pairs are checked before announcement. Existing pairs are checked
      // every five seconds so a newly created block revokes voice presence
      // without querying PostgreSQL on every one-second position reconcile.
      if (alreadyVisible && Date.now() - lastBlockCheck < 5000) continue;
      try {
        const blocked = await isBlockedPair(a.id, b.id);
        voiceBlockCheckAt.set(key, Date.now());
        if (blocked) {
          if (voiceVisiblePairs.delete(key)) {
            send(a.socket, { type: "voice_presence", userId: b.id, active: false });
            send(b.socket, { type: "voice_presence", userId: a.id, active: false });
          }
          voiceBlockCheckAt.delete(key);
          void revokeVoicePairRoom(key);
          continue;
        }
        // Re-check after the database await; either peer may have left voice
        // or changed spatial context while the block query was in flight.
        if (!players.has(a.id) || !players.has(b.id) || !a.voiceActive || !b.voiceActive ||
            !sameSpatialVoiceRoom(a, b) ||
            !isWithinVoiceRangeWithHysteresis(a, b, alreadyVisible)) continue;
        if (!alreadyVisible) {
          voiceVisiblePairs.add(key);
          send(a.socket, { type: "voice_presence", userId: b.id, active: true });
          send(b.socket, { type: "voice_presence", userId: a.id, active: true });
        }
      } catch (error) {
        console.error("voice_presence_check_failed", error);
      }
    }
    for (const key of [...voiceVisiblePairs]) {
      if (desired.has(key)) continue;
      const [aId, bId] = key.split(":");
      const a = players.get(aId), b = players.get(bId);
      if (a && b) {
        send(a.socket, { type: "voice_presence", userId: bId, active: false });
        send(b.socket, { type: "voice_presence", userId: aId, active: false });
      } else if (a) send(a.socket, { type: "voice_presence", userId: bId, active: false });
      else if (b) send(b.socket, { type: "voice_presence", userId: aId, active: false });
      voiceVisiblePairs.delete(key);
      voiceBlockCheckAt.delete(key);
      void revokeVoicePairRoom(key);
    }
  } finally {
    voiceReconciliationInProgress = false;
  }
}, 1000);

let lastTick = Date.now();
setInterval(async () => {
  if (!processAuthority || Date.now() >= processLeaseUntil) {
    fenceProcess("simulation_tick_without_process_lease");
    return;
  }
  const now = Date.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;
  const snapshots: Array<{ userId: string; x: number; y: number; z: number; yaw: number; grounded: boolean; seated: boolean; sprint: boolean; gesture: string; gestureSequence: number; wardrobe: EquippedWardrobeItem[] }> = [];
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
    const proposedX = p.x + p.vx * dt;
    const proposedZ = p.z + p.vz * dt;
    const targetDistrict = p.homeId || p.eventId ? null : findWorldDistrict(WORLD_DISTRICTS, proposedX, proposedZ);
    const transitionPlan = planDistrictTransition(
      p.activeDistrictId, p.pendingDistrict, targetDistrict, now, randomUUID
    );
    if (transitionPlan.cancellation) {
      const cancelled = transitionPlan.cancellation.transition;
      send(p.socket, { type: "district_content_cancelled", districtId: cancelled.id,
        nonce: cancelled.nonce, reason: transitionPlan.cancellation.reason });
    }
    if (transitionPlan.exitedDistrictId) {
      send(p.socket, { type: "district_content_exited", districtId: transitionPlan.exitedDistrictId });
      p.activeDistrictId = null;
    }
    p.pendingDistrict = transitionPlan.pending;
    if (transitionPlan.request) {
      send(p.socket, { type: "district_content_required", districtId: targetDistrict!.id,
        districtName: targetDistrict!.name, contentLabel: targetDistrict!.contentLabel,
        nonce: transitionPlan.request.nonce });
    }
    if (targetDistrict && p.activeDistrictId !== targetDistrict.id) {
      // Preserve the latest input intent while holding position until the
      // matching content-ready acknowledgement has refreshed durable state.
      p.vx = 0; p.vz = 0;
      p.y += p.vy * dt;
      const pendingGroundY = p.homeAnchor ? p.homeAnchor.y : GROUND_Y;
      if (p.y <= pendingGroundY) { p.y = pendingGroundY; p.vy = 0; p.grounded = true; }
      snapshots.push({ userId: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, grounded: p.grounded,
        seated: p.seated, sprint: false, gesture: p.gesture, gestureSequence: p.gestureSequence, wardrobe: p.wardrobe });
      continue;
    }
    resolveHorizontalMovement(p, proposedX, proposedZ);
    p.y += p.vy * dt;
    const groundY = p.homeAnchor ? p.homeAnchor.y : GROUND_Y;
    if (p.homeAnchor && p.y > p.homeAnchor.y + 3.05) {
      p.y = p.homeAnchor.y + 3.05;
      p.vy = 0;
    }
    if (p.y <= groundY) { p.y = groundY; p.vy = 0; p.grounded = true; }
    snapshots.push({ userId: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, grounded: p.grounded,
      seated: p.seated, sprint: p.sprint, gesture: p.gesture, gestureSequence: p.gestureSequence, wardrobe: p.wardrobe });
    if (now - p.lastCheckpointAt >= 5000) {
      p.lastCheckpointAt = now;
      void sql`
        INSERT INTO virtual_world_player_state
          (world_id, user_id, position, rotation, session_generation, state_version, updated_by_session, updated_at)
        SELECT s.world_id, ${p.id}::uuid,
          ${JSON.stringify({ x: p.x, y: p.y, z: p.z })}::jsonb,
          ${JSON.stringify({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) })}::jsonb,
          ${p.sessionGeneration}, ${++p.stateVersion}, ${p.sessionId}::uuid, NOW()
        FROM virtual_world_instance_sessions s
        WHERE s.user_id = ${p.id}::uuid AND s.instance_id = ${INSTANCE_ID}::uuid
          AND s.lease_expires_at > NOW()
          AND EXISTS (SELECT 1 FROM virtual_world_player_sessions ps
            WHERE ps.world_id = s.world_id AND ps.user_id = s.user_id
              AND ps.session_id = ${p.sessionId}::uuid AND ps.generation = ${p.sessionGeneration})
        ON CONFLICT (world_id, user_id) DO UPDATE SET
          position = EXCLUDED.position, rotation = EXCLUDED.rotation,
          session_generation = EXCLUDED.session_generation, state_version = EXCLUDED.state_version,
          updated_by_session = EXCLUDED.updated_by_session, updated_at = NOW()
        WHERE virtual_world_player_state.session_generation < EXCLUDED.session_generation
           OR (virtual_world_player_state.session_generation = EXCLUDED.session_generation
               AND virtual_world_player_state.state_version < EXCLUDED.state_version)
      `.catch((error) => console.error("checkpoint_write_failed", error));
    }
  }
  // Bound in-memory session growth and close abandoned sessions without
  // trusting clients to remain connected or send a leave message.
  for (const session of activitySessions.values()) {
    const terminal = session.phase === "completed" || session.phase === "cancelled";
    if (terminal) {
      if (session.completedAt !== null && now - session.completedAt > ACTIVITY_TERMINAL_RETENTION_MS) {
        activitySessions.delete(session.id);
        activityHosts.delete(session.id);
        activityHostGenerations.delete(session.id);
        activityRaceIds.delete(session.id);
      }
      continue;
    }
    const staleLobby = session.phase === "lobby" && now - session.createdAt > ACTIVITY_LOBBY_TIMEOUT_MS;
    const overlongRun = session.phase === "active" && session.startedAt !== null &&
      now - session.startedAt > ACTIVITY_MAX_RUNTIME_MS;
    if (staleLobby || overlongRun) {
      const cancelled = cancelActivity(session, true, now);
      if (cancelled.ok) broadcastActivity(session);
    }
  }
  // Race progress is derived exclusively from server-simulated player positions.
  // Clients cannot submit checkpoint indexes or claim their own finish times.
  for (const session of activitySessions.values()) {
    if (session.phase !== "active" || session.kind !== "checkpoint_race") continue;
    const raceId = activityRaceIds.get(session.id);
    const race = raceId ? ACTIVITY_RACES.get(raceId) : undefined;
    if (!race) continue;
    let changed = false;
    for (const participant of session.participants.values()) {
      if (participant.status !== "joined") continue;
      const player = players.get(participant.userId);
      const checkpoint = race.checkpoints[participant.checkpointIndex];
      if (!player || player.worldId !== session.worldId || !checkpoint) continue;
      const horizontalDistance = Math.hypot(player.x - checkpoint.x, player.z - checkpoint.z);
      const verticalDistance = Math.abs(player.y - checkpoint.y);
      if (horizontalDistance > checkpoint.radius || verticalDistance > checkpoint.radius) continue;
      const result = recordCheckpoint(session, participant.userId, participant.checkpointIndex, now);
      if (result.ok) changed = true;
    }
    if (changed) broadcastActivity(session);
  }
  if (snapshots.length) {
    for (const p of players.values()) {
      if (p.socket.readyState !== WebSocket.OPEN) continue;
      const visiblePlayers = snapshots.filter(snapshot => players.get(snapshot.userId)?.worldId === p.worldId);
      if (visiblePlayers.length) p.socket.send(JSON.stringify({ type: 'snapshot', serverTime: now, players: visiblePlayers }));
    }
    if (shouldPublishWorldSnapshot(lastWorldSnapshotRelayAt, now)) {
      lastWorldSnapshotRelayAt = now;
      const byWorld = new Map<string, typeof snapshots>();
      for (const snapshot of snapshots) {
        const owner = players.get(snapshot.userId);
        if (!owner) continue;
        const batch = byWorld.get(owner.worldId) ?? [];
        batch.push(snapshot);
        byWorld.set(owner.worldId, batch);
      }
      for (const [worldId, worldPlayers] of byWorld) {
        void sql`INSERT INTO virtual_world_realtime_events (world_id, instance_id, event_type, payload)
          VALUES (${worldId}::uuid, ${INSTANCE_ID}::uuid, 'player_snapshot',
            ${JSON.stringify({ serverTime: now, players: worldPlayers })}::jsonb)`
          .catch(error => console.error('world_snapshot_relay_publish_failed', error));
      }
    }
  }
}, TICK_MS);

let worldRelayPollInProgress = false;
setInterval(async () => {
  if (!processAuthority || Date.now() >= processLeaseUntil) {
    fenceProcess("relay_poll_without_process_lease");
    return;
  }
  if (!worldRelayCursorReady || worldRelayPollInProgress) return;
  worldRelayPollInProgress = true;
  try {
    const rows = await sql`SELECT id, world_id AS "worldId", instance_id AS "instanceId", event_type AS "eventType", payload
      FROM virtual_world_realtime_events WHERE id > ${worldRelayCursor} ORDER BY id ASC LIMIT ${WORLD_RELAY_BATCH_SIZE}`;
    for (const row of rows) {
      const eventId = Number(row.id);
      if (!Number.isSafeInteger(eventId) || eventId <= worldRelayCursor) continue;
      try {
        if (!(row.instanceId === INSTANCE_ID && row.eventType === 'player_snapshot')) {
          if (row.eventType === 'player_snapshot') {
            const payload = row.payload as { serverTime?: number; players?: unknown };
            if (payload && Array.isArray(payload.players) && Number.isFinite(payload.serverTime)) {
              // A process whose instance lease/heartbeat has expired is no longer
              // authoritative, even if it managed to append a delayed snapshot row.
              const sourceAuthority = await sql`SELECT 1 FROM virtual_world_instances
                WHERE id = ${row.instanceId}::uuid
                  AND status IN ('ready', 'draining')
                  AND heartbeat_at > NOW() - INTERVAL '30 seconds'
                LIMIT 1`;
              if (sourceAuthority[0]) {
                const packet = JSON.stringify({ type: 'snapshot', serverTime: payload.serverTime, players: payload.players });
                for (const peer of players.values()) {
                  if (peer.worldId === row.worldId && peer.socket.readyState === WebSocket.OPEN) peer.socket.send(packet);
                }
              }
            }
          } else if (row.eventType === 'activity_state') {
            const payload = row.payload as { type?: string; session?: { id?: string; worldId?: string; instanceId?: string; hostGeneration?: number } };
            const session = payload?.session;
            if (payload?.type === 'activity_state' && session &&
                session.worldId === row.worldId && session.instanceId === row.instanceId &&
                typeof session.id === 'string' && Number.isSafeInteger(session.hostGeneration) &&
                (session.hostGeneration ?? 0) >= 1) {
              const sessionId = session.id;
              const hostGeneration = session.hostGeneration as number;
              await sql.begin(async tx => {
                // Hold the activity row lock through fan-out. A takeover must either
                // commit before this check (and suppress the stale event) or wait
                // until this already-authorized broadcast has completed.
                const authority = await tx`SELECT 1 FROM virtual_world_activity_sessions
                  WHERE id = ${sessionId}::uuid AND world_id = ${row.worldId}::uuid
                    AND instance_id = ${row.instanceId}::uuid
                    AND host_generation = ${hostGeneration}
                  FOR UPDATE`;
                if (!authority[0]) return;
                const packet = JSON.stringify(payload);
                for (const peer of players.values()) {
                  if (peer.worldId === row.worldId && peer.socket.readyState === WebSocket.OPEN) peer.socket.send(packet);
                }
              });
            }
          }
        }
        // Advance only after this event was safely handled (or deliberately ignored).
        // A transient database failure must leave the cursor before this row so the
        // next poll retries it instead of silently dropping the relay event.
        await persistWorldRelayCursor(eventId);
      } catch (error) {
        console.error('world_relay_event_processing_failed', eventId, error);
        break;
      }
    }
  } catch (error) { console.error('world_snapshot_relay_poll_failed', error); }
  finally { worldRelayPollInProgress = false; }
}, WORLD_RELAY_POLL_INTERVAL_MS);

const heartbeat = async () => {
  if (!processAuthority) return;
  try {
    const rows = await sql`SELECT renew_world_instance_process(
      ${INSTANCE_ID}::uuid, ${PROCESS_ID}::uuid, ${processGeneration}, ${players.size}, 12
    ) AS renewed`;
    if (rows[0]?.renewed !== true) {
      fenceProcess("process_generation_replaced");
      return;
    }
    processLeaseUntil = Date.now() + PROCESS_LEASE_MS;
  } catch (error) {
    console.error("instance_heartbeat_failed", error);
    if (Date.now() >= processLeaseUntil) fenceProcess("process_lease_expired_during_database_outage");
  }
};
setInterval(heartbeat, 3000);

let objectRefreshInProgress = false;
setInterval(async () => {
  if (!processAuthority || Date.now() >= processLeaseUntil) {
    fenceProcess("object_refresh_without_process_lease");
    return;
  }
  if (objectRefreshInProgress) return;
  objectRefreshInProgress = true;
  try {
    const worldIds = new Set([...players.values()].map(player => player.worldId));
    for (const worldId of worldIds) {
      await ensureObjectStatesLoaded(worldId);
      const rows = await sql`
        SELECT district_id AS "districtId", object_id AS "objectId",
          object_kind AS "objectKind", object_state AS "objectState", version,
          updated_by AS "updatedBy"
        FROM virtual_world_object_states WHERE world_id = ${worldId}::uuid
      `;
      for (const row of rows) {
        const target = INTERACTABLES.get(row.objectId);
        if (!target || target.kind === "seat" || target.districtId !== row.districtId ||
            target.kind !== row.objectKind || !isPersistentObjectState(target.kind, row.objectState) ||
            Number(row.version) <= target.version) continue;
        target.state = row.objectState;
        target.version = Number(row.version);
        const packet = { type: "object_state", objectId: target.id, objectState: target.state,
          actorId: row.updatedBy, occupantId: null, version: target.version };
        for (const peer of players.values()) {
          const peerDistrictId = findWorldDistrict(WORLD_DISTRICTS, peer.x, peer.z)?.id ?? "unassigned";
          if (peer.worldId === worldId && !peer.homeId && !peer.eventId && peerDistrictId === target.districtId)
            send(peer.socket, packet);
        }
      }
    }
  } catch (error) { console.error("district_object_state_refresh_failed", error); }
  finally { objectRefreshInProgress = false; }
}, 2500);

void acquireProcessOwnership()
  .then(async () => {
    await heartbeat();
    assertProcessAuthority();
  })
  .then(() => restorePersistedActivities())
  .then(() => server.listen(PORT, () => console.log("UCENO world gateway listening on " + PORT + " for instance " + INSTANCE_ID + "; process " + PROCESS_ID + "; generation " + processGeneration + "; restored " + activitySessions.size + " activities")))
  .catch(async error => {
    console.error("gateway_process_ownership_or_restore_failed", error);
    processAuthority = false;
    process.exitCode = 1;
    await sql.end({ timeout: 2 });
    process.exit(1);
  });
process.on("SIGTERM", async () => {
  processAuthority = false;
  for (const p of players.values()) p.socket.close(1001, "server_shutdown");
  try {
    await sql`UPDATE virtual_world_instances SET owner_process_id = NULL,
      owner_lease_expires_at = NULL, heartbeat_at = NOW(), current_players = 0
      WHERE id = ${INSTANCE_ID}::uuid AND owner_process_id = ${PROCESS_ID}::uuid
        AND owner_generation = ${processGeneration}`;
  } catch (error) { console.error("instance_process_release_failed", error); }
  await sql.end({ timeout: 5 });
  server.close();
});
