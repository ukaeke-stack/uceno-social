import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

// Read-only wallet endpoint. Balance changes are deliberately not accepted here.
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT earned_balance AS "earnedBalance",
             purchased_balance AS "purchasedBalance",
             updated_at AS "updatedAt"
      FROM uceno_credit_accounts
      WHERE user_id = ${session.id}::uuid
    `;
    const ledger = await sql`
      SELECT id, credit_type AS "creditType", amount, reason,
             reference_type AS "referenceType", reference_id AS "referenceId",
             created_at AS "createdAt"
      FROM uceno_credit_ledger
      WHERE user_id = ${session.id}::uuid
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `;
    const wallet = rows[0] ?? { earnedBalance: 0, purchasedBalance: 0, updatedAt: null };
    return NextResponse.json({ wallet, ledger }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Credit wallet read failed", error);
    return NextResponse.json({ error: "Credit wallet is not configured. Apply migration 015." }, { status: 503 });
  }
}
