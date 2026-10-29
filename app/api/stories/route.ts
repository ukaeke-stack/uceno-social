import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

const storySchema = z.object({
  body: z.string().trim().max(500).optional().default(""),
  mediaUrl: z.string().url().nullable().optional(),
  mediaType: z.enum(["image"]).optional(),
}).refine(
  value => Boolean(value.body || value.mediaUrl),
  { message: "Add text or a picture to your moment" },
).refine(
  value => Boolean(value.mediaUrl) === Boolean(value.mediaType),
  { message: "Picture details are incomplete" },
);

export async function GET() {
  try {
    const sql = getDb();
    // Schema changes belong in reviewed migrations, not the runtime request path.
    // The production stories table already has media_url and media_type.
    const stories = await sql`
      SELECT s.id, s.body, s.media_url AS "mediaUrl", s.media_type AS "mediaType", s.created_at AS "createdAt", s.expires_at AS "expiresAt",
             u.display_name AS "displayName", u.handle
      FROM stories s JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > NOW()
      ORDER BY s.created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ stories });
  } catch (error) {
    console.error("UCENO stories read error", error);
    return NextResponse.json({ error: "Stories are temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to share a story" }, { status: 401 });
  try {
    const parsed = storySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid story" }, { status: 400 });
    const sql = getDb();
    const rows = await sql`
      INSERT INTO stories (user_id, body, media_url, media_type)
      VALUES (${session.id}::uuid, ${parsed.data.body}, ${parsed.data.mediaUrl ?? null}, ${parsed.data.mediaType ?? null})
      RETURNING id, body, media_url AS "mediaUrl", media_type AS "mediaType", created_at AS "createdAt", expires_at AS "expiresAt"
    `;
    const userRows = await sql`SELECT display_name AS "displayName", handle FROM users WHERE id = ${session.id}::uuid LIMIT 1`;
    return NextResponse.json({ story: { ...rows[0], ...userRows[0] } }, { status: 201 });
  } catch (error) {
    console.error("UCENO story create error", error);
    return NextResponse.json({ error: "Could not publish story" }, { status: 503 });
  }
}
