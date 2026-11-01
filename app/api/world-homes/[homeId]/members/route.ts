import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ homeId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: Context) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { homeId } = await params;
  if (!UUID.test(homeId)) return NextResponse.json({ error: "Invalid home ID" }, { status: 400 });

  let body: { userId?: unknown; permission?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.userId !== "string" || !UUID.test(body.userId) ||
      !["visitor", "decorator", "co_owner"].includes(String(body.permission)))
    return NextResponse.json({ error: "A valid userId and permission are required" }, { status: 400 });
  if (body.userId === session.id)
    return NextResponse.json({ error: "The home owner already has full control" }, { status: 400 });

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT h.id, h.owner_user_id AS "ownerUserId", h.world_id AS "worldId",
             h.visibility AS "homeVisibility",
             w.status AS "worldStatus", w.visibility AS "worldVisibility",
             EXISTS (SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = h.owner_user_id AND b.blocked_id = ${body.userId}::uuid)
                  OR (b.blocker_id = ${body.userId}::uuid AND b.blocked_id = h.owner_user_id)) AS blocked,
             COALESCE(m.status, 'none') AS "targetMembership"
      FROM virtual_homes h
      JOIN virtual_worlds w ON w.id = h.world_id
      LEFT JOIN virtual_world_memberships m
        ON m.world_id = h.world_id AND m.user_id = ${body.userId}::uuid
      WHERE h.id = ${homeId}::uuid LIMIT 1
    `;
    const home = rows[0];
    if (!home || home.worldStatus !== "published")
      return NextResponse.json({ error: "Home is unavailable" }, { status: 404 });
    if (home.ownerUserId !== session.id)
      return NextResponse.json({ error: "Only the home owner can manage invitations" }, { status: 403 });
    if (home.homeVisibility !== "invite")
      return NextResponse.json({ error: "Change the home visibility to invite before sharing it" }, { status: 409 });
    if (home.blocked || home.targetMembership === "banned" || home.targetMembership === "suspended" ||
        (home.worldVisibility === "private" && home.targetMembership !== "active"))
      return NextResponse.json({ error: "That account cannot access this world" }, { status: 403 });

    const granted = await sql`
      INSERT INTO virtual_home_members (home_id, user_id, permission)
      VALUES (${homeId}::uuid, ${body.userId}::uuid, ${body.permission})
      ON CONFLICT (home_id, user_id) DO UPDATE SET permission = EXCLUDED.permission
      RETURNING permission, created_at AS "createdAt"
    `;
    return NextResponse.json({ member: { userId: body.userId, ...granted[0] } }, {
      status: 201, headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Home invitation grant failed", error);
    return NextResponse.json({ error: "Home invitation could not be saved" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { homeId } = await params;
  if (!UUID.test(homeId)) return NextResponse.json({ error: "Invalid home ID" }, { status: 400 });
  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!UUID.test(userId)) return NextResponse.json({ error: "Invalid userId" }, { status: 400 });

  try {
    const sql = getDb();
    const owner = await sql`
      SELECT owner_user_id AS "ownerUserId"
      FROM virtual_homes WHERE id = ${homeId}::uuid LIMIT 1
    `;
    if (!owner[0]) return NextResponse.json({ error: "Home not found" }, { status: 404 });
    if (owner[0].ownerUserId !== session.id)
      return NextResponse.json({ error: "Only the home owner can revoke invitations" }, { status: 403 });
    await sql`
      DELETE FROM virtual_home_members
      WHERE home_id = ${homeId}::uuid AND user_id = ${userId}::uuid
    `;
    return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Home invitation revoke failed", error);
    return NextResponse.json({ error: "Home invitation could not be revoked" }, { status: 503 });
  }
}
