import { jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export type WorldClientSession = { id: string; handle: string; worldId: string; clientType: string; instanceId: string | null };

function worldTokenKey() {
  const secret = process.env.WORLD_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("WORLD_TOKEN_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

/**
 * Authenticate either a normal UCENO web cookie or a short-lived Unity world
 * bearer token. Bearer tokens are audience/issuer/world scoped and are never
 * accepted as general social-app sessions.
 */
export async function readWorldClientSession(request: NextRequest, worldId: string): Promise<WorldClientSession | null> {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match) {
    const webSession = await readSession();
    return webSession ? { ...webSession, worldId, clientType: "web", instanceId: null } : null;
  }

  try {
    const { payload } = await jwtVerify(match[1], worldTokenKey(), {
      algorithms: ["HS256"],
      issuer: "uceno-social",
      audience: "uceno-world-gateway",
    });
    if (!payload.sub || payload.world_id !== worldId ||
        typeof payload.instance_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.instance_id) ||
        (payload.client_type !== "unity-android" && payload.client_type !== "unity-desktop")) return null;

    const sql = getDb();
    const accounts = await sql`
      SELECT u.handle, u.moderation_status AS "moderationStatus",
        u.suspended_until AS "suspendedUntil",
        EXISTS (
          SELECT 1
          FROM virtual_world_instance_sessions s
          JOIN virtual_world_instances i ON i.id = s.instance_id
          WHERE s.world_id = ${worldId}::uuid
            AND s.user_id = u.id
            AND s.instance_id = ${payload.instance_id}::uuid
            AND s.lease_expires_at > NOW()
            AND i.status = 'ready' AND i.endpoint IS NOT NULL
            AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
        ) AS "instanceHealthy"
      FROM users u WHERE u.id = ${payload.sub}::uuid LIMIT 1
    `;
    const account = accounts[0];
    if (!account || !account.instanceHealthy || account.moderationStatus === "disabled") return null;
    if (account.moderationStatus === "suspended") {
      const until = account.suspendedUntil ? new Date(account.suspendedUntil).getTime() : Number.POSITIVE_INFINITY;
      if (until > Date.now()) return null;
      await sql`UPDATE users SET moderation_status = 'active', suspended_until = NULL,
        moderation_note = NULL, moderated_at = NOW()
        WHERE id = ${payload.sub}::uuid AND moderation_status = 'suspended'`;
    }
    return { id: payload.sub, handle: account.handle, worldId, clientType: payload.client_type, instanceId: payload.instance_id };
  } catch {
    return null;
  }
}
