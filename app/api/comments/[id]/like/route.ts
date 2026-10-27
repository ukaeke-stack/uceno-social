import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const idSchema = z.string().uuid();

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to like comments" }, { status: 401 });

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });

  try {
    const sql = getDb();
    const rows = await sql`
      WITH target AS (
        SELECT id FROM comments WHERE id = ${id}::uuid LIMIT 1
      ), removed AS (
        DELETE FROM comment_likes
        WHERE comment_id = ${id}::uuid AND user_id = ${session.id}::uuid
        RETURNING 1
      ), inserted AS (
        INSERT INTO comment_likes (comment_id, user_id)
        SELECT id, ${session.id}::uuid FROM target
        WHERE NOT EXISTS (SELECT 1 FROM removed)
        ON CONFLICT (comment_id, user_id) DO NOTHING
        RETURNING 1
      )
      SELECT EXISTS (SELECT 1 FROM target) AS "commentExists",
             EXISTS (SELECT 1 FROM inserted) AS liked,
             (SELECT COUNT(*)::int FROM comment_likes WHERE comment_id = ${id}::uuid) AS likes
    `;
    if (!rows[0]?.commentExists) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    return NextResponse.json({ liked: Boolean(rows[0].liked), likes: Number(rows[0].likes) });
  } catch (error) {
    console.error("UCENO comment like error", error);
    return NextResponse.json({ error: "Could not update comment like" }, { status: 503 });
  }
}
