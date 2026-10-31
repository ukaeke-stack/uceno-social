import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
export const runtime = "nodejs";
export async function GET() {
 const session=await readSession();
 if(!session) return NextResponse.json({error:"Moderator access required"},{status:403});
 try {
  const sql=getDb(), ids=(process.env.UCENO_MODERATOR_IDS||"").split(",").map(v=>v.trim()).filter(Boolean);
  const grant=await sql`SELECT revoked_at AS "revokedAt" FROM moderator_access WHERE user_id=${session.id}::uuid LIMIT 1`;
  const allowed=grant.length?!grant[0].revokedAt:ids.includes(session.id);
  if(!allowed) return NextResponse.json({error:"Moderator access required"},{status:403});
  const actions=await sql`
   SELECT ma.id,ma.target_type AS "targetType",ma.target_id AS "targetId",ma.action,ma.reason,
    ma.duration_days AS "durationDays",ma.created_at AS "createdAt",moderator.handle AS "moderatorHandle",
    target_user.handle AS "targetHandle",ma.report_id AS "reportId"
   FROM moderation_actions ma JOIN users moderator ON moderator.id=ma.moderator_id
   LEFT JOIN users target_user ON ma.target_type='user' AND target_user.id=ma.target_id
   ORDER BY ma.created_at DESC LIMIT 250
  `;
  return NextResponse.json({actions});
 } catch(e) { console.error("Moderation audit error",e); return NextResponse.json({error:"Audit history unavailable. Confirm migrations 013 and 014."},{status:503}); }
}
