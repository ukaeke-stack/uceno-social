import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { isValidHomeFurnishing, isValidHomeTransform } from "@/lib/world-home-layout";

export const runtime = "nodejs";
type Context = { params: Promise<{ homeId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function withinBytes(value: unknown, limit: number) {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= limit; }
  catch { return false; }
}

// PUT /api/world-homes/:homeId — owners and decorators may update the layout.

// GET /api/world-homes/:homeId — load a home only for its owner or an active invitee.
export async function GET(_request: NextRequest, { params }: Context) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { homeId } = await params;
  if (!UUID.test(homeId)) return NextResponse.json({ error: "Invalid home ID" }, { status: 400 });

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT h.id, h.world_id AS "worldId", h.owner_user_id AS "ownerUserId",
             h.name, h.template_id AS "templateId", h.transform, h.furnishing,
             h.visibility, h.updated_at AS "updatedAt",
             w.status AS "worldStatus", w.visibility AS "worldVisibility",
             COALESCE(wm.status, 'none') AS "worldMembership",
             CASE WHEN h.owner_user_id = ${session.id}::uuid THEN 'owner'
                  ELSE hm.permission END AS permission,
             EXISTS (SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = h.owner_user_id AND b.blocked_id = ${session.id}::uuid)
                  OR (b.blocker_id = ${session.id}::uuid AND b.blocked_id = h.owner_user_id)) AS blocked
      FROM virtual_homes h
      JOIN virtual_worlds w ON w.id = h.world_id
      LEFT JOIN virtual_world_memberships wm
        ON wm.world_id = h.world_id AND wm.user_id = ${session.id}::uuid
      LEFT JOIN virtual_home_members hm
        ON hm.home_id = h.id AND hm.user_id = ${session.id}::uuid
      WHERE h.id = ${homeId}::uuid LIMIT 1
    `;
    const home = rows[0];
    if (!home || home.worldStatus !== "published" || home.blocked ||
        home.worldMembership === "banned" || home.worldMembership === "suspended" ||
        (home.worldVisibility === "private" &&
          home.worldMembership !== "active" && home.ownerUserId !== session.id) ||
        (home.ownerUserId !== session.id &&
          (home.visibility !== "invite" || !home.permission))) {
      return NextResponse.json({ error: "Home is unavailable" }, { status: 404 });
    }
    const { ownerUserId: _ownerUserId, worldStatus: _worldStatus,
      worldVisibility: _worldVisibility, worldMembership: _worldMembership,
      blocked: _blocked, ...visibleHome } = home;
    return NextResponse.json({ home: visibleHome }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World home load failed", error);
    return NextResponse.json({ error: "Home is unavailable" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { homeId } = await params;
  if (!UUID.test(homeId)) return NextResponse.json({ error: "Invalid home ID" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) throw new Error("Expected object");
    body = parsed;
  } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const hasTransform = Object.prototype.hasOwnProperty.call(body, "transform");
  const hasFurnishing = Object.prototype.hasOwnProperty.call(body, "furnishing");
  const hasVisibility = body.visibility !== undefined && body.visibility !== "";
  if ((!hasTransform && !hasFurnishing && !hasVisibility) ||
      (hasTransform && (!isValidHomeTransform(body.transform) || !withinBytes(body.transform, 4000))) ||
      (hasFurnishing && (!isValidHomeFurnishing(body.furnishing) || !withinBytes(body.furnishing, 12000))) ||
      (hasVisibility && body.visibility !== "private" && body.visibility !== "invite")) {
    return NextResponse.json({ error: "Provide a valid bounded transform or furnishing layout" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      UPDATE virtual_homes h
      SET transform = CASE WHEN ${hasTransform} THEN ${JSON.stringify(body.transform ?? {})}::jsonb ELSE h.transform END,
          furnishing = CASE WHEN ${hasFurnishing} THEN ${JSON.stringify(body.furnishing ?? [])}::jsonb ELSE h.furnishing END,
          visibility = CASE WHEN ${hasVisibility} THEN ${body.visibility ?? "private"} ELSE h.visibility END,
          updated_at = NOW()
      WHERE h.id = ${homeId}::uuid
        AND (NOT ${hasVisibility} OR h.owner_user_id = ${session.id}::uuid)
        AND (
          h.owner_user_id = ${session.id}::uuid
          OR EXISTS (
            SELECT 1 FROM virtual_home_members hm
            WHERE hm.home_id = h.id AND hm.user_id = ${session.id}::uuid
              AND hm.permission IN ('decorator', 'co_owner')
          )
        )
        AND EXISTS (
          SELECT 1
          FROM virtual_worlds w
          LEFT JOIN virtual_world_memberships wm
            ON wm.world_id = w.id AND wm.user_id = ${session.id}::uuid
          WHERE w.id = h.world_id
            AND w.status = 'published'
            AND COALESCE(wm.status, 'none') NOT IN ('banned', 'suspended')
            AND (w.visibility <> 'private' OR wm.status = 'active'
              OR h.owner_user_id = ${session.id}::uuid)
            AND (h.owner_user_id = ${session.id}::uuid OR h.visibility = 'invite')
        )
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = h.owner_user_id AND b.blocked_id = ${session.id}::uuid)
             OR (b.blocker_id = ${session.id}::uuid AND b.blocked_id = h.owner_user_id)
        )
      RETURNING h.id, h.name, h.transform, h.furnishing, h.updated_at AS "updatedAt"
    `;
    if (!rows[0]) {
      const exists = await sql`SELECT id FROM virtual_homes WHERE id = ${homeId}::uuid LIMIT 1`;
      return exists[0]
        ? NextResponse.json({ error: "You do not have permission to edit this home" }, { status: 403 })
        : NextResponse.json({ error: "Home not found" }, { status: 404 });
    }
    return NextResponse.json({ home: rows[0] }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Home layout update failed", error);
    return NextResponse.json({ error: "Home layout could not be saved" }, { status: 503 });
  }
}
