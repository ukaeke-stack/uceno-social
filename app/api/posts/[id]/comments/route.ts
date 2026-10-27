import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
const idSchema = z.string().uuid();
const commentSchema = z.object({ body: z.string().trim().min(1, "A comment cannot be empty").max(2000) });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT c.id, c.body, c.created_at AS "createdAt", u.display_name AS "displayName", u.handle
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ${id}::uuid
      ORDER BY c.created_at ASC LIMIT 100
    `;
    return NextResponse.json({ comments: rows });
  } catch (error) {
    console.error("UCENO comments read error", error);
    return NextResponse.json({ error: "Comments are temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to comment" }, { status: 401 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  try {
    const input = commentSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid comment" }, { status: 400 });
    const sql = getDb();
    const rows = await sql`
      INSERT INTO comments (post_id, user_id, body)
      SELECT ${id}::uuid, ${session.id}::uuid, ${input.data.body}
      WHERE EXISTS (SELECT 1 FROM posts WHERE id = ${id}::uuid AND visibility = 'public')
      RETURNING id, body, created_at AS "createdAt"
    `;
    if (!rows.length) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const owner = await sql`SELECT user_id FROM posts WHERE id = ${id}::uuid LIMIT 1`;
    if (owner[0]?.user_id) await createNotification({ recipientId: String(owner[0].user_id), actorId: session.id, type: "comment", entityId: id, message: session.handle + " commented on your post" });
    return NextResponse.json({ comment: { ...rows[0], handle: session.handle, displayName: session.displayName } }, { status: 201 });
  } catch (error) {
    console.error("UCENO comment create error", error);
    return NextResponse.json({ error: "Could not publish comment" }, { status: 503 });
  }
}
