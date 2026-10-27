import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
const idSchema = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to like posts" }, { status: 401 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  try {
    const sql = getDb();
    const rows = await sql`
      WITH removed AS (
        DELETE FROM post_likes WHERE post_id = ${id}::uuid AND user_id = ${session.id}::uuid RETURNING 1
      ), inserted AS (
        INSERT INTO post_likes (post_id, user_id)
        SELECT ${id}::uuid, ${session.id}::uuid
        WHERE NOT EXISTS (SELECT 1 FROM removed)
        ON CONFLICT (post_id, user_id) DO NOTHING
        RETURNING 1
      )
      SELECT EXISTS (SELECT 1 FROM inserted) AS liked
    `;
    const liked = Boolean(rows[0]?.liked);
    if (liked) {
      const owner = await sql`SELECT user_id FROM posts WHERE id = ${id}::uuid LIMIT 1`;
      if (owner[0]?.user_id) await createNotification({ recipientId: String(owner[0].user_id), actorId: session.id, type: "like", entityId: id, message: session.handle + " liked your post" });
    }
    return NextResponse.json({ liked });
  } catch (error) {
    console.error("UCENO like error", error);
    return NextResponse.json({ error: "Could not update like. Check server configuration." }, { status: 503 });
  }
}
