import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Seller fulfilment, buyer receipt confirmation and dispute intake.
// These actions never settle escrow or transfer credits.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { orderId } = await context.params;
  if (!UUID.test(orderId)) return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });

  let body: { action?: unknown; reason?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const action = body.action;
  const reason = body.reason;
  if (!["seller_delivered", "buyer_confirm", "buyer_dispute"].includes(String(action))) {
    return NextResponse.json({ error: "Unsupported order action" }, { status: 400 });
  }
  if (action === "buyer_dispute" &&
      (typeof reason !== "string" || reason.trim().length < 10 || reason.length > 1000)) {
    return NextResponse.json({ error: "A dispute reason of 10 to 1000 characters is required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const result = await sql`
      SELECT transition_virtual_marketplace_order(
        ${session.id}::uuid, ${orderId}::uuid, ${action},
        ${action === "buyer_dispute" ? (reason as string).trim() : null}
      ) AS order
    `;
    const order = result[0]?.order;
    if (!order) throw new Error("Order transition returned no order");
    return NextResponse.json({ order }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "invalid_order_action", "invalid_dispute_reason", "order_not_found",
      "seller_only", "buyer_only", "order_not_escrowed",
      "invalid_fulfillment_transition", "delivery_not_confirmable", "dispute_not_allowed"
    ];
    const code = known.find(value => message.includes(value));
    if (code) {
      const status = code === "order_not_found" ? 404 :
        code === "seller_only" || code === "buyer_only" ? 403 :
        code === "order_not_escrowed" || code === "invalid_fulfillment_transition" ||
        code === "delivery_not_confirmable" || code === "dispute_not_allowed" ? 409 : 400;
      return NextResponse.json({ error: code }, { status });
    }
    console.error("Marketplace order action failed", error);
    return NextResponse.json({ error: "Order action service is unavailable. Apply migration 017." }, { status: 503 });
  }
}
