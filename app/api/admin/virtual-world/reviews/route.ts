import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlatformReviewer(userId: string) {
  const configured = (process.env.ADMIN_USER_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  return configured.some(id => UUID.test(id) && id.toLowerCase() === userId.toLowerCase());
}

async function reviewer() {
  const session = await readSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  if (!isPlatformReviewer(session.id))
    return { response: NextResponse.json({ error: "Platform review access is not granted" }, { status: 403 }) };
  return { session };
}

// GET returns only pending campaign and dispute review queues.
export async function GET() {
  const auth = await reviewer();
  if (auth.response) return auth.response;
  try {
    const sql = getDb();
    const [campaigns, disputes] = await Promise.all([
      sql`SELECT id, advertiser_user_id AS "advertiserUserId", name,
        creative_asset_key AS "creativeAssetKey", destination_url AS "destinationUrl",
        payment_source AS "paymentSource", budget_minor AS "budgetAmount",
        budget_unit AS "budgetUnit", review_status AS "reviewStatus",
        created_at AS "createdAt"
        FROM virtual_ad_campaigns WHERE review_status = 'pending'
        ORDER BY created_at ASC LIMIT 100`,
      sql`SELECT id, buyer_user_id AS "buyerUserId", seller_user_id AS "sellerUserId",
        listing_id AS "listingId", total_purchased_credits AS "amountPurchasedCredits",
        dispute_reason AS "disputeReason", disputed_at AS "disputedAt",
        dispute_review_status AS "reviewStatus"
        FROM virtual_marketplace_orders
        WHERE fulfillment_status = 'disputed'
          AND dispute_review_status IN ('pending','under_review')
        ORDER BY disputed_at ASC LIMIT 100`
    ]);
    return NextResponse.json({ campaigns, disputes }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Platform review queue failed", error);
    return NextResponse.json({ error: "Review queue unavailable. Apply migration 019." }, { status: 503 });
  }
}

// PATCH decisions are metadata-only. No campaign activation or financial action is possible here.
export async function PATCH(request: NextRequest) {
  const auth = await reviewer();
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected object");
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { type, id, decision, note } = body;
  if ((type !== "campaign" && type !== "dispute") || typeof id !== "string" || !UUID.test(id) ||
      typeof decision !== "string" ||
      (type === "campaign" && !["approve", "reject"].includes(decision)) ||
      (type === "dispute" && !["start_review", "mark_reviewed"].includes(decision)) ||
      (note !== undefined && (typeof note !== "string" || note.trim().length > 1000))) {
    return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
  }
  const reviewerId = auth.session.id;
  const reviewNote = typeof note === "string" ? note.trim() : null;

  try {
    const sql = getDb();
    if (type === "campaign") {
      const reviewStatus = decision === "approve" ? "approved" : "rejected";
      const rows = await sql`
        UPDATE virtual_ad_campaigns
        SET review_status = ${reviewStatus},
            reviewed_at = NOW(), reviewer_user_id = ${reviewerId}::uuid,
            review_note = ${reviewNote}
        WHERE id = ${id}::uuid AND review_status = 'pending'
          AND status = 'pending_review'
        RETURNING id, review_status AS "reviewStatus", status,
          reviewed_at AS "reviewedAt"
      `;
      if (!rows.length) return NextResponse.json({ error: "Campaign not found or no longer pending" }, { status: 409 });
      return NextResponse.json({
        campaign: rows[0],
        billing: { charged: false },
        serving: { activated: false, note: "Approval does not activate the campaign. Payment verification and ad-serving controls are not implemented." }
      }, { headers: { "Cache-Control": "no-store, private" } });
    }

    const reviewStatus = decision === "start_review" ? "under_review" : "reviewed";
    const rows = await sql`
      UPDATE virtual_marketplace_orders
      SET dispute_review_status = ${reviewStatus},
          dispute_reviewed_at = CASE WHEN ${reviewStatus} = 'reviewed' THEN NOW() ELSE dispute_reviewed_at END,
          dispute_reviewer_user_id = ${reviewerId}::uuid,
          dispute_review_note = ${reviewNote}
      WHERE id = ${id}::uuid AND fulfillment_status = 'disputed'
        AND dispute_review_status IN ('pending','under_review')
      RETURNING id, fulfillment_status AS "fulfillmentStatus",
        dispute_review_status AS "reviewStatus",
        dispute_reviewed_at AS "reviewedAt"
    `;
    if (!rows.length) return NextResponse.json({ error: "Dispute not found or no longer reviewable" }, { status: 409 });
    return NextResponse.json({
      dispute: rows[0],
      escrow: { released: false, refunded: false, note: "Review records the administrative assessment only. Financial resolution requires a separately approved policy and implementation." }
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Platform review action failed", error);
    return NextResponse.json({ error: "Review action unavailable. Apply migration 019." }, { status: 503 });
  }
}
