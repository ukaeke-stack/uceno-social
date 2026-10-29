import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to view mutual connections" }, { status: 401 });
  try {
    const sql = getDb();
    await sql`CREATE TABLE IF NOT EXISTS mutual_connections (
      id TEXT PRIMARY KEY,
      requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (requester_id, recipient_id),
      CHECK (requester_id <> recipient_id)
    )`;
    const incoming = await sql`SELECT mc.id, u.handle, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", mc.created_at AS "createdAt"
      FROM mutual_connections mc JOIN users u ON u.id = mc.requester_id
      WHERE mc.recipient_id = ${session.id}::uuid AND mc.status = 'pending'
      ORDER BY mc.created_at DESC LIMIT 100`;
    const outgoing = await sql`SELECT mc.id, u.handle, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", mc.created_at AS "createdAt"
      FROM mutual_connections mc JOIN users u ON u.id = mc.recipient_id
      WHERE mc.requester_id = ${session.id}::uuid AND mc.status = 'pending'
      ORDER BY mc.created_at DESC LIMIT 100`;
    const mutuals = await sql`SELECT mc.id, u.handle, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", mc.updated_at AS "connectedAt"
      FROM mutual_connections mc
      JOIN users u ON u.id = CASE WHEN mc.requester_id = ${session.id}::uuid THEN mc.recipient_id ELSE mc.requester_id END
      WHERE (mc.requester_id = ${session.id}::uuid OR mc.recipient_id = ${session.id}::uuid)
        AND mc.status = 'accepted'
      ORDER BY mc.updated_at DESC LIMIT 500`;
    return NextResponse.json({ incoming, outgoing, mutuals });
  } catch (error) {
    console.error("UCENO mutual list error", error);
    return NextResponse.json({ error: "Mutual connections are unavailable" }, { status: 503 });
  }
}
