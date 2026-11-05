import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readWorldClientSession } from "@/lib/world-client-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ worldId: string }> };
type Vector3 = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };
type AnimationState = {
  locomotion: "idle" | "walk" | "run";
  seated: boolean;
  gesture: "none" | "wave" | "cheer";
  gestureSequence: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validVector(value: unknown): value is Vector3 {
  return isRecord(value) && ["x", "y", "z"].every((key) =>
    typeof value[key] === "number" && Number.isFinite(value[key]) &&
    Math.abs(value[key] as number) <= 100000);
}
function validRotation(value: unknown): value is Quaternion {
  if (!isRecord(value) || !["x", "y", "z", "w"].every((key) =>
    typeof value[key] === "number" && Number.isFinite(value[key]) &&
    Math.abs(value[key] as number) <= 1.01)) return false;
  const n = Math.hypot(value.x as number, value.y as number, value.z as number, value.w as number);
  return n > 0.9 && n < 1.1;
}
function validAnimationState(value: unknown): value is AnimationState {
  return isRecord(value) &&
    ["idle", "walk", "run"].includes(String(value.locomotion)) &&
    typeof value.seated === "boolean" &&
    ["none", "wave", "cheer"].includes(String(value.gesture)) &&
    Number.isSafeInteger(value.gestureSequence) &&
    (value.gestureSequence as number) >= 0;
}
async function canAccessWorld(worldId: string, userId: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT w.status, w.visibility, w.owner_user_id AS "ownerUserId",
      COALESCE(m.status, 'none') AS "membershipStatus",
      u.moderation_status AS "moderationStatus",
      u.suspended_until AS "suspendedUntil",
      EXISTS (SELECT 1 FROM user_blocks b
        WHERE (b.blocker_id = ${userId}::uuid AND b.blocked_id = w.owner_user_id)
           OR (b.blocker_id = w.owner_user_id AND b.blocked_id = ${userId}::uuid)) AS blocked
    FROM virtual_worlds w
    JOIN users u ON u.id = ${userId}::uuid
    LEFT JOIN virtual_world_memberships m
      ON m.world_id = w.id AND m.user_id = u.id
    WHERE w.id = ${worldId}::uuid LIMIT 1
  `;
  const world = rows[0];
  const moderationAllowed = !!world && world.moderationStatus !== "disabled" &&
    !(world.moderationStatus === "suspended" &&
      (!world.suspendedUntil || new Date(world.suspendedUntil).getTime() > Date.now()));
  return !!world && moderationAllowed && world.status === "published" && !world.blocked &&
    world.membershipStatus !== "banned" && world.membershipStatus !== "suspended" &&
    (world.visibility !== "private" || world.membershipStatus === "active" || world.ownerUserId === userId);
}

async function hasHealthyInstanceLease(worldId: string, userId: string, instanceId: string | null) {
  if (!instanceId) return true;
  const sql = getDb();
  const rows = await sql`
    SELECT EXISTS (
      SELECT 1 FROM virtual_world_instance_sessions s
      JOIN virtual_world_instances i ON i.id = s.instance_id
      WHERE s.world_id = ${worldId}::uuid AND s.user_id = ${userId}::uuid
        AND s.instance_id = ${instanceId}::uuid
        AND s.lease_expires_at > NOW()
        AND i.status = 'ready' AND i.endpoint IS NOT NULL
        AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
    ) AS healthy
  `;
  return rows[0]?.healthy === true;
}

// GET returns fresh peers only. This is polling presence, not authoritative movement replication.
export async function GET(request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) return NextResponse.json({ error: "Sign in or reconnect to this world" }, { status: 401 });
  if (!validUuid(worldId)) return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });
  try {
    if (!await canAccessWorld(worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    if (!await hasHealthyInstanceLease(worldId, session.id, session.instanceId))
      return NextResponse.json({ error: "The assigned world instance is unavailable; reconnect to the world" }, { status: 503 });
    const sql = getDb();
    const peers = await sql`
      SELECT user_id AS "userId", position, rotation,
        animation_state AS "animationState", client_sequence AS "sequence",
        last_seen AS "lastSeen"
      FROM virtual_world_presence
      WHERE world_id = ${worldId}::uuid AND user_id <> ${session.id}::uuid
        AND (${session.instanceId}::uuid IS NULL OR instance_id = ${session.instanceId}::uuid)
        AND last_seen > NOW() - INTERVAL '30 seconds'
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ${session.id}::uuid AND b.blocked_id = virtual_world_presence.user_id)
             OR (b.blocker_id = virtual_world_presence.user_id AND b.blocked_id = ${session.id}::uuid)
        )
      ORDER BY last_seen DESC LIMIT 64
    `;
    return NextResponse.json({ peers, serverTime: new Date().toISOString() }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World presence read failed", error);
    return NextResponse.json({ error: "World presence is unavailable" }, { status: 503 });
  }
}

// POST validates plausible displacement against server elapsed time, then stores ephemeral transform and animation metadata.
 // This is a server-side speed/teleport sanity check, not authoritative physics or collision simulation.
export async function POST(request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) return NextResponse.json({ error: "Sign in or reconnect to this world" }, { status: 401 });
  if (!validUuid(worldId)) return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!isRecord(body) || !validVector(body.position) ||
      (body.rotation !== undefined && !validRotation(body.rotation)) ||
      (body.animationState !== undefined && !validAnimationState(body.animationState)) ||
      (body.sequence !== undefined && (!Number.isSafeInteger(body.sequence) || (body.sequence as number) < 1)))
    return NextResponse.json({ error: "Invalid presence transform, sequence or animation state" }, { status: 400 });
  try {
    if (!await canAccessWorld(worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    if (!await hasHealthyInstanceLease(worldId, session.id, session.instanceId))
      return NextResponse.json({ error: "The assigned world instance is unavailable; reconnect to the world" }, { status: 503 });
    const sql = getDb();
    // Extend only a lease that is still valid and attached to the same
    // healthy instance. Presence heartbeats keep long-running sessions alive.
    if (session.instanceId) {
      const renewed = await sql`
        UPDATE virtual_world_instance_sessions
        SET lease_expires_at = NOW() + INTERVAL '45 seconds', updated_at = NOW()
        WHERE world_id = ${worldId}::uuid AND user_id = ${session.id}::uuid
          AND instance_id = ${session.instanceId}::uuid
          AND lease_expires_at > NOW()
        RETURNING instance_id
      `;
      if (!renewed[0])
        return NextResponse.json({ error: "The assigned world lease expired; reconnect to the world" }, { status: 503 });
    }
    const animationState = body.animationState ?? {
      locomotion: "idle", seated: false, gesture: "none", gestureSequence: 0
    };
    const sequence = body.sequence ?? null;
    const rows = await sql`
      INSERT INTO virtual_world_presence
        (world_id, user_id, instance_id, position, rotation, animation_state, client_sequence, last_seen)
      VALUES (${worldId}::uuid, ${session.id}::uuid, ${session.instanceId}::uuid,
        ${JSON.stringify(body.position)}::jsonb,
        ${JSON.stringify(body.rotation ?? { x: 0, y: 0, z: 0, w: 1 })}::jsonb,
        ${JSON.stringify(animationState)}::jsonb, COALESCE(${sequence}::bigint, 1), NOW())
      ON CONFLICT (world_id, user_id) DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        position = EXCLUDED.position, rotation = EXCLUDED.rotation,
        animation_state = EXCLUDED.animation_state,
        client_sequence = virtual_world_presence.client_sequence + 1,
        last_seen = NOW()
      WHERE virtual_world_presence.last_seen <= NOW() - INTERVAL '1 second'
        AND sqrt(
          power((EXCLUDED.position->>'x')::double precision - (virtual_world_presence.position->>'x')::double precision, 2) +
          power((EXCLUDED.position->>'y')::double precision - (virtual_world_presence.position->>'y')::double precision, 2) +
          power((EXCLUDED.position->>'z')::double precision - (virtual_world_presence.position->>'z')::double precision, 2)
        ) <= GREATEST(3.0, 12.0 * EXTRACT(EPOCH FROM (NOW() - virtual_world_presence.last_seen)) + 1.0)
      RETURNING last_seen AS "lastSeen", client_sequence AS "sequence"
    `;
    if (!rows[0]) return NextResponse.json({ error: "Presence update was rate-limited or movement exceeded the allowed server-observed speed" }, {
      status: 429, headers: { "Retry-After": "1", "Cache-Control": "no-store, private" }
    });
    return NextResponse.json({ present: true, lastSeen: rows[0].lastSeen, sequence: rows[0].sequence }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World presence update failed", error);
    return NextResponse.json({ error: "Presence could not be updated" }, { status: 503 });
  }
}

// DELETE removes this user's presence when they leave a world.
export async function DELETE(_request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(_request, worldId);
  if (!session) return NextResponse.json({ error: "Sign in or reconnect to this world" }, { status: 401 });
  if (!validUuid(worldId)) return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });
  try {
    const sql = getDb();
    await sql`
      DELETE FROM virtual_world_presence
      WHERE world_id = ${worldId}::uuid AND user_id = ${session.id}::uuid
    `;
    if (session.instanceId) {
      await sql`
        DELETE FROM virtual_world_instance_sessions
        WHERE world_id = ${worldId}::uuid
          AND user_id = ${session.id}::uuid
          AND instance_id = ${session.instanceId}::uuid
      `;
    }
    return NextResponse.json({ removed: true }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World presence removal failed", error);
    return NextResponse.json({ error: "Presence could not be removed" }, { status: 503 });
  }
}
