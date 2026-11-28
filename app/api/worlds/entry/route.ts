import { createHash, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const CODE_TTL_SECONDS = 90;
const WORLD_TOKEN_TTL_SECONDS = 5 * 60;

function worldTokenKey() {
  const secret = process.env.WORLD_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("WORLD_TOKEN_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function validClient(value: unknown): value is "unity-android" | "unity-desktop" {
  return value === "unity-android" || value === "unity-desktop";
}

// POST /api/worlds/entry: issue a short-lived, single-use handoff code.
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to enter a world" }, { status: 401 });

  let body: { worldId?: unknown; clientType?: unknown; entryKind?: unknown; targetId?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const entryKind = body.entryKind === undefined ? "world" : body.entryKind;
  const targetId = body.targetId === undefined ? null : body.targetId;
  if (typeof body.worldId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.worldId) ||
      !validClient(body.clientType) || !["world","home","event"].includes(String(entryKind)) ||
      (targetId !== null && (typeof targetId !== "string" || !/^[0-9a-f-]{36}$/i.test(targetId))) ||
      (entryKind !== "world" && targetId === null))
    return NextResponse.json({ error: "A valid worldId, destination and supported clientType are required" }, { status: 400 });

  try {
    const sql = getDb();
    const rate = await sql`
      SELECT COUNT(*)::int AS count FROM virtual_world_entry_codes
      WHERE user_id = ${session.id}::uuid AND created_at > NOW() - INTERVAL '1 minute'
    `;
    if (Number(rate[0]?.count ?? 0) >= 10)
      return NextResponse.json({ error: "Too many world-entry requests. Try again shortly." }, { status: 429 });

    const rows = await sql`
      SELECT w.id, w.status, w.visibility, w.owner_user_id AS "ownerUserId",
             COALESCE(m.status, 'none') AS "membershipStatus",
             EXISTS (
               SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = ${session.id}::uuid AND b.blocked_id = w.owner_user_id)
                  OR (b.blocker_id = w.owner_user_id AND b.blocked_id = ${session.id}::uuid)
             ) AS blocked
      FROM virtual_worlds w
      LEFT JOIN virtual_world_memberships m ON m.world_id = w.id AND m.user_id = ${session.id}::uuid
      WHERE w.id = ${body.worldId}::uuid LIMIT 1
    `;
    const world = rows[0];
    if (!world || world.status !== "published" || world.blocked)
      return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    if (world.membershipStatus === "banned" || world.membershipStatus === "suspended")
      return NextResponse.json({ error: "You do not have permission to enter this world" }, { status: 403 });
    if (world.visibility === "private" && world.membershipStatus !== "active" && world.ownerUserId !== session.id)
      return NextResponse.json({ error: "World membership is required" }, { status: 403 });

    if (entryKind === "home") {
      const home = await sql`
        SELECT h.id FROM virtual_homes h
        LEFT JOIN virtual_home_members hm ON hm.home_id = h.id AND hm.user_id = ${session.id}::uuid
        WHERE h.id = ${targetId}::uuid AND h.world_id = ${body.worldId}::uuid
          AND (h.owner_user_id = ${session.id}::uuid OR hm.user_id IS NOT NULL)
        LIMIT 1
      `;
      if (!home.length) return NextResponse.json({ error: "Home access is unavailable" }, { status: 403 });
    }
    if (entryKind === "event") {
      const event = await sql`
        SELECT e.id FROM virtual_world_events e
        JOIN virtual_world_event_attendees a ON a.event_id = e.id
        WHERE e.id = ${targetId}::uuid AND e.world_id = ${body.worldId}::uuid
          AND a.user_id = ${session.id}::uuid AND a.attendance_status = 'going'
          AND e.status = 'scheduled' AND e.starts_at <= NOW() + INTERVAL '30 minutes'
          AND e.ends_at > NOW()
        LIMIT 1
      `;
      if (!event.length) return NextResponse.json({ error: "Event admission requires an active RSVP and an open admission window" }, { status: 403 });
    }

    const code = randomBytes(32).toString("base64url");
    await sql`
      INSERT INTO virtual_world_entry_codes
        (code_hash, user_id, world_id, client_type, entry_kind, entry_target_id, expires_at)
      VALUES (${digest(code)}, ${session.id}::uuid, ${body.worldId}::uuid,
              ${body.clientType}, ${entryKind}, ${targetId}::uuid,
              NOW() + INTERVAL '90 seconds')
    `;
    return NextResponse.json({ code, expiresInSeconds: CODE_TTL_SECONDS }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World entry-code issue failed", error);
    return NextResponse.json({ error: "World entry is not configured. Apply migration 015 and configure WORLD_TOKEN_SECRET." }, { status: 503 });
  }
}

// PUT /api/worlds/entry: atomically consume a code and return a five-minute JWT.
export async function PUT(request: NextRequest) {
  let body: { code?: unknown; clientType?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.code !== "string" || body.code.length < 32 || body.code.length > 128 || !validClient(body.clientType))
    return NextResponse.json({ error: "A valid code and supported clientType are required" }, { status: 400 });

  try {
    const sql = getDb();
    // Re-check world visibility, membership, moderation and owner blocks at
    // redemption time. A code issued earlier must not bypass a later ban,
    // suspension, world shutdown or block.
    const redeemed = await sql`
      UPDATE virtual_world_entry_codes AS ec
      SET consumed_at = NOW()
      FROM virtual_worlds AS w, users AS u
      WHERE ec.code_hash = ${digest(body.code)}
        AND ec.client_type = ${body.clientType}
        AND ec.consumed_at IS NULL AND ec.expires_at > NOW()
        AND w.id = ec.world_id AND u.id = ec.user_id
        AND w.status = 'published'
        AND COALESCE((SELECT m.status FROM virtual_world_memberships m
          WHERE m.world_id = w.id AND m.user_id = u.id), 'none') NOT IN ('banned', 'suspended')
        AND (w.visibility <> 'private' OR w.owner_user_id = u.id OR EXISTS (
          SELECT 1 FROM virtual_world_memberships m
          WHERE m.world_id = w.id AND m.user_id = u.id AND m.status = 'active'
        ))
        AND u.moderation_status <> 'disabled'
        AND (u.moderation_status <> 'suspended' OR u.suspended_until <= NOW())
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = u.id AND b.blocked_id = w.owner_user_id)
             OR (b.blocker_id = w.owner_user_id AND b.blocked_id = u.id)
        )
      RETURNING ec.user_id AS "userId", ec.world_id AS "worldId",
                ec.entry_kind AS "entryKind", ec.entry_target_id AS "entryTargetId"
    `;
    if (!redeemed.length)
      return NextResponse.json({ error: "Entry code is invalid, expired or already used" }, { status: 401 });

    const identity = redeemed[0];
    // Claim a capacity-limited, healthy runtime instance. The instance must
    // already be provisioned and publishing a recent heartbeat.
    const assignments = await sql`
      SELECT instance_id AS "instanceId", endpoint, region,
             lease_expires_at AS "leaseExpiresAt"
      FROM claim_virtual_world_instance(${identity.worldId}::uuid, ${identity.userId}::uuid)
    `;
    const assignment = assignments[0];
    if (!assignment) {
      return NextResponse.json({ error: "No healthy world instance is currently available. Request a fresh entry code and retry." }, { status: 503 });
    }

    const token = await new SignJWT({
      world_id: identity.worldId,
      client_type: body.clientType,
      entry_kind: identity.entryKind,
      entry_target_id: identity.entryTargetId,
      instance_id: assignment.instanceId
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("uceno-social")
      .setAudience("uceno-world-gateway")
      .setSubject(identity.userId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(worldTokenKey());

    return NextResponse.json({
      accessToken: token,
      tokenType: "Bearer",
      expiresInSeconds: WORLD_TOKEN_TTL_SECONDS,
      worldId: identity.worldId,
      entryKind: identity.entryKind,
      entryTargetId: identity.entryTargetId,
      instanceId: assignment.instanceId,
      instanceEndpoint: assignment.endpoint,
      region: assignment.region,
      leaseExpiresAt: assignment.leaseExpiresAt
    }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World entry-code exchange failed", error);
    return NextResponse.json({ error: "World token service is unavailable" }, { status: 503 });
  }
}
