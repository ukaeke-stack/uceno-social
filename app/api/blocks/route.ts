import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const handleSchema = z.object({ handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/) });

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to view blocked accounts" }, { status: 401 });
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT u.id, u.display_name AS "displayName", u.handle, b.created_at AS "blockedAt"
      FROM user_blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ${session.id}::uuid
      ORDER BY b.created_at DESC
    `;
    return NextResponse.json({ blockedUsers: rows });
  } catch (error) {
    console.error("UCENO blocked accounts read error", error);
    return NextResponse.json({ error: "Blocked accounts are unavailable. Apply migration 011_trust_safety.sql." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to block an account" }, { status: 401 });
  const parsed = handleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid account handle" }, { status: 400 });
  try {
    const sql = getDb();
    const targets = await sql`SELECT id FROM users WHERE handle = ${parsed.data.handle} LIMIT 1`;
    if (!targets.length) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const targetId = String(targets[0].id);
    if (targetId === String(session.id)) return NextResponse.json({ error: "You cannot block your own account" }, { status: 400 });
    await sql`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${session.id}::uuid, ${targetId}::uuid) ON CONFLICT DO NOTHING`;
    return NextResponse.json({ blocked: true, handle: parsed.data.handle });
  } catch (error) {
    console.error("UCENO block account error", error);
    return NextResponse.json({ error: "Could not block this account. Apply migration 011_trust_safety.sql." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to unblock an account" }, { status: 401 });
  const parsed = handleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid account handle" }, { status: 400 });
  try {
    const sql = getDb();
    const rows = await sql`DELETE FROM user_blocks b USING users u WHERE b.blocked_id = u.id AND b.blocker_id = ${session.id}::uuid AND u.handle = ${parsed.data.handle} RETURNING u.handle`;
    return NextResponse.json({ blocked: false, handle: rows[0]?.handle ?? parsed.data.handle });
  } catch (error) {
    console.error("UCENO unblock account error", error);
    return NextResponse.json({ error: "Could not unblock this account. Apply migration 011_trust_safety.sql." }, { status: 503 });
  }
}
