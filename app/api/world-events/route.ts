import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

type Body = {
  worldId?: unknown;
  title?: unknown;
  description?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  capacity?: unknown;
  activityType?: unknown;
  locationLabel?: unknown;
  location?: unknown;
};

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const ACTIVITY_TYPES = new Set([
  "social", "dance", "sports", "racing", "adventure",
  "concert", "education", "cinema", "workshop", "community"
]);

function validSpatialLocation(value: unknown): value is { x: number; y: number; z: number; yaw: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const location = value as Record<string, unknown>;
  return typeof location.x === "number" && Number.isFinite(location.x) && Math.abs(location.x) <= 5000 &&
    typeof location.y === "number" && Number.isFinite(location.y) && location.y >= 1.15 && location.y <= 5000 &&
    typeof location.z === "number" && Number.isFinite(location.z) && Math.abs(location.z) <= 5000 &&
    typeof location.yaw === "number" && Number.isFinite(location.yaw) && location.yaw >= -360 && location.yaw <= 360;
}

async function canAccessWorld(worldId: string, userId: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT w.status, w.visibility, w.owner_user_id AS "ownerUserId",
           COALESCE(m.status, 'none') AS "membershipStatus",
           EXISTS (
             SELECT 1 FROM user_blocks b
             WHERE (b.blocker_id = ${userId}::uuid AND b.blocked_id = w.owner_user_id)
                OR (b.blocker_id = w.owner_user_id AND b.blocked_id = ${userId}::uuid)
           ) AS blocked
    FROM virtual_worlds w
    LEFT JOIN virtual_world_memberships m ON m.world_id = w.id AND m.user_id = ${userId}::uuid
    WHERE w.id = ${worldId}::uuid LIMIT 1
  `;
  const world = rows[0];
  if (!world || world.status !== "published" || world.blocked ||
      world.membershipStatus === "banned" || world.membershipStatus === "suspended") return false;
  return world.visibility !== "private" ||
    world.membershipStatus === "active" || world.ownerUserId === userId;
}

// GET /api/world-events?worldId=<uuid>
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const worldId = request.nextUrl.searchParams.get("worldId") ?? "";
  if (!validUuid(worldId)) return NextResponse.json({ error: "Invalid worldId" }, { status: 400 });
  try {
    if (!await canAccessWorld(worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const sql = getDb();
    const events = await sql`
      SELECT e.id, e.title, e.description, e.starts_at AS "startsAt",
             e.ends_at AS "endsAt", e.capacity, e.status,
             e.activity_type AS "activityType", e.location_label AS "locationLabel",
             e.location, e.host_user_id AS "hostUserId",
             (SELECT COUNT(*)::int FROM virtual_world_event_attendees a
               WHERE a.event_id = e.id AND a.attendance_status = 'going') AS "goingCount",
             (SELECT a.attendance_status FROM virtual_world_event_attendees a
               WHERE a.event_id = e.id AND a.user_id = ${session.id}::uuid LIMIT 1) AS "myAttendance"
      FROM virtual_world_events e
      WHERE e.world_id = ${worldId}::uuid
        AND e.status = 'scheduled' AND e.ends_at > NOW()
      ORDER BY e.starts_at ASC LIMIT 100
    `;
    const hostAccess = await sql`
      SELECT w.owner_user_id AS "ownerUserId",
             COALESCE(m.role, 'member') AS "membershipRole",
             COALESCE(m.status, 'none') AS "membershipStatus"
      FROM virtual_worlds w
      LEFT JOIN virtual_world_memberships m
        ON m.world_id = w.id AND m.user_id = ${session.id}::uuid
      WHERE w.id = ${worldId}::uuid LIMIT 1
    `;
    const host = hostAccess[0];
    const canHost = !!host && (host.ownerUserId === session.id ||
      (host.membershipStatus === "active" && host.membershipRole === "admin"));
    return NextResponse.json({ events, canHost }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("World event list failed", error);
    return NextResponse.json({ error: "Events are unavailable" }, { status: 503 });
  }
}

// POST /api/world-events — only a world owner or active world admin may host.
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (typeof body.worldId !== "string" || !validUuid(body.worldId) ||
      typeof body.title !== "string" || body.title.trim().length < 3 || body.title.trim().length > 140 ||
      (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 4000)) ||
      typeof body.startsAt !== "string" || typeof body.endsAt !== "string") {
    return NextResponse.json({ error: "Invalid event fields" }, { status: 400 });
  }
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  const now = Date.now();
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) ||
      startsAt.getTime() < now + 60_000 || endsAt.getTime() <= startsAt.getTime() ||
      endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Event must start at least one minute ahead and last no more than 24 hours" }, { status: 400 });
  }
  const capacity = body.capacity === undefined || body.capacity === null ? null : body.capacity;
  if (capacity !== null && (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 || capacity > 5000))
    return NextResponse.json({ error: "Capacity must be between 1 and 5000" }, { status: 400 });
  const activityType = body.activityType === undefined ? "social" : body.activityType;
  const locationLabel = body.locationLabel === undefined ? "Main Plaza" : body.locationLabel;
  const location = body.location === undefined
    ? { x: 0, y: 1.15, z: 0, yaw: 0 } : body.location;
  if (typeof activityType !== "string" || !ACTIVITY_TYPES.has(activityType) ||
      typeof locationLabel !== "string" || locationLabel.trim().length < 2 ||
      locationLabel.trim().length > 120 || !validSpatialLocation(location)) {
    return NextResponse.json({ error: "Provide a valid activity type, location label and bounded world location" }, { status: 400 });
  }

  try {
    if (!await canAccessWorld(body.worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const sql = getDb();
    const access = await sql`
      SELECT w.status, w.owner_user_id AS "ownerUserId",
             COALESCE(m.status, 'none') AS "membershipStatus",
             COALESCE(m.role, 'member') AS "membershipRole"
      FROM virtual_worlds w
      LEFT JOIN virtual_world_memberships m ON m.world_id = w.id AND m.user_id = ${session.id}::uuid
      WHERE w.id = ${body.worldId}::uuid LIMIT 1
    `;
    const world = access[0];
    if (!world || world.status !== "published")
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    if (world.ownerUserId !== session.id &&
        !(world.membershipStatus === "active" && world.membershipRole === "admin"))
      return NextResponse.json({ error: "Only the world owner or an active world admin can host events" }, { status: 403 });
    const inserted = await sql`
      INSERT INTO virtual_world_events
        (world_id, host_user_id, title, description, starts_at, ends_at, capacity,
         activity_type, location_label, location)
      VALUES (${body.worldId}::uuid, ${session.id}::uuid, ${body.title.trim()},
        ${typeof body.description === "string" ? body.description.trim() : ""},
        ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
        ${capacity}, ${activityType}, ${locationLabel.trim()}, ${JSON.stringify(location)}::jsonb)
      RETURNING id, title, description, starts_at AS "startsAt",
                ends_at AS "endsAt", capacity, status, activity_type AS "activityType",
                location_label AS "locationLabel", location
    `;
    return NextResponse.json({ event: inserted[0] }, { status: 201, headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("World event creation failed", error);
    return NextResponse.json({ error: "Event could not be created" }, { status: 503 });
  }
}
