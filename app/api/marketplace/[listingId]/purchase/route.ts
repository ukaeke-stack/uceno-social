import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { listingId } = await context.params;
  if (!UUID.test(listingId)) return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });

  let body: { quantity?: unknown; idempotencyKey?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const quantity = body.quantity === undefined ? 1 : body.quantity;
  const key = body.idempotencyKey;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000 ||
      typeof key !== "string" || !/^[A-Za-z0-9._:-]{16,100}$/.test(key)) {
    return NextResponse.json({ error: "A valid quantity and idempotencyKey are required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const result = await sql`
      SELECT purchase_virtual_marketplace_listing(
        ${session.id}::uuid, ${listingId}::uuid, ${quantity}, ${key}
      ) AS order
    `;
    const order = result[0]?.order;
    if (!order) throw new Error("Purchase function returned no order");
    return NextResponse.json({ order }, {
      status: order.replayed ? 200 : 201,
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "invalid_quantity", "invalid_idempotency_key", "idempotency_key_reused",
      "listing_unavailable", "cannot_buy_own_listing", "insufficient_stock",
      "purchase_total_overflow", "insufficient_purchased_credits"
    ];
    const code = known.find(value => message.includes(value));
    if (code) {
      const status = code === "insufficient_purchased_credits" ? 402 :
        code === "listing_unavailable" || code === "insufficient_stock" ? 409 : 400;
      return NextResponse.json({ error: code }, { status });
    }
    console.error("Marketplace purchase failed", error);
    return NextResponse.json({ error: "Marketplace purchase service is not configured. Apply migration 016." }, { status: 503 });
  }
}
