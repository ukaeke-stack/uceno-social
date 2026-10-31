import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
const idSchema = z.string().uuid();
const commentSchema = z.object({ body: z.string().trim().min(1, "A comment cannot be empty").max(2000), parentCommentId: z.string().uuid().optional().nullable() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  try {
    const sql = getDb();
    const session = await readSession();
    const rows = await sql`
      SELECT c.id, c.body, c.parent_comment_id AS "parentCommentId", c.created_at AS "createdAt", u.display_name AS "displayName", u.handle,
        (SELECT COUNT(*)::int FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes
      FROM comments c JOIN users u ON u.id = c.user_id AND u.moderation_status = 'active'
      WHERE c.post_id = ${id}::uuid AND c.moderation_removed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM posts p JOIN users owner ON owner.id = p.user_id AND owner.moderation_status = 'active'
          WHERE p.id = c.post_id AND p.visibility = 'public' AND p.moderation_removed_at IS NULL
        )
        AND (${session?.id ?? null}::uuid IS NULL OR NOT EXISTS (
          SELECT 1 FROM user_blocks b WHERE (b.blocker_id = ${session?.id ?? null}::uuid AND b.blocked_id = c.user_id) OR (b.blocker_id = c.user_id AND b.blocked_id = ${session?.id ?? null}::uuid)
        ))
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
    const parentCommentId = input.data.parentCommentId ?? null;
    const postOwner = await sql`SELECT p.user_id FROM posts p JOIN users owner ON owner.id = p.user_id AND owner.moderation_status = 'active'
      WHERE p.id = ${id}::uuid AND p.visibility = 'public' AND p.moderation_removed_at IS NULL LIMIT 1`;
    if (!postOwner.length) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const blocked = await sql`SELECT 1 FROM user_blocks WHERE (blocker_id = ${session.id}::uuid AND blocked_id = ${postOwner[0].user_id}::uuid) OR (blocker_id = ${postOwner[0].user_id}::uuid AND blocked_id = ${session.id}::uuid) LIMIT 1`;
    if (blocked.length) return NextResponse.json({ error: "You cannot comment on this post" }, { status: 403 });
    if (parentCommentId) {
      const parent = await sql`SELECT id FROM comments WHERE id = ${parentCommentId}::uuid AND post_id = ${id}::uuid AND moderation_removed_at IS NULL LIMIT 1`;
      if (!parent.length) return NextResponse.json({ error: "Reply target was not found on this post" }, { status: 404 });
    }
    const rows = await sql`
      INSERT INTO comments (post_id, user_id, body, parent_comment_id)
      SELECT ${id}::uuid, ${session.id}::uuid, ${input.data.body}, ${parentCommentId}::uuid
      WHERE EXISTS (
        SELECT 1 FROM posts p JOIN users owner ON owner.id = p.user_id AND owner.moderation_status = 'active'
        WHERE p.id = ${id}::uuid AND p.visibility = 'public' AND p.moderation_removed_at IS NULL
      )
      RETURNING id, body, parent_comment_id AS "parentCommentId", created_at AS "createdAt"
    `;
    if (!rows.length) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const profile = await sql`SELECT display_name AS "displayName" FROM users WHERE id = ${session.id}::uuid LIMIT 1`;
    const owner = await sql`SELECT user_id FROM posts WHERE id = ${id}::uuid LIMIT 1`;
    if (owner[0]?.user_id) await createNotification({ recipientId: String(owner[0].user_id), actorId: session.id, type: "comment", entityId: id, message: session.handle + " commented on your post" });
    return NextResponse.json({ comment: { ...rows[0], likes: 0, handle: session.handle, displayName: profile[0]?.displayName ?? session.handle } }, { status: 201 });
  } catch (error) {
    console.error("UCENO comment create error", error);
    return NextResponse.json({ error: "Could not publish comment" }, { status: 503 });
  }
}
