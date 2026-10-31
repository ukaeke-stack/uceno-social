import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ user: null });
  try {
    const sql = getDb();
    const rows = await sql`SELECT id, display_name AS "displayName", handle, email, phone, created_at AS "createdAt" FROM users WHERE id = ${session.id} LIMIT 1`;
    const allowed = (process.env.UCENO_MODERATOR_IDS || "").split(",").map(value => value.trim()).filter(Boolean);
    return NextResponse.json({ user: rows[0] ? { ...rows[0], isModerator: allowed.includes(session.id) } : null });
  } catch (error) {
    console.error("UCENO session lookup error", error);
    return NextResponse.json({ error: "Unable to load account" }, { status: 503 });
  }
}
