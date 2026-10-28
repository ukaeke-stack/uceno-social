import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const normalizedHandle = handle.toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalizedHandle)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const users = await sql`
      SELECT u.id, u.display_name AS "displayName", u.handle, u.created_at AS "joinedAt",
        (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers,
        (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following,
        (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND p.visibility = 'public') AS "postCount"
      FROM users u WHERE u.handle = ${normalizedHandle} LIMIT 1
    `;
    if (!users.length) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const session = await readSession();
    let isFollowing = false;
    if (session && session.id !== users[0].id) {
      const follows = await sql`SELECT 1 FROM follows WHERE follower_id = ${session.id}::uuid AND following_id = ${users[0].id}::uuid LIMIT 1`;
      isFollowing = follows.length > 0;
    }

    const posts = await sql`
      SELECT p.id, p.body, p.media_url AS "mediaUrl", p.media_type AS "mediaType", p.created_at AS "createdAt",
        (SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id = p.id) AS likes,
        (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comments
      FROM posts p
      WHERE p.user_id = ${users[0].id}::uuid AND p.visibility = 'public'
      ORDER BY p.created_at DESC LIMIT 20
    `;

    return NextResponse.json({ profile: { ...users[0], isFollowing }, posts });
  } catch (error) {
    console.error("UCENO profile read error", error);
    return NextResponse.json({ error: "Profile is temporarily unavailable" }, { status: 503 });
  }
}
