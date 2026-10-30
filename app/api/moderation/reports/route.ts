import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const updateSchema = z.object({ reportId: z.string().uuid(), status: z.enum(["reviewing", "dismissed", "actioned"]) });

async function moderatorSession() {
  const session = await readSession();
  const allowed = (process.env.UCENO_MODERATOR_IDS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!session || !allowed.includes(session.id)) return null;
  return session;
}

export async function GET() {
  const session = await moderatorSession();
  if (!session) return NextResponse.json({ error: "Moderator access required" }, { status: 403 });
  try {
    const sql = getDb();
    const reports = await sql`
      SELECT r.id, r.target_type AS "targetType", r.target_id AS "targetId", r.reason, r.details,
        r.status, r.created_at AS "createdAt", r.reviewed_at AS "reviewedAt",
        reporter.handle AS "reporterHandle",
        CASE WHEN r.target_type = 'user' THEN target_user.handle
             WHEN r.target_type = 'post' THEN post_owner.handle
             ELSE comment_owner.handle END AS "targetHandle",
        CASE WHEN r.target_type = 'post' THEN LEFT(p.body, 240)
             WHEN r.target_type = 'comment' THEN LEFT(c.body, 240)
             ELSE NULL END AS "targetExcerpt"
      FROM user_reports r
      JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN users target_user ON r.target_type = 'user' AND target_user.id = r.target_id
      LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
      LEFT JOIN users post_owner ON post_owner.id = p.user_id
      LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
      LEFT JOIN users comment_owner ON comment_owner.id = c.user_id
      ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at ASC
      LIMIT 200
    `;
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("UCENO moderation queue error", error);
    return NextResponse.json({ error: "Moderation queue unavailable. Apply migration 011_trust_safety.sql." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const session = await moderatorSession();
  if (!session) return NextResponse.json({ error: "Moderator access required" }, { status: 403 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Provide a valid report ID and moderation status" }, { status: 400 });
  try {
    const sql = getDb();
    const rows = await sql`
      UPDATE user_reports SET status = ${input.data.status},
        reviewed_at = CASE WHEN ${input.data.status} = 'reviewing' THEN NULL ELSE NOW() END,
        reviewed_by = ${session.id}::uuid
      WHERE id = ${input.data.reportId}::uuid
      RETURNING id, status
    `;
    if (!rows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json({ report: rows[0] });
  } catch (error) {
    console.error("UCENO moderation update error", error);
    return NextResponse.json({ error: "Could not update report status" }, { status: 503 });
  }
}
