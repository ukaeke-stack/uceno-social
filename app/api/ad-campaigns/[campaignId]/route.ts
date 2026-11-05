import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Advertisers may edit drafts, submit them for review, or pause their own campaigns.
// They cannot approve, activate, reject or complete campaigns themselves.
export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { campaignId } = await context.params;
  if (!UUID.test(campaignId)) return NextResponse.json({ error: "Invalid campaignId" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected object");
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "status" ||
      !["pending_review", "paused"].includes(String(body.status))) {
    return NextResponse.json({ error: "Only submit-for-review or pause actions are supported" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const result = await sql`
      UPDATE virtual_ad_campaigns
      SET status = ${body.status as string},
          review_status = CASE WHEN ${body.status as string} = 'pending_review' THEN 'pending' ELSE review_status END,
          reviewed_at = CASE WHEN ${body.status as string} = 'pending_review' THEN NULL ELSE reviewed_at END,
          reviewer_user_id = CASE WHEN ${body.status as string} = 'pending_review' THEN NULL ELSE reviewer_user_id END,
          review_note = CASE WHEN ${body.status as string} = 'pending_review' THEN NULL ELSE review_note END
      WHERE id = ${campaignId}::uuid
        AND advertiser_user_id = ${session.id}::uuid
        AND (
          (${body.status as string} = 'pending_review' AND status = 'draft') OR
          (${body.status as string} = 'paused' AND status = 'active')
        )
      RETURNING id, status, payment_source AS "paymentSource",
        budget_minor AS "budgetAmount", budget_unit AS "budgetUnit"
    `;
    if (!result.length) {
      const exists = await sql`
        SELECT id FROM virtual_ad_campaigns
        WHERE id = ${campaignId}::uuid AND advertiser_user_id = ${session.id}::uuid LIMIT 1
      `;
      return NextResponse.json({ error: exists.length ? "Campaign state does not allow this action" : "Campaign not found" },
        { status: exists.length ? 409 : 404 });
    }
    return NextResponse.json({ campaign: result[0], billing: { charged: false } },
      { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Advertiser campaign update failed", error);
    return NextResponse.json({ error: "Campaign could not be updated. Apply migration 018." }, { status: 503 });
  }
}
