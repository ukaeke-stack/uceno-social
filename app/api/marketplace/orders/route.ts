import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

// Signed-in users can inspect orders where they are buyer or seller.
// Escrowed orders are not proof of delivery or seller payout.
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const role = request.nextUrl.searchParams.get("role") ?? "all";
  if (!["all", "buyer", "seller"].includes(role))
    return NextResponse.json({ error: "role must be all, buyer or seller" }, { status: 400 });

  try {
    const sql = getDb();
    const orders = await sql`
      SELECT o.id, o.listing_id AS "listingId",
             l.title AS "listingTitle", o.quantity,
             o.unit_price_purchased_credits AS "unitPricePurchasedCredits",
             o.total_purchased_credits AS "totalPurchasedCredits",
             o.status, o.fulfillment_status AS "fulfillmentStatus",\n             o.seller_delivered_at AS "sellerDeliveredAt",\n             o.buyer_confirmed_at AS "buyerConfirmedAt",\n             o.disputed_at AS "disputedAt", o.dispute_reason AS "disputeReason",\n             o.created_at AS "createdAt", o.updated_at AS "updatedAt",
             CASE WHEN o.buyer_user_id = ${session.id}::uuid THEN 'buyer' ELSE 'seller' END AS "myRole"
      FROM virtual_marketplace_orders o
      LEFT JOIN virtual_marketplace_listings l ON l.id = o.listing_id
      WHERE (${role} = 'all' AND (o.buyer_user_id = ${session.id}::uuid OR o.seller_user_id = ${session.id}::uuid))
         OR (${role} = 'buyer' AND o.buyer_user_id = ${session.id}::uuid)
         OR (${role} = 'seller' AND o.seller_user_id = ${session.id}::uuid)
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 100
    `;
    return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Marketplace order history failed", error);
    return NextResponse.json({ error: "Order history is unavailable. Apply migration 016." }, { status: 503 });
  }
}
