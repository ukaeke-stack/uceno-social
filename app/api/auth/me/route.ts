import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
export const runtime = "nodejs";
export async function GET() {
 const session=await readSession();
 if(!session) return NextResponse.json({user:null});
 try {
  const sql=getDb();
  const rows=await sql`SELECT id,display_name AS "displayName",handle,email,phone,created_at AS "createdAt" FROM users WHERE id=${session.id} LIMIT 1`;
  const allowed=(process.env.UCENO_MODERATOR_IDS||"").split(",").map(v=>v.trim()).filter(Boolean);
  const grants=await sql`SELECT revoked_at AS "revokedAt" FROM moderator_access WHERE user_id=${session.id}::uuid LIMIT 1`;
  const isModerator=grants.length?!grants[0].revokedAt:allowed.includes(session.id);
  const isModeratorAdmin=Boolean(rows[0] && String(rows[0].handle).toLowerCase()==="ukaeke" && allowed.includes(session.id));
  return NextResponse.json({user:rows[0]?{...rows[0],isModerator,isModeratorAdmin}:null});
 } catch(e) { console.error("UCENO session lookup error",e); return NextResponse.json({error:"Unable to load account. Confirm migration 014 is applied."},{status:503}); }
}
