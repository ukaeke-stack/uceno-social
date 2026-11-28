import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["avatar_item", "furniture", "art", "experience"]);

function validListing(body: Record<string, unknown>) {
  return typeof body.title === "string" && body.title.trim().length >= 3 &&
    body.title.trim().length <= 120 &&
    (body.description === undefined || (typeof body.description === "string" && body.description.length <= 3000)) &&
    typeof body.itemType === "string" && TYPES.has(body.itemType) &&
    (body.assetKey === undefined || body.assetKey === null ||
      (typeof body.assetKey === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,179}$/.test(body.assetKey) && !body.assetKey.split("/").some((part: string) => part === "." || part === ".."))) &&
    typeof body.pricePurchasedCredits === "number" && Number.isSafeInteger(body.pricePurchasedCredits) &&
    body.pricePurchasedCredits >= 0 && body.pricePurchasedCredits <= 1_000_000_000 &&
    (body.stock === undefined || body.stock === null ||
      (typeof body.stock === "number" && Number.isSafeInteger(body.stock) && body.stock >= 0 && body.stock <= 1_000_000));
}

// GET /api/marketplace?worldId=<optional uuid>&mine=true
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const worldId = request.nextUrl.searchParams.get("worldId");
  const mine = request.nextUrl.searchParams.get("mine") === "true";
  if (worldId && !UUID.test(worldId)) return NextResponse.json({ error: "Invalid worldId" }, { status: 400 });
  try {
    const sql = getDb();
    const listings = await sql`
      SELECT l.id, l.seller_user_id AS "sellerUserId", l.world_id AS "worldId",
             l.title, l.description, l.item_type AS "itemType", l.asset_key AS "assetKey",
             l.price_purchased_credits AS "pricePurchasedCredits", l.stock, l.status,
             l.created_at AS "createdAt", l.updated_at AS "updatedAt"
      FROM virtual_marketplace_listings l
      LEFT JOIN virtual_worlds w ON w.id = l.world_id
      WHERE (${mine}::boolean AND l.seller_user_id = ${session.id}::uuid)
         OR (NOT ${mine}::boolean AND l.status = 'active'
             AND (l.stock IS NULL OR l.stock > 0)
             AND (l.world_id IS NULL OR (w.status = 'published' AND w.visibility = 'public'))
             AND (${worldId}::uuid IS NULL OR l.world_id = ${worldId}::uuid))
      ORDER BY l.created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ listings }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Marketplace list failed", error);
    return NextResponse.json({ error: "Marketplace is not configured. Apply migration 015." }, { status: 503 });
  }
}

// POST creates a draft only. Sellers cannot self-publish or credit themselves.
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected object");
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!validListing(body) || (body.worldId !== undefined && body.worldId !== null &&
      (typeof body.worldId !== "string" || !UUID.test(body.worldId)))) {
    return NextResponse.json({ error: "Invalid marketplace listing fields" }, { status: 400 });
  }
  try {
    const sql = getDb();
    if (typeof body.worldId === "string") {
      const access = await sql`
        SELECT w.status, w.visibility, w.owner_user_id AS "ownerUserId",
               COALESCE(m.status, 'none') AS "membershipStatus"
        FROM virtual_worlds w
        LEFT JOIN virtual_world_memberships m ON m.world_id = w.id AND m.user_id = ${session.id}::uuid
        WHERE w.id = ${body.worldId}::uuid LIMIT 1
      `;
      const world = access[0];
      if (!world || world.status !== "published" ||
          world.membershipStatus === "banned" || world.membershipStatus === "suspended" ||
          (world.visibility === "private" && world.membershipStatus !== "active" && world.ownerUserId !== session.id))
        return NextResponse.json({ error: "World is unavailable" }, { status: 404 });
    }
    const inserted = await sql`
      INSERT INTO virtual_marketplace_listings
        (seller_user_id, world_id, title, description, item_type, asset_key,
         price_purchased_credits, stock, status)
      VALUES (${session.id}::uuid, ${body.worldId ?? null}::uuid,
        ${(body.title as string).trim()},
        ${typeof body.description === "string" ? body.description.trim() : ""},
        ${body.itemType as string}, ${body.assetKey ?? null},
        ${body.pricePurchasedCredits as number}, ${body.stock ?? null}, 'draft')
      RETURNING id, title, description, item_type AS "itemType",
        asset_key AS "assetKey", price_purchased_credits AS "pricePurchasedCredits",
        stock, status, created_at AS "createdAt"
    `;
    return NextResponse.json({ listing: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("Marketplace listing create failed", error);
    return NextResponse.json({ error: "Listing could not be created" }, { status: 503 });
  }
}
