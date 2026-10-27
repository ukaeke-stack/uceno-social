import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
const idSchema = z.string().uuid();

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to repost" }, { status: 401 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  try {
    const sql = getDb();
    const visible = await sql`SELECT id, user_id FROM posts WHERE id = ${id}::uuid AND visibility = 'public' LIMIT 1`;
    if (!visible.length) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const existing = await sql`SELECT 1 FROM post_reposts WHERE post_id = ${id}::uuid AND user_id = ${session.id}::uuid`;
    let reposted: boolean;
    if (existing.length) {
      await sql`DELETE FROM post_reposts WHERE post_id = ${id}::uuid AND user_id = ${session.id}::uuid`;
      reposted = false;
    } else {
      await sql`INSERT INTO post_reposts (post_id, user_id) VALUES (${id}::uuid, ${session.id}::uuid) ON CONFLICT DO NOTHING`;
      reposted = true;
      await createNotification({ recipientId: String(visible[0].user_id), actorId: session.id, type: "repost", entityId: id, message: session.handle + " reposted your post" });
    }
    const rows = await sql`SELECT COUNT(*)::int AS count FROM post_reposts WHERE post_id = ${id}::uuid`;
    return NextResponse.json({ reposted, reposts: rows[0]?.count ?? 0 });
  } catch (error) {
    console.error("UCENO repost error", error);
    return NextResponse.json({ error: "Could not update repost" }, { status: 503 });
  }
}
