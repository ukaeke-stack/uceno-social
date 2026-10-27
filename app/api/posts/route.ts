import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const createPostSchema = z.object({
  body: z.string().trim().min(1, "A post cannot be empty").max(5000),
});

export async function GET(request: Request) {
  try {
    const session = await readSession();
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") || 20);
    const feed = url.searchParams.get("feed") === "following" ? "following" : "all";
    if (feed === "following" && !session) return NextResponse.json({ error: "Sign in to view posts from people you follow" }, { status: 401 });
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 20;
    const sql = getDb();
    const rows = await sql`
      SELECT p.id, p.body, p.created_at AS "createdAt",
        u.display_name AS "displayName", u.handle,
        COALESCE(l.like_count, 0)::int AS likes,
        COALESCE(c.comment_count, 0)::int AS comments,
        CASE WHEN ${session?.id ?? null}::uuid IS NULL THEN false
             ELSE EXISTS (SELECT 1 FROM post_likes mine WHERE mine.post_id = p.id AND mine.user_id = ${session?.id ?? null}::uuid)
        END AS "likedByMe"
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM post_likes GROUP BY post_id) l ON l.post_id = p.id
      LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM comments GROUP BY post_id) c ON c.post_id = p.id
      WHERE p.visibility = 'public'
        AND (
          ${feed} = 'all'
          OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${session?.id ?? null}::uuid AND f.following_id = p.user_id)
          OR p.user_id = ${session?.id ?? null}::uuid
        )
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ posts: rows });
  } catch (error) {
    console.error("UCENO feed error", error);
    return NextResponse.json({ error: "Feed is temporarily unavailable. Check server configuration." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to publish a post" }, { status: 401 });
  try {
    const input = createPostSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid post" }, { status: 400 });
    const sql = getDb();
    const rows = await sql`
      INSERT INTO posts (user_id, body, visibility)
      VALUES (${session.id}::uuid, ${input.data.body}, 'public')
      RETURNING id, body, created_at AS "createdAt"
    `;
    return NextResponse.json({ post: { ...rows[0], handle: session.handle, likes: 0, comments: 0 } }, { status: 201 });
  } catch (error) {
    console.error("UCENO create post error", error);
    return NextResponse.json({ error: "Could not publish this post. Check server configuration." }, { status: 503 });
  }
}
