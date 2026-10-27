import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to view notifications" }, { status: 401 });
  try {
    const sql = getDb();
    const [notifications, counts] = await Promise.all([
      sql`SELECT n.id, n.type, n.entity_id AS "entityId", n.message, n.created_at AS "createdAt", n.read_at AS "readAt",
        u.display_name AS "actorName", u.handle AS "actorHandle"
        FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
        WHERE n.recipient_id = ${session.id}::uuid ORDER BY n.created_at DESC LIMIT 100`,
      sql`SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_id = ${session.id}::uuid AND read_at IS NULL`
    ]);
    return NextResponse.json({ notifications, unread: counts[0]?.count ?? 0 });
  } catch (error) {
    console.error("UCENO notification read error", error);
    return NextResponse.json({ error: "Notifications are temporarily unavailable. Apply db/migrations/002_notifications.sql first." }, { status: 503 });
  }
}

export async function PATCH() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to update notifications" }, { status: 401 });
  try {
    const sql = getDb();
    await sql`UPDATE notifications SET read_at = NOW() WHERE recipient_id = ${session.id}::uuid AND read_at IS NULL`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("UCENO notification update error", error);
    return NextResponse.json({ error: "Could not mark notifications as read" }, { status: 503 });
  }
}
