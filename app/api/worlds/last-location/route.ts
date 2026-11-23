import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CITY_IDS = new Set(["meridian","solstice","verdant","nexus","aurora","saffron","monsoon","eclipse","origin","atlas"]);
type SavedLocation = {
  worldId?: unknown; districtId?: unknown; locationKind?: unknown;
  targetId?: unknown; activityProgress?: unknown;
};
function validVector(v: unknown, quaternion = false) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const x = v as Record<string, unknown>;
  const keys = quaternion ? ["x","y","z","w"] : ["x","y","z"];
  return keys.every(k => typeof x[k] === "number" && Number.isFinite(x[k]) &&
    Math.abs(x[k] as number) <= 5000);
}
function bounded(value: unknown, maxBytes: number) {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= maxBytes; }
  catch { return false; }
}
async function accessibleWorld(worldId: string, userId: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT w.city_id AS "cityId", w.status, w.visibility, w.owner_user_id AS "ownerUserId",
      COALESCE(m.status, 'none') AS "membershipStatus",
      EXISTS (SELECT 1 FROM user_blocks b
        WHERE (b.blocker_id = ${userId}::uuid AND b.blocked_id = w.owner_user_id)
           OR (b.blocker_id = w.owner_user_id AND b.blocked_id = ${userId}::uuid)) AS blocked
    FROM virtual_worlds w
    LEFT JOIN virtual_world_memberships m ON m.world_id = w.id AND m.user_id = ${userId}::uuid
    WHERE w.id = ${worldId}::uuid LIMIT 1
  `;
  const w = rows[0];
  if (!w || w.status !== "published" || w.blocked ||
      ["banned","suspended"].includes(w.membershipStatus) ||
      (w.visibility === "private" && w.membershipStatus !== "active" && w.ownerUserId !== userId)) return null;
  return w;
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT l.world_id AS "worldId", l.city_id AS "cityId", l.district_id AS "districtId",
             l.location_kind AS "locationKind", l.target_id AS "targetId",
             l.position, l.rotation, l.activity_progress AS "activityProgress",
             l.saved_at AS "savedAt"
      FROM virtual_world_last_locations l WHERE l.user_id = ${session.id}::uuid LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ location: null, canContinue: false });
    const location = rows[0];
    const world = await accessibleWorld(location.worldId, session.id);
    if (!world || world.cityId !== location.cityId)
      return NextResponse.json({ location: null, canContinue: false, fallback: "gateway" });
    if (location.locationKind === "home" && location.targetId) {
      const home = await sql`SELECT id FROM virtual_homes h
        LEFT JOIN virtual_home_members hm ON hm.home_id = h.id AND hm.user_id = ${session.id}::uuid
        WHERE h.id = ${location.targetId}::uuid
          AND (h.owner_user_id = ${session.id}::uuid OR hm.user_id IS NOT NULL) LIMIT 1`;
      if (!home.length) return NextResponse.json({ location: null, canContinue: false, fallback: "gateway" });
    }
    if (location.locationKind === "event" && location.targetId) {
      const event = await sql`SELECT id FROM virtual_world_events e
        JOIN virtual_world_event_attendees a ON a.event_id = e.id
        WHERE e.id = ${location.targetId}::uuid AND a.user_id = ${session.id}::uuid
          AND a.attendance_status = 'going' AND e.status = 'scheduled' AND e.ends_at > NOW() LIMIT 1`;
      if (!event.length) return NextResponse.json({ location: null, canContinue: false, fallback: "gateway" });
    }
    return NextResponse.json({ location, canContinue: true }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Last world location read failed", error);
    return NextResponse.json({ error: "Saved location is unavailable" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let body: SavedLocation;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.worldId !== "string" || !UUID.test(body.worldId) ||
      (body.districtId !== undefined && (typeof body.districtId !== "string" || !/^[a-z0-9-]{2,48}$/.test(body.districtId))) ||
      !["world","home","event","social"].includes(String(body.locationKind ?? "world")) ||
      (body.targetId !== undefined && body.targetId !== null && (typeof body.targetId !== "string" || !UUID.test(body.targetId))) ||
      (body.activityProgress !== undefined && !bounded(body.activityProgress, 4000))) {
    return NextResponse.json({ error: "Invalid saved location fields" }, { status: 400 });
  }
  try {
    const sql = getDb();
    const world = await accessibleWorld(body.worldId, session.id);
    if (!world || !CITY_IDS.has(world.cityId))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const checkpoint = await sql`
      SELECT position, rotation, updated_at AS "updatedAt"
      FROM virtual_world_player_state
      WHERE world_id = ${body.worldId}::uuid AND user_id = ${session.id}::uuid LIMIT 1
    `;
    const state = checkpoint[0];
    if (!state || Date.now() - new Date(state.updatedAt).getTime() > 30000 ||
        !validVector(state.position) || !validVector(state.rotation, true))
      return NextResponse.json({ error: "A fresh authoritative player checkpoint is required" }, { status: 409 });
    const kind = String(body.locationKind ?? "world");
    const targetId = typeof body.targetId === "string" ? body.targetId : null;
    if (kind === "home") {
      if (!targetId) return NextResponse.json({ error: "Home destination is required" }, { status: 400 });
      const home = await sql`SELECT id FROM virtual_homes h
        LEFT JOIN virtual_home_members hm ON hm.home_id = h.id AND hm.user_id = ${session.id}::uuid
        WHERE h.id = ${targetId}::uuid AND h.world_id = ${body.worldId}::uuid
          AND (h.owner_user_id = ${session.id}::uuid OR hm.user_id IS NOT NULL) LIMIT 1`;
      if (!home.length) return NextResponse.json({ error: "Home access is unavailable" }, { status: 403 });
    }
    if (kind === "event") {
      if (!targetId) return NextResponse.json({ error: "Event destination is required" }, { status: 400 });
      const event = await sql`SELECT id FROM virtual_world_events e
        JOIN virtual_world_event_attendees a ON a.event_id = e.id
        WHERE e.id = ${targetId}::uuid AND e.world_id = ${body.worldId}::uuid
          AND a.user_id = ${session.id}::uuid AND a.attendance_status = 'going'
          AND e.status = 'scheduled' AND e.ends_at > NOW() LIMIT 1`;
      if (!event.length) return NextResponse.json({ error: "Event access is unavailable" }, { status: 403 });
    }
    await sql`
      INSERT INTO virtual_world_last_locations
        (user_id, world_id, city_id, district_id, location_kind, target_id,
         position, rotation, activity_progress, saved_at)
      VALUES (${session.id}::uuid, ${body.worldId}::uuid, ${world.cityId},
        ${body.districtId ?? null}, ${kind}, ${targetId}::uuid,
        ${JSON.stringify(state.position)}::jsonb, ${JSON.stringify(state.rotation)}::jsonb,
        ${JSON.stringify(body.activityProgress ?? {})}::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        world_id = EXCLUDED.world_id, city_id = EXCLUDED.city_id,
        district_id = EXCLUDED.district_id, location_kind = EXCLUDED.location_kind,
        target_id = EXCLUDED.target_id, position = EXCLUDED.position,
        rotation = EXCLUDED.rotation, activity_progress = EXCLUDED.activity_progress,
        saved_at = NOW()
    `;
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Last world location save failed", error);
    return NextResponse.json({ error: "Saved location could not be updated" }, { status: 503 });
  }
}
