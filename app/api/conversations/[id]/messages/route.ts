import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
const idSchema = z.string().uuid();
const messageSchema = z.object({ body: z.string().trim().min(1, "Message cannot be empty").max(5000) });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to view messages" }, { status: 401 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  try {
    const sql = getDb();
    const membership = await sql`SELECT 1 FROM conversation_members WHERE conversation_id = ${id}::uuid AND user_id = ${session.id}::uuid LIMIT 1`;
    if (!membership.length) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    const rows = await sql`
      SELECT m.id, m.body, m.created_at AS "createdAt", m.sender_id AS "senderId",
        u.display_name AS "senderName", u.handle AS "senderHandle"
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ${id}::uuid AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC LIMIT 50
    `;
    await sql`UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = ${id}::uuid AND user_id = ${session.id}::uuid`;
    return NextResponse.json({ messages: rows.reverse() });
  } catch (error) {
    console.error("UCENO messages read error", error);
    return NextResponse.json({ error: "Could not load messages" }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to send messages" }, { status: 401 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  try {
    const input = messageSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid message" }, { status: 400 });
    const sql = getDb();
    const rows = await sql`
      INSERT INTO messages (conversation_id, sender_id, body)
      SELECT ${id}::uuid, ${session.id}::uuid, ${input.data.body}
      WHERE EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = ${id}::uuid AND user_id = ${session.id}::uuid)
      RETURNING id, body, created_at AS "createdAt", sender_id AS "senderId"
    `;
    if (!rows.length) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    await sql`UPDATE conversations SET updated_at = NOW() WHERE id = ${id}::uuid`;
    const recipients = await sql`SELECT user_id FROM conversation_members WHERE conversation_id = ${id}::uuid AND user_id <> ${session.id}::uuid`;
    await Promise.all(recipients.map((recipient) => createNotification({ recipientId: String(recipient.user_id), actorId: session.id, type: "message", entityId: id, message: "New message from @" + session.handle })));
    return NextResponse.json({ message: { ...rows[0], senderName: "You", senderHandle: session.handle } }, { status: 201 });
  } catch (error) {
    console.error("UCENO message send error", error);
    return NextResponse.json({ error: "Could not send message" }, { status: 503 });
  }
}
