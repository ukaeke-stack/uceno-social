import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["avatar_item", "furniture", "art", "experience"]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { listingId } = await context.params;
  if (!UUID.test(listingId)) return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected object");
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const fields = Object.keys(body);
  const allowed = new Set(["title", "description", "itemType", "assetKey", "pricePurchasedCredits", "stock", "status"]);
  if (!fields.length || fields.some(key => !allowed.has(key)))
    return NextResponse.json({ error: "Unsupported listing fields" }, { status: 400 });
  if (body.title !== undefined && (typeof body.title !== "string" || body.title.trim().length < 3 || body.title.trim().length > 120))
    return NextResponse.json({ error: "Invalid title" }, { status: 400 });
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 3000))
    return NextResponse.json({ error: "Invalid description" }, { status: 400 });
  if (body.itemType !== undefined && (typeof body.itemType !== "string" || !TYPES.has(body.itemType)))
    return NextResponse.json({ error: "Invalid itemType" }, { status: 400 });
  if (body.assetKey !== undefined && body.assetKey !== null &&
      (typeof body.assetKey !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,179}$/.test(body.assetKey) || body.assetKey.split("/").some((part: string) => part === "." || part === "..")))
    return NextResponse.json({ error: "Invalid assetKey" }, { status: 400 });
  if (body.pricePurchasedCredits !== undefined &&
      (typeof body.pricePurchasedCredits !== "number" || !Number.isSafeInteger(body.pricePurchasedCredits) ||
       body.pricePurchasedCredits < 0 || body.pricePurchasedCredits > 1_000_000_000))
    return NextResponse.json({ error: "Invalid purchased-credit price" }, { status: 400 });
  if (body.stock !== undefined && body.stock !== null &&
      (typeof body.stock !== "number" || !Number.isSafeInteger(body.stock) || body.stock < 0 || body.stock > 1_000_000))
    return NextResponse.json({ error: "Invalid stock" }, { status: 400 });
  if (body.status !== undefined && !["draft", "active", "paused", "removed"].includes(String(body.status)))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  try {
    const sql = getDb();
    const rows = await sql`
      UPDATE virtual_marketplace_listings SET
        title = COALESCE(${body.title === undefined ? null : (body.title as string).trim()}, title),
        description = COALESCE(${body.description === undefined ? null : (body.description as string).trim()}, description),
        item_type = COALESCE(${body.itemType ?? null}, item_type),
        asset_key = CASE WHEN ${Object.hasOwn(body, "assetKey")} THEN ${body.assetKey ?? null} ELSE asset_key END,
        price_purchased_credits = COALESCE(${body.pricePurchasedCredits ?? null}, price_purchased_credits),
        stock = CASE WHEN ${Object.hasOwn(body, "stock")} THEN ${body.stock ?? null} ELSE stock END,
        status = COALESCE(${body.status ?? null}, status),
        updated_at = NOW()
      WHERE id = ${listingId}::uuid AND seller_user_id = ${session.id}::uuid
      RETURNING id, title, description, item_type AS "itemType", asset_key AS "assetKey",
        price_purchased_credits AS "pricePurchasedCredits", stock, status, updated_at AS "updatedAt"
    `;
    if (!rows.length) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    return NextResponse.json({ listing: rows[0] }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Marketplace listing update failed", error);
    return NextResponse.json({ error: "Listing could not be updated" }, { status: 503 });
  }
}
