import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

type Context = { params: Promise<{ worldId: string }> };
type Vector3 = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function vector3(value: unknown): value is Vector3 {
  return isRecord(value) &&
    ["x", "y", "z"].every((key) => typeof value[key] === "number" &&
      Number.isFinite(value[key]) && Math.abs(value[key] as number) <= 100000);
}
function quaternion(value: unknown): value is Quaternion {
  if (!isRecord(value) || !["x", "y", "z", "w"].every((key) =>
    typeof value[key] === "number" && Number.isFinite(value[key]) &&
    Math.abs(value[key] as number) <= 1.01)) return false;
  const length = Math.hypot(value.x as number, value.y as number, value.z as number, value.w as number);
  return length > 0.9 && length < 1.1;
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
  if (!world || world.status !== "published" || world.blocked) return false;
  if (world.membershipStatus === "banned" || world.membershipStatus === "suspended") return false;
  if (world.visibility === "private" &&
      world.membershipStatus !== "active" && world.ownerUserId !== userId) return false;
  return true;
}

// GET /api/worlds/:worldId/state — load the last durable checkpoint, not live movement.
export async function GET(_request: NextRequest, { params }: Context) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { worldId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(worldId))
    return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });

  try {
    if (!await canAccessWorld(worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const sql = getDb();
    const rows = await sql`
      SELECT spawn_id AS "spawnId", position, rotation, state, updated_at AS "updatedAt"
      FROM virtual_world_player_state
      WHERE world_id = ${worldId}::uuid AND user_id = ${session.id}::uuid LIMIT 1
    `;
    return NextResponse.json({ checkpoint: rows[0] ?? null }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World state load failed", error);
    return NextResponse.json({ error: "World state is unavailable" }, { status: 503 });
  }
}

// PUT /api/worlds/:worldId/state — save a bounded checkpoint on explicit safe points.
export async function PUT(request: NextRequest, { params }: Context) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { worldId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(worldId))
    return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) throw new Error("Expected object");
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const spawnId = body.spawnId;
  const position = body.position;
  const rotation = body.rotation;
  const state = body.state ?? {};
  if ((spawnId !== null && spawnId !== undefined &&
       (typeof spawnId !== "string" || spawnId.length > 80)) ||
      !vector3(position) || !quaternion(rotation) || !isRecord(state) ||
      Buffer.byteLength(JSON.stringify(state), "utf8") > 16000) {
    return NextResponse.json({ error: "Invalid checkpoint fields or state payload too large" }, { status: 400 });
  }

  try {
    if (!await canAccessWorld(worldId, session.id))
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    const sql = getDb();
    const rows = await sql`
      INSERT INTO virtual_world_player_state
        (world_id, user_id, spawn_id, position, rotation, state, updated_at)
      VALUES (
        ${worldId}::uuid, ${session.id}::uuid, ${spawnId ?? null},
        ${JSON.stringify(position)}::jsonb, ${JSON.stringify(rotation)}::jsonb,
        ${JSON.stringify(state)}::jsonb, NOW()
      )
      ON CONFLICT (world_id, user_id) DO UPDATE SET
        spawn_id = EXCLUDED.spawn_id,
        position = EXCLUDED.position,
        rotation = EXCLUDED.rotation,
        state = EXCLUDED.state,
        updated_at = NOW()
      RETURNING updated_at AS "updatedAt"
    `;
    return NextResponse.json({ saved: true, updatedAt: rows[0]?.updatedAt }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World state save failed", error);
    return NextResponse.json({ error: "World checkpoint could not be saved" }, { status: 503 });
  }
}
