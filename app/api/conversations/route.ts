import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const createSchema = z.object({ handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/) });

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to view messages" }, { status: 401 });
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT c.id, c.type, c.title, c.created_at AS "createdAt",
        CASE WHEN lm.body LIKE 'UCENO_VOICE_NOTE:%' THEN 'Voice note' ELSE lm.body END AS "lastMessage", lm.created_at AS "lastMessageAt",
        COALESCE(members.member_count, 0)::int AS "memberCount",
        other_user.display_name AS "otherDisplayName", other_user.handle AS "otherHandle"
      FROM conversation_members mine
      JOIN conversations c ON c.id = mine.conversation_id
      LEFT JOIN LATERAL (
        SELECT body, created_at FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS member_count FROM conversation_members cm WHERE cm.conversation_id = c.id
      ) members ON true
      LEFT JOIN LATERAL (
        SELECT u.display_name, u.handle FROM conversation_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = c.id AND cm.user_id <> ${session.id}::uuid LIMIT 1
      ) other_user ON c.type = 'direct'
      WHERE mine.user_id = ${session.id}::uuid
      ORDER BY COALESCE(lm.created_at, c.created_at) DESC LIMIT 100
    `;
    return NextResponse.json({ conversations: rows });
  } catch (error) {
    console.error("UCENO conversations list error", error);
    return NextResponse.json({ error: "Messages are temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to start a conversation" }, { status: 401 });
  try {
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Enter a valid username" }, { status: 400 });
    const sql = getDb();
    const targets = await sql`SELECT id, handle FROM users WHERE handle = ${input.data.handle} LIMIT 1`;
    if (!targets.length) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const target = targets[0] as { id: string; handle: string };
    if (target.id === session.id) return NextResponse.json({ error: "You cannot message yourself" }, { status: 400 });
    const directKey = [session.id, target.id].sort().join(":");
    const conversations = await sql`
      INSERT INTO conversations (type, direct_key, created_by)
      VALUES ('direct', ${directKey}, ${session.id}::uuid)
      ON CONFLICT (direct_key) DO UPDATE SET updated_at = NOW()
      RETURNING id, type, created_at AS "createdAt"
    `;
    const conversationId = String(conversations[0].id);
    await sql`
      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES (${conversationId}::uuid, ${session.id}::uuid, 'member'),
             (${conversationId}::uuid, ${target.id}::uuid, 'member')
      ON CONFLICT (conversation_id, user_id) DO NOTHING
    `;
    return NextResponse.json({ conversation: { ...conversations[0], otherHandle: target.handle } }, { status: 201 });
  } catch (error) {
    console.error("UCENO conversation create error", error);
    return NextResponse.json({ error: "Could not start conversation" }, { status: 503 });
  }
}
