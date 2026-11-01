import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readWorldClientSession } from "@/lib/world-client-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ worldId: string }> };
type Vector3 = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };

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
async function canAccessWorld(worldId: string, userId: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT w.status, w.visibility, w.owner_user_id AS "ownerUserId",
      COALESCE(m.status, 'none') AS "membershipStatus",
      EXISTS (SELECT 1 FROM user_blocks b
        WHERE (b.blocker_id = ${userId}::uuid AND b.blocked_id = w.owner_user_id)
           OR (b.blocker_id = w.owner_user_id AND b.blocked_id = ${userId}::uuid)) AS blocked
    FROM virtual_worlds w
    LEFT JOIN virtual_world_memberships m
      ON m.world_id = w.id AND m.user_id = ${userId}::uuid
    WHERE w.id = ${worldId}::uuid LIMIT 1
  `;
  const world = rows[0];
  return !!world && world.status === "published" && !world.blocked &&
    world.membershipStatus !== "banned" && world.membershipStatus !== "suspended" &&
    (world.visibility !== "private" || world.membershipStatus === "active" || world.ownerUserId === userId);
}

// GET returns fresh peers only. This is polling presence, not authoritative movement replication.
export async function GET(_request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(_request, worldId);
  if (!session) return NextResponse.json({ error: "Sign in or reconnect to this world" }, { status: 401 });
  if (!validUuid(worldId)) return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });
  try {
    if (!await canAccessWorld(worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const sql = getDb();
    const peers = await sql`
      SELECT user_id AS "userId", position, rotation, last_seen AS "lastSeen"
      FROM virtual_world_presence
      WHERE world_id = ${worldId}::uuid AND user_id <> ${session.id}::uuid
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

// POST refreshes the signed-in user's ephemeral presence. Clients should send at most once per second.
export async function POST(request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) return NextResponse.json({ error: "Sign in or reconnect to this world" }, { status: 401 });
  if (!validUuid(worldId)) return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!isRecord(body) || !validVector(body.position) ||
      (body.rotation !== undefined && !validRotation(body.rotation)))
    return NextResponse.json({ error: "Invalid presence position or rotation" }, { status: 400 });
  try {
    if (!await canAccessWorld(worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const sql = getDb();
    const rows = await sql`
      INSERT INTO virtual_world_presence (world_id, user_id, position, rotation, last_seen)
      VALUES (${worldId}::uuid, ${session.id}::uuid,
        ${JSON.stringify(body.position)}::jsonb,
        ${JSON.stringify(body.rotation ?? { x: 0, y: 0, z: 0, w: 1 })}::jsonb, NOW())
      ON CONFLICT (world_id, user_id) DO UPDATE SET
        position = EXCLUDED.position, rotation = EXCLUDED.rotation, last_seen = NOW()
      WHERE virtual_world_presence.last_seen <= NOW() - INTERVAL '1 second'
      RETURNING last_seen AS "lastSeen"
    `;
    if (!rows[0]) return NextResponse.json({ error: "Presence updates are limited to once per second" }, {
      status: 429, headers: { "Retry-After": "1", "Cache-Control": "no-store, private" }
    });
    return NextResponse.json({ present: true, lastSeen: rows[0].lastSeen }, {
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
    return NextResponse.json({ removed: true }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World presence removal failed", error);
    return NextResponse.json({ error: "Presence could not be removed" }, { status: 503 });
  }
}
