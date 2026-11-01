import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readWorldClientSession } from "@/lib/world-client-session";

export const runtime = "nodejs";
const schema = z.object({ zone: z.string().trim().min(1).max(48).regex(/^[a-zA-Z0-9_-]+$/).default("main") });

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) return NextResponse.json({ error: "Sign in or reconnect to this world" }, { status: 401 });
  if (process.env.WORLD_SPATIAL_VOICE_ENABLED !== "true") {
    return NextResponse.json({ error: "World voice is not enabled yet" }, { status: 503 });
  }
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "World voice service is not configured" }, { status: 503 });
  }
  if (!validUuid(worldId)) return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid voice zone" }, { status: 400 });

  try {
    const sql = getDb();
    const worlds = await sql`
      SELECT w.id, w.name, w.visibility, w.status, w.owner_user_id AS "ownerUserId",
        w.max_players AS "maxPlayers", u.handle,
        COALESCE(m.status, 'none') AS "membershipStatus"
      FROM virtual_worlds w
      JOIN users u ON u.id = ${session.id}::uuid
      LEFT JOIN virtual_world_memberships m
        ON m.world_id = w.id AND m.user_id = ${session.id}::uuid
      WHERE w.id = ${worldId}::uuid LIMIT 1
    `;
    const world = worlds[0];
    if (!world || world.status !== "published" ||
        world.membershipStatus === "banned" || world.membershipStatus === "suspended" ||
        (world.visibility === "private" && world.membershipStatus !== "active" && world.ownerUserId !== session.id)) {
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    }
    const presence = await sql`
      SELECT 1 FROM virtual_world_presence
      WHERE world_id = ${worldId}::uuid AND user_id = ${session.id}::uuid
        AND last_seen > NOW() - INTERVAL '15 seconds' LIMIT 1
    `;
    if (!presence.length) return NextResponse.json({ error: "Join the world before connecting voice" }, { status: 409 });

    const roomName = `uceno-world-${worldId}-${input.data.zone}`;
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      video: {
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: ["microphone"],
      },
      metadata: JSON.stringify({ worldId, zone: input.data.zone, kind: "world-spatial-voice" }),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(apiKey)
      .setSubject(String(session.id))
      .setIssuedAt(now)
      .setNotBefore(now - 5)
      .setExpirationTime(now + 10 * 60)
      .sign(new TextEncoder().encode(apiSecret));

    return NextResponse.json({ token, url, room: roomName, identity: String(session.id), expiresIn: 600 }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World voice token issue failed", error);
    return NextResponse.json({ error: "World voice is temporarily unavailable" }, { status: 503 });
  }
}
