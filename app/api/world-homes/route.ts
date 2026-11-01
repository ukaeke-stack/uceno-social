import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { isValidHomeFurnishing, isValidHomeTransform } from "@/lib/world-home-layout";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedJson(value: unknown, maxBytes: number) {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= maxBytes; }
  catch { return false; }
}

async function accessibleWorld(worldId: string, userId: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT w.status, w.visibility, w.owner_user_id AS "ownerUserId",
      COALESCE(m.status, 'none') AS "membershipStatus",
      EXISTS (SELECT 1 FROM user_blocks b
        WHERE (b.blocker_id = ${userId}::uuid AND b.blocked_id = w.owner_user_id)
           OR (b.blocker_id = w.owner_user_id AND b.blocked_id = ${userId}::uuid)) AS blocked
    FROM virtual_worlds w
    LEFT JOIN virtual_world_memberships m ON m.world_id = w.id AND m.user_id = ${userId}::uuid
    WHERE w.id = ${worldId}::uuid LIMIT 1
  `;
  const world = rows[0];
  return !!world && world.status === "published" && !world.blocked &&
    world.membershipStatus !== "banned" && world.membershipStatus !== "suspended" &&
    (world.visibility !== "private" || world.membershipStatus === "active" || world.ownerUserId === userId);
}

// GET /api/world-homes?worldId=<uuid> — only owned or explicitly shared homes are returned.
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const worldId = request.nextUrl.searchParams.get("worldId") ?? "";
  if (!UUID.test(worldId)) return NextResponse.json({ error: "Invalid worldId" }, { status: 400 });
  try {
    if (!await accessibleWorld(worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const sql = getDb();
    const homes = await sql`
      SELECT h.id, h.name, h.template_id AS "templateId", h.transform,
             h.furnishing, h.visibility, h.owner_user_id AS "ownerUserId",
             h.updated_at AS "updatedAt",
             CASE WHEN h.owner_user_id = ${session.id}::uuid THEN 'owner' ELSE hm.permission END AS permission
      FROM virtual_homes h
      LEFT JOIN virtual_home_members hm
        ON hm.home_id = h.id AND hm.user_id = ${session.id}::uuid
      WHERE h.world_id = ${worldId}::uuid
        AND (h.owner_user_id = ${session.id}::uuid OR (h.visibility = 'invite' AND hm.user_id IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = h.owner_user_id AND b.blocked_id = ${session.id}::uuid)
             OR (b.blocker_id = ${session.id}::uuid AND b.blocked_id = h.owner_user_id))
      ORDER BY h.updated_at DESC LIMIT 100
    `;
    return NextResponse.json({ homes }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("World home list failed", error);
    return NextResponse.json({ error: "Homes are unavailable" }, { status: 503 });
  }
}

// POST /api/world-homes — create a private home in an accessible published world.
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) throw new Error("Expected object");
    body = parsed;
  } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (typeof body.worldId !== "string" || !UUID.test(body.worldId) ||
      typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 100 ||
      typeof body.templateId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(body.templateId)) {
    return NextResponse.json({ error: "A valid worldId, home name and templateId are required" }, { status: 400 });
  }
  const transform = body.transform ?? {};
  const furnishing = body.furnishing ?? [];
  if (!isValidHomeTransform(transform) || !isValidHomeFurnishing(furnishing) ||
      !boundedJson(transform, 4000) || !boundedJson(furnishing, 12000) || (body.visibility !== undefined &&
      body.visibility !== "private" && body.visibility !== "invite")) {
    return NextResponse.json({ error: "Invalid home layout, furnishing or visibility settings" }, { status: 400 });
  }

  try {
    if (!await accessibleWorld(body.worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const sql = getDb();
    const rows = await sql`
      INSERT INTO virtual_homes
        (world_id, owner_user_id, name, template_id, transform, furnishing, visibility)
      VALUES (${body.worldId}::uuid, ${session.id}::uuid, ${body.name.trim()},
        ${body.templateId}, ${JSON.stringify(transform)}::jsonb,
        ${JSON.stringify(furnishing)}::jsonb, ${body.visibility ?? "private"})
      RETURNING id, name, template_id AS "templateId", transform, furnishing,
                visibility, created_at AS "createdAt"
    `;
    return NextResponse.json({ home: rows[0] }, {
      status: 201, headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World home creation failed", error);
    return NextResponse.json({ error: "Home could not be created" }, { status: 503 });
  }
}
