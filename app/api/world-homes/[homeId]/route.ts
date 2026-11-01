import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

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
  if ((!hasTransform && !hasFurnishing) ||
      (hasTransform && (!isRecord(body.transform) || !withinBytes(body.transform, 4000))) ||
      (hasFurnishing && (!Array.isArray(body.furnishing) || body.furnishing.length > 100 ||
        !withinBytes(body.furnishing, 12000)))) {
    return NextResponse.json({ error: "Provide a valid bounded transform or furnishing layout" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      UPDATE virtual_homes h
      SET transform = CASE WHEN ${hasTransform} THEN ${JSON.stringify(body.transform ?? {})}::jsonb ELSE h.transform END,
          furnishing = CASE WHEN ${hasFurnishing} THEN ${JSON.stringify(body.furnishing ?? [])}::jsonb ELSE h.furnishing END,
          updated_at = NOW()
      WHERE h.id = ${homeId}::uuid
        AND (
          h.owner_user_id = ${session.id}::uuid
          OR EXISTS (
            SELECT 1 FROM virtual_home_members hm
            WHERE hm.home_id = h.id AND hm.user_id = ${session.id}::uuid
              AND hm.permission IN ('decorator', 'co_owner')
          )
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
