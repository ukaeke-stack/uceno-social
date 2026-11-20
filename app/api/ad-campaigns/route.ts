import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,179}$/;

function validDestination(value: unknown): value is string | null | undefined {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

// Advertisers can inspect only their own campaigns. Budgets are declarations,
// not proof of payment and never trigger a debit or publication.
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const status = request.nextUrl.searchParams.get("status");
  if (status && !["draft", "pending_review", "active", "paused", "completed", "rejected"].includes(status))
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  try {
    const sql = getDb();
    const campaigns = await sql`
      SELECT id, world_id AS "worldId", name,
        creative_asset_key AS "creativeAssetKey", destination_url AS "destinationUrl",
        payment_source AS "paymentSource", budget_minor AS "budgetAmount",
        budget_unit AS "budgetUnit", status, starts_at AS "startsAt",
        ends_at AS "endsAt", created_at AS "createdAt"
      FROM virtual_ad_campaigns
      WHERE advertiser_user_id = ${session.id}::uuid
        AND (${status}::text IS NULL OR status = ${status})
      ORDER BY created_at DESC LIMIT 100
    `;
    return NextResponse.json({ campaigns }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Advertiser campaign list failed", error);
    return NextResponse.json({ error: "Campaign service is unavailable. Apply migration 018." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected object");
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const paymentSource = body.paymentSource;
  const budgetAmount = body.budgetAmount;
  if (typeof body.name !== "string" || body.name.trim().length < 3 || body.name.trim().length > 120 ||
      typeof body.creativeAssetKey !== "string" || !ASSET_KEY.test(body.creativeAssetKey) ||
      body.creativeAssetKey.split("/").some(part => part === "." || part === "..") ||
      !validDestination(body.destinationUrl) ||
      !["real_money", "purchased_credits"].includes(String(paymentSource)) ||
      typeof budgetAmount !== "number" || !Number.isSafeInteger(budgetAmount) ||
      budgetAmount < 1 || budgetAmount > 1_000_000_000_000 ||
      (body.worldId !== undefined && body.worldId !== null &&
        (typeof body.worldId !== "string" || !UUID.test(body.worldId)))) {
    return NextResponse.json({ error: "Invalid campaign fields" }, { status: 400 });
  }

  const startsAt = body.startsAt === undefined || body.startsAt === null ? null :
    typeof body.startsAt === "string" ? new Date(body.startsAt) : new Date(NaN);
  const endsAt = body.endsAt === undefined || body.endsAt === null ? null :
    typeof body.endsAt === "string" ? new Date(body.endsAt) : new Date(NaN);
  if ((startsAt && !Number.isFinite(startsAt.getTime())) ||
      (endsAt && !Number.isFinite(endsAt.getTime())) ||
      (startsAt && startsAt.getTime() < Date.now() + 60_000) ||
      (startsAt && endsAt && endsAt <= startsAt)) {
    return NextResponse.json({ error: "Invalid campaign schedule" }, { status: 400 });
  }

  try {
    const sql = getDb();
    if (typeof body.worldId === "string") {
      const rows = await sql`
        SELECT w.status, w.owner_user_id AS "ownerUserId",
          COALESCE(m.status, 'none') AS "membershipStatus",
          COALESCE(m.role, 'member') AS "membershipRole"
        FROM virtual_worlds w
        LEFT JOIN virtual_world_memberships m
          ON m.world_id = w.id AND m.user_id = ${session.id}::uuid
        WHERE w.id = ${body.worldId}::uuid LIMIT 1
      `;
      const world = rows[0];
      if (!world || world.status !== "published" ||
          (world.ownerUserId !== session.id &&
           !(world.membershipStatus === "active" && world.membershipRole === "admin"))) {
        return NextResponse.json({ error: "Only the world owner or active world admin can advertise in this world" }, { status: 403 });
      }
    }

    const budgetUnit = paymentSource === "purchased_credits" ? "purchased_credit" : "minor_currency_unit";
    const inserted = await sql`
      INSERT INTO virtual_ad_campaigns
        (advertiser_user_id, world_id, name, creative_asset_key, destination_url,
         payment_source, budget_minor, budget_unit, status, starts_at, ends_at)
      VALUES (${session.id}::uuid, ${body.worldId ?? null}::uuid,
        ${body.name.trim()}, ${body.creativeAssetKey},
        ${typeof body.destinationUrl === "string" && body.destinationUrl ? body.destinationUrl : null},
        ${paymentSource}, ${budgetAmount}, ${budgetUnit}, 'draft',
        ${startsAt ? startsAt.toISOString() : null}::timestamptz,
        ${endsAt ? endsAt.toISOString() : null}::timestamptz)
      RETURNING id, name, payment_source AS "paymentSource",
        budget_minor AS "budgetAmount", budget_unit AS "budgetUnit",
        status, created_at AS "createdAt"
    `;
    return NextResponse.json({
      campaign: inserted[0],
      billing: { charged: false, note: "Draft only. No Purchased Credits were debited and no real-money payment was verified." }
    }, { status: 201, headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Advertiser campaign create failed", error);
    return NextResponse.json({ error: "Campaign could not be created" }, { status: 503 });
  }
}
