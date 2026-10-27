import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const storySchema = z.object({ body: z.string().trim().min(1).max(500) });

export async function GET() {
  try {
    const sql = getDb();
    const stories = await sql`
      SELECT s.id, s.body, s.created_at AS "createdAt", s.expires_at AS "expiresAt",
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
      INSERT INTO stories (user_id, body)
      VALUES (${session.id}::uuid, ${parsed.data.body})
      RETURNING id, body, created_at AS "createdAt", expires_at AS "expiresAt"
    `;
    return NextResponse.json({ story: { ...rows[0], displayName: session.displayName, handle: session.handle } }, { status: 201 });
  } catch (error) {
    console.error("UCENO story create error", error);
    return NextResponse.json({ error: "Could not publish story" }, { status: 503 });
  }
}
