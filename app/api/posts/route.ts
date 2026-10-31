import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const createPostSchema = z.object({
  body: z.string().trim().max(5000).default(""),
  mediaUrl: z.string().url().optional().nullable(),
  mediaType: z.enum(["image", "video"]).optional().nullable(),
}).refine((value) => Boolean(value.body || value.mediaUrl), { message: "A post needs text or media" })
  .refine((value) => Boolean(value.mediaUrl) === Boolean(value.mediaType), { message: "Media URL and type must be provided together" });

function isOwnedCloudinaryAsset(urlValue: string, mediaType: "image" | "video", userId: string) {
  try {
    const url = new URL(urlValue);
    const resourcePath = mediaType === "video" ? "/video/upload/" : "/image/upload/";
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com"
      && url.pathname.includes(resourcePath)
      && url.pathname.includes("/uceno/" + userId + "/");
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const session = await readSession();
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") || 20);
    const feed = url.searchParams.get("feed") === "following" ? "following" : "all";
    const rawPostId = url.searchParams.get("id");
    const postId = rawPostId && z.string().uuid().safeParse(rawPostId).success ? rawPostId : null;
    if (rawPostId && !postId) return NextResponse.json({ error: "Invalid post ID" }, { status: 400 });
    if (feed === "following" && !session) return NextResponse.json({ error: "Sign in to view posts from people you follow" }, { status: 401 });
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 20;
    const sql = getDb();
    const rows = await sql`
      SELECT p.id, p.body, p.media_url AS "mediaUrl", p.media_type AS "mediaType", p.created_at AS "createdAt",
        u.display_name AS "displayName", u.handle,
        COALESCE(l.like_count, 0)::int AS likes,
        COALESCE(c.comment_count, 0)::int AS comments,
        CASE WHEN ${session?.id ?? null}::uuid IS NULL THEN false
             ELSE EXISTS (SELECT 1 FROM post_likes mine WHERE mine.post_id = p.id AND mine.user_id = ${session?.id ?? null}::uuid)
        END AS "likedByMe"
      FROM posts p
      JOIN users u ON u.id = p.user_id AND u.moderation_status = 'active'
      LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM post_likes GROUP BY post_id) l ON l.post_id = p.id
      LEFT JOIN (SELECT post_id, COUNT(*) AS comment_count FROM comments GROUP BY post_id) c ON c.post_id = p.id
      WHERE p.visibility = 'public' AND p.moderation_removed_at IS NULL
        AND (
          ${session?.id ?? null}::uuid IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM user_blocks b
            WHERE (b.blocker_id = ${session?.id ?? null}::uuid AND b.blocked_id = p.user_id)
               OR (b.blocker_id = p.user_id AND b.blocked_id = ${session?.id ?? null}::uuid)
          )
        )
        AND (${postId}::uuid IS NULL OR p.id = ${postId}::uuid)
        AND (
          ${feed} = 'all'
          OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${session?.id ?? null}::uuid AND f.following_id = p.user_id)
          OR p.user_id = ${session?.id ?? null}::uuid
        )
      ORDER BY p.created_at DESC
      LIMIT ${postId ? 1 : limit}
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
    if (input.data.mediaUrl && input.data.mediaType && !isOwnedCloudinaryAsset(input.data.mediaUrl, input.data.mediaType, session.id)) {
      return NextResponse.json({ error: "Media must be uploaded to your UCENO Cloudinary folder before publishing" }, { status: 400 });
    }
    const sql = getDb();
    const rows = await sql`
      INSERT INTO posts (user_id, body, visibility, media_url, media_type)
      VALUES (${session.id}::uuid, ${input.data.body}, 'public', ${input.data.mediaUrl ?? null}, ${input.data.mediaType ?? null})
      RETURNING id, body, media_url AS "mediaUrl", media_type AS "mediaType", created_at AS "createdAt"
    `;
    return NextResponse.json({ post: { ...rows[0], handle: session.handle, likes: 0, comments: 0 } }, { status: 201 });
  } catch (error) {
    console.error("UCENO create post error", error);
    return NextResponse.json({ error: "Could not publish this post. Check server configuration." }, { status: 503 });
  }
}
