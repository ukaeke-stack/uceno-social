import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readWorldClientSession } from "@/lib/world-client-session";

export const runtime = "nodejs";
const TOKEN_TTL_SECONDS = 5 * 60;

function worldTokenKey() {
  const secret = process.env.WORLD_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("WORLD_TOKEN_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

// Renew an unexpired Unity world token only while the player is still present
// and still has access. This is not a general-purpose refresh token endpoint.
export async function POST(request: NextRequest, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(worldId))
    return NextResponse.json({ error: "Invalid world ID" }, { status: 400 });

  const session = await readWorldClientSession(request, worldId);
  if (!session || session.clientType === "web")
    return NextResponse.json({ error: "A valid Unity world session is required" }, { status: 401 });

  try {
    const sql = getDb();
    const access = await sql`
      SELECT w.visibility, w.status, w.owner_user_id AS "ownerUserId",
        COALESCE(m.status, 'none') AS "membershipStatus",
        u.moderation_status AS "moderationStatus",
        u.suspended_until AS "suspendedUntil",
        EXISTS (SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ${session.id}::uuid AND b.blocked_id = w.owner_user_id)
             OR (b.blocker_id = w.owner_user_id AND b.blocked_id = ${session.id}::uuid)) AS blocked,
        EXISTS (SELECT 1 FROM virtual_world_presence p
          WHERE p.world_id = w.id AND p.user_id = ${session.id}::uuid
            AND p.instance_id = ${session.instanceId}::uuid
            AND p.last_seen > NOW() - INTERVAL '30 seconds') AS present,
        EXISTS (SELECT 1 FROM virtual_world_instance_sessions s
          JOIN virtual_world_instances i ON i.id = s.instance_id
          WHERE s.world_id = w.id AND s.user_id = ${session.id}::uuid
            AND s.instance_id = ${session.instanceId}::uuid
            AND s.lease_expires_at > NOW()
            AND i.status = 'ready' AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
            AND i.endpoint IS NOT NULL) AS instanceHealthy
      FROM virtual_worlds w
      JOIN users u ON u.id = ${session.id}::uuid
      LEFT JOIN virtual_world_memberships m
        ON m.world_id = w.id AND m.user_id = u.id
      WHERE w.id = ${worldId}::uuid LIMIT 1
    `;
    const world = access[0];
    const moderationAllowed = !!world && world.moderationStatus !== "disabled" &&
      !(world.moderationStatus === "suspended" &&
        (!world.suspendedUntil || new Date(world.suspendedUntil).getTime() > Date.now()));
    if (!world || !moderationAllowed || world.status !== "published" || world.blocked || !world.present || !world.instanceHealthy ||
        world.membershipStatus === "banned" || world.membershipStatus === "suspended" ||
        (world.visibility === "private" && world.membershipStatus !== "active" && world.ownerUserId !== session.id)) {
      return NextResponse.json({ error: "World access expired; request a new entry code" }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ world_id: worldId, client_type: session.clientType, instance_id: session.instanceId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("uceno-social")
      .setAudience("uceno-world-gateway")
      .setSubject(session.id)
      .setIssuedAt(now)
      .setNotBefore(now - 5)
      .setExpirationTime(now + TOKEN_TTL_SECONDS)
      .sign(worldTokenKey());

    return NextResponse.json({ accessToken: token, tokenType: "Bearer", expiresInSeconds: TOKEN_TTL_SECONDS }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World session refresh failed", error);
    return NextResponse.json({ error: "World session refresh is unavailable" }, { status: 503 });
  }
}
