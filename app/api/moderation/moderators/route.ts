import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
export const runtime = "nodejs";
const envIds = () => (process.env.UCENO_MODERATOR_IDS || "").split(",").map(v => v.trim()).filter(Boolean);
async function access() {
 const session = await readSession();
 if (!session) return { session: null, admin: false, moderator: false };
 const sql = getDb();
 const rows = await sql`SELECT handle FROM users WHERE id = ${session.id}::uuid LIMIT 1`;
 const admin = String(rows[0]?.handle || "").toLowerCase() === "ukaeke" && envIds().includes(session.id);
 const grants = await sql`SELECT revoked_at AS "revokedAt" FROM moderator_access WHERE user_id = ${session.id}::uuid LIMIT 1`;
 const moderator = admin || (grants.length ? !grants[0].revokedAt : envIds().includes(session.id));
 return { session, admin, moderator };
}
export async function GET() {
 try {
  const a = await access();
  if (!a.moderator) return NextResponse.json({ error: "Moderator access required" }, { status: 403 });
  if (!a.admin) return NextResponse.json({ error: "Moderator administrator access required" }, { status: 403 });
  const sql = getDb(), ids = envIds();
  const moderators = await sql`
   SELECT u.id, u.handle, u.display_name AS "displayName", COALESCE(ma.granted_at,u.created_at) AS "grantedAt", grantor.handle AS "grantedBy"
   FROM users u LEFT JOIN moderator_access ma ON ma.user_id=u.id LEFT JOIN users grantor ON grantor.id=ma.granted_by
   WHERE (ma.user_id IS NOT NULL AND ma.revoked_at IS NULL) OR (u.id=ANY(${ids}::uuid[]) AND ma.user_id IS NULL)
   ORDER BY CASE WHEN lower(u.handle)='ukaeke' THEN 0 ELSE 1 END,u.handle
  `;
  return NextResponse.json({ moderators, admin: true });
 } catch (e) { console.error("Moderator list error",e); return NextResponse.json({error:"Moderator management unavailable. Apply migration 014."},{status:503}); }
}
export async function POST(request: Request) {
 try {
  const a=await access();
  if(!a.admin || !a.session) return NextResponse.json({error:"Only the primary moderator can add moderators"},{status:403});
  const parsed=z.object({handle:z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/)}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Enter a valid UCENO username"},{status:400});
  const sql=getDb(), users=await sql`SELECT id,handle FROM users WHERE lower(handle)=lower(${parsed.data.handle}) LIMIT 1`;
  if(!users.length) return NextResponse.json({error:"No registered UCENO account has that username"},{status:404});
  if(users[0].id===a.session.id) return NextResponse.json({error:"The primary moderator is already protected"},{status:400});
  await sql`INSERT INTO moderator_access(user_id,granted_by,granted_at,revoked_at,revoked_by)
   VALUES(${users[0].id}::uuid,${a.session.id}::uuid,NOW(),NULL,NULL)
   ON CONFLICT(user_id) DO UPDATE SET granted_by=EXCLUDED.granted_by,granted_at=NOW(),revoked_at=NULL,revoked_by=NULL`;
  return NextResponse.json({success:true,moderator:{id:users[0].id,handle:users[0].handle}});
 } catch(e) { console.error("Moderator grant error",e); return NextResponse.json({error:"Could not add moderator. Confirm migration 014 is applied."},{status:503}); }
}
export async function DELETE(request: Request) {
 try {
  const a=await access();
  if(!a.admin || !a.session) return NextResponse.json({error:"Only the primary moderator can remove moderators"},{status:403});
  const parsed=z.object({userId:z.string().uuid()}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"A valid moderator account is required"},{status:400});
  if(parsed.data.userId===a.session.id) return NextResponse.json({error:"The primary moderator cannot remove their own access"},{status:400});
  const sql=getDb(), target=await sql`SELECT id,handle FROM users WHERE id=${parsed.data.userId}::uuid LIMIT 1`;
  if(!target.length) return NextResponse.json({error:"Moderator not found"},{status:404});
  await sql`INSERT INTO moderator_access(user_id,granted_by,revoked_at,revoked_by)
   VALUES(${parsed.data.userId}::uuid,${a.session.id}::uuid,NOW(),${a.session.id}::uuid)
   ON CONFLICT(user_id) DO UPDATE SET revoked_at=NOW(),revoked_by=EXCLUDED.revoked_by`;
  return NextResponse.json({success:true,removed:target[0]});
 } catch(e) { console.error("Moderator revoke error",e); return NextResponse.json({error:"Could not remove moderator. Confirm migration 014 is applied."},{status:503}); }
}
