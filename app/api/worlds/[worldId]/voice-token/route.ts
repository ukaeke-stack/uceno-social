import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readWorldClientSession } from "@/lib/world-client-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ worldId: string }> };

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Proxy to the assigned gateway. The gateway alone knows live authoritative
 * positions and the active voice-pair allowlist, so the web API must not mint
 * media tokens from database presence snapshots.
 */
export async function POST(request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) return NextResponse.json({ error: "Sign in or reconnect to this world" }, { status: 401 });
  if (!session.instanceId || !validUuid(worldId)) {
    return NextResponse.json({ error: "A live assigned world instance is required for spatial voice" }, { status: 409 });
  }
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "A Unity world-session bearer token is required" }, { status: 401 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const peerUserId = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).peerUserId : null;
  if (typeof peerUserId !== "string" || !validUuid(peerUserId) || peerUserId === session.id) {
    return NextResponse.json({ error: "Invalid voice peer" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT i.endpoint
      FROM virtual_world_instance_sessions s
      JOIN virtual_world_instances i ON i.id = s.instance_id
      WHERE s.world_id = ${worldId}::uuid AND s.user_id = ${session.id}::uuid
        AND s.instance_id = ${session.instanceId}::uuid
        AND s.lease_expires_at > NOW() AND i.status = 'ready'
        AND i.endpoint IS NOT NULL AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
      LIMIT 1
    `;
    const endpoint = rows[0]?.endpoint;
    if (typeof endpoint !== "string") {
      return NextResponse.json({ error: "Assigned world instance is unavailable" }, { status: 503 });
    }
    const gateway = new URL(endpoint);
    if (gateway.protocol === "wss:") gateway.protocol = "https:";
    else if (gateway.protocol === "ws:") gateway.protocol = "http:";
    else if (gateway.protocol !== "https:" && gateway.protocol !== "http:") {
      return NextResponse.json({ error: "Invalid assigned gateway endpoint" }, { status: 503 });
    }
    gateway.pathname = "/voice/token";
    gateway.search = new URLSearchParams({ peerUserId }).toString();
    gateway.hash = "";
    const upstream = await fetch(gateway, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    const payload = await upstream.json().catch(() => ({ error: "voice_gateway_unavailable" }));
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World voice token proxy failed", error);
    return NextResponse.json({ error: "World voice is temporarily unavailable" }, { status: 503 });
  }
}
