import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const inputSchema = z.object({ postId: z.string().uuid() });

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to view saved posts" }, { status: 401 });
  try {
    const sql = getDb();
    const posts = await sql`
      SELECT p.id, p.body, p.media_url AS "mediaUrl", p.media_type AS "mediaType", p.created_at AS "createdAt",
        u.display_name AS "displayName", u.handle,
        (SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id = p.id) AS likes,
        (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comments,
        b.created_at AS "savedAt"
      FROM post_bookmarks b JOIN posts p ON p.id = b.post_id JOIN users u ON u.id = p.user_id
      WHERE b.user_id = ${session.id}::uuid AND p.visibility = 'public'
        AND NOT EXISTS (SELECT 1 FROM user_blocks x WHERE (x.blocker_id = ${session.id}::uuid AND x.blocked_id = p.user_id) OR (x.blocker_id = p.user_id AND x.blocked_id = ${session.id}::uuid))
      ORDER BY b.created_at DESC LIMIT 100
    `;
    return NextResponse.json({ posts });
  } catch (error) {
    console.error("UCENO bookmarks read error", error);
    return NextResponse.json({ error: "Saved posts are unavailable. Apply migration 012_bookmarks.sql." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to save posts" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Provide a valid post ID" }, { status: 400 });
  try {
    const sql = getDb();
    const rows = await sql`INSERT INTO post_bookmarks (user_id, post_id) SELECT ${session.id}::uuid, id FROM posts WHERE id = ${input.data.postId}::uuid AND visibility = 'public' ON CONFLICT DO NOTHING RETURNING post_id`;
    if (!rows.length) {
      const exists = await sql`SELECT id FROM posts WHERE id = ${input.data.postId}::uuid AND visibility = 'public' LIMIT 1`;
      if (!exists.length) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("UCENO bookmark save error", error);
    return NextResponse.json({ error: "Could not save post. Apply migration 012_bookmarks.sql." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to remove saved posts" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Provide a valid post ID" }, { status: 400 });
  try {
    const sql = getDb();
    await sql`DELETE FROM post_bookmarks WHERE user_id = ${session.id}::uuid AND post_id = ${input.data.postId}::uuid`;
    return NextResponse.json({ saved: false });
  } catch (error) {
    console.error("UCENO bookmark removal error", error);
    return NextResponse.json({ error: "Could not remove saved post" }, { status: 503 });
  }
}
