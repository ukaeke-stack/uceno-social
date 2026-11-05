import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const configured = process.env.WORLD_INSTANCE_HEARTBEAT_SECRET;
  const supplied = request.headers.get("authorization") || "";
  if (!configured || configured.length < 32 || !supplied.startsWith("Bearer ")) return false;
  const candidate = supplied.slice(7);
  const expectedBytes = Buffer.from(configured);
  const candidateBytes = Buffer.from(candidate);
  return expectedBytes.length === candidateBytes.length &&
    timingSafeEqual(expectedBytes, candidateBytes);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Runtime instances call this over HTTPS. The endpoint is provisioned
// separately; heartbeats cannot redirect clients to an arbitrary host.
export async function POST(request: NextRequest) {
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized runtime instance" }, { status: 401 });

  let body: { instanceId?: unknown; status?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!validUuid(body.instanceId) ||
      (body.status !== undefined && !["ready", "draining", "offline"].includes(String(body.status)))) {
    return NextResponse.json({ error: "A valid instanceId and supported status are required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      UPDATE virtual_world_instances i
      SET heartbeat_at = NOW(),
          status = COALESCE(${body.status ?? null}::text, i.status),
          current_players = (
            SELECT COUNT(*)::integer
            FROM virtual_world_instance_sessions s
            WHERE s.instance_id = i.id AND s.lease_expires_at > NOW()
          )
      WHERE i.id = ${body.instanceId}::uuid
      RETURNING i.id AS "instanceId", i.world_id AS "worldId",
        i.status, i.current_players AS "currentPlayers",
        i.capacity, i.heartbeat_at AS "heartbeatAt"
    `;
    if (!rows[0])
      return NextResponse.json({ error: "Runtime instance was not registered" }, { status: 404 });

    return NextResponse.json(rows[0], {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World instance heartbeat failed", error);
    return NextResponse.json({ error: "Runtime heartbeat service is unavailable" }, { status: 503 });
  }
}
