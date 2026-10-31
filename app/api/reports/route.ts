import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const reportSchema = z.object({
  targetType: z.enum(["user", "post", "comment"]),
  targetId: z.string().uuid(),
  reason: z.enum(["spam", "harassment", "hate", "violence", "nudity", "scam", "impersonation", "other"]),
  details: z.string().trim().max(1000).default("")
});

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to report content" }, { status: 401 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid report" }, { status: 400 });
  const input = parsed.data;
  if (input.targetType === "user" && input.targetId === session.id) {
    return NextResponse.json({ error: "You cannot report your own account" }, { status: 400 });
  }
  try {
    const sql = getDb();
    const exists = input.targetType === "user"
      ? await sql`SELECT 1 FROM users WHERE id = ${input.targetId}::uuid LIMIT 1`
      : input.targetType === "post"
        ? await sql`SELECT 1 FROM posts WHERE id = ${input.targetId}::uuid LIMIT 1`
        : await sql`SELECT 1 FROM comments WHERE id = ${input.targetId}::uuid LIMIT 1`;
    if (!exists.length) return NextResponse.json({ error: "The reported item was not found" }, { status: 404 });
    const duplicate = await sql`SELECT id FROM user_reports WHERE reporter_id = ${session.id}::uuid AND target_type = ${input.targetType} AND target_id = ${input.targetId}::uuid AND status IN ('pending','reviewing') LIMIT 1`;
    if (duplicate.length) return NextResponse.json({ submitted: true, duplicate: true });
    const rows = await sql`
      INSERT INTO user_reports (reporter_id, target_type, target_id, reason, details)
      VALUES (${session.id}::uuid, ${input.targetType}, ${input.targetId}::uuid, ${input.reason}, ${input.details})
      RETURNING id, status, created_at AS "createdAt"
    `;
    return NextResponse.json({ report: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("UCENO report submission error", error);
    return NextResponse.json({ error: "Could not submit report. Apply migration 011_trust_safety.sql." }, { status: 503 });
  }
}
