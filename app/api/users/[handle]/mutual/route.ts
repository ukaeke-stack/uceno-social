import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureTable() {
  const sql = getDb();
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'person'`;
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
  await sql`CREATE INDEX IF NOT EXISTS mutual_connections_recipient_status_idx ON mutual_connections (recipient_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS mutual_connections_requester_status_idx ON mutual_connections (requester_id, status)`;
  return sql;
}

export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to manage mutual connections" }, { status: 401 });
  const { handle } = await context.params;
  try {
    const sql = await ensureTable();
    const targetRows = await sql`SELECT id, handle, account_type AS "accountType" FROM users WHERE handle = ${handle.toLowerCase()} LIMIT 1`;
    if (!targetRows.length) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const target = targetRows[0] as { id: string; handle: string; accountType?: string };
    if (String(target.id) === String(session.id)) return NextResponse.json({ status: "self" });
    if (target.accountType === "page") return NextResponse.json({ status: "page" });
    const rows = await sql`SELECT id, requester_id AS "requesterId", recipient_id AS "recipientId", status
      FROM mutual_connections
      WHERE (requester_id = ${session.id}::uuid AND recipient_id = ${target.id}::uuid)
         OR (requester_id = ${target.id}::uuid AND recipient_id = ${session.id}::uuid)
      ORDER BY updated_at DESC LIMIT 2`;
    const mutual = rows.find((row: any) => row.status === "accepted");
    if (mutual) return NextResponse.json({ status: "accepted", connectionId: mutual.id });
    const incoming = rows.find((row: any) => String(row.requesterId) === String(target.id) && String(row.recipientId) === String(session.id) && row.status === "pending");
    if (incoming) return NextResponse.json({ status: "incoming_pending", requestId: incoming.id });
    const outgoing = rows.find((row: any) => String(row.requesterId) === String(session.id) && String(row.recipientId) === String(target.id) && row.status === "pending");
    if (outgoing) return NextResponse.json({ status: "outgoing_pending", requestId: outgoing.id });
    return NextResponse.json({ status: "none" });
  } catch (error) {
    console.error("UCENO mutual connection status error", error);
    return NextResponse.json({ error: "Mutual connection status is unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ handle: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to manage mutual connections" }, { status: 401 });
  const { handle } = await context.params;
  const body = await request.json().catch(() => null) as { action?: string; requestId?: string } | null;
  if (!body || !["send", "accept", "decline", "remove"].includes(String(body.action))) {
    return NextResponse.json({ error: "Invalid mutual connection action" }, { status: 400 });
  }
  try {
    const sql = await ensureTable();
    const targets = await sql`SELECT id, handle FROM users WHERE handle = ${handle.toLowerCase()} LIMIT 1`;
    if (!targets.length) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const target = targets[0] as { id: string; handle: string; accountType?: string };
    if (String(target.id) === String(session.id)) return NextResponse.json({ error: "You cannot connect to your own profile" }, { status: 400 });
    if (target.accountType === "page") return NextResponse.json({ error: "Pages can be followed and messaged but cannot become personal mutual connections." }, { status: 403 });
    const callerRows = await sql`SELECT account_type AS "accountType" FROM users WHERE id = ${session.id}::uuid LIMIT 1`;
    if (callerRows[0]?.accountType === "page") return NextResponse.json({ error: "Page accounts cannot send or accept personal mutual requests." }, { status: 403 });

    if (body.action === "send") {
      const existing = await sql`SELECT id, requester_id AS "requesterId", recipient_id AS "recipientId", status
        FROM mutual_connections
        WHERE (requester_id = ${session.id}::uuid AND recipient_id = ${target.id}::uuid)
           OR (requester_id = ${target.id}::uuid AND recipient_id = ${session.id}::uuid)
        ORDER BY updated_at DESC LIMIT 2`;
      if (existing.some((row: any) => row.status === "accepted")) return NextResponse.json({ status: "accepted" });
      if (existing.some((row: any) => String(row.requesterId) === String(target.id) && String(row.recipientId) === String(session.id) && row.status === "pending")) {
        return NextResponse.json({ error: "This person has already sent you a request. Accept it from their profile." }, { status: 409 });
      }
      const prior = existing.find((row: any) => String(row.requesterId) === String(session.id) && String(row.recipientId) === String(target.id));
      let requestId: string;
      if (prior) {
        const changed = await sql`UPDATE mutual_connections SET status = 'pending', updated_at = NOW() WHERE id = ${prior.id} RETURNING id`;
        requestId = String(changed[0].id);
      } else {
        requestId = crypto.randomUUID();
        await sql`INSERT INTO mutual_connections (id, requester_id, recipient_id, status) VALUES (${requestId}, ${session.id}::uuid, ${target.id}::uuid, 'pending')`;
      }
      try {
        await createNotification({ recipientId: String(target.id), actorId: session.id, type: "system", message: session.handle + " sent you a mutual connection request" });
      } catch (error) {
        console.error("UCENO mutual request notification failed", error);
      }
      return NextResponse.json({ status: "outgoing_pending", requestId });
    }

    if (body.action === "accept" || body.action === "decline") {
      if (!body.requestId) return NextResponse.json({ error: "Request ID is required" }, { status: 400 });
      const status = body.action === "accept" ? "accepted" : "declined";
      const changed = await sql`UPDATE mutual_connections SET status = ${status}, updated_at = NOW()
        WHERE id = ${body.requestId} AND requester_id = ${target.id}::uuid
          AND recipient_id = ${session.id}::uuid AND status = 'pending'
        RETURNING id`;
      if (!changed.length) return NextResponse.json({ error: "Request not found or no longer pending" }, { status: 404 });
      if (status === "accepted") {
        try {
          await createNotification({ recipientId: String(target.id), actorId: session.id, type: "system", message: session.handle + " accepted your mutual connection request" });
        } catch (error) {
          console.error("UCENO mutual acceptance notification failed", error);
        }
      }
      return NextResponse.json({ status, connectionId: changed[0].id });
    }

    const removed = await sql`DELETE FROM mutual_connections
      WHERE status = 'accepted'
        AND ((requester_id = ${session.id}::uuid AND recipient_id = ${target.id}::uuid)
          OR (requester_id = ${target.id}::uuid AND recipient_id = ${session.id}::uuid))
      RETURNING id`;
    if (!removed.length) return NextResponse.json({ error: "No mutual connection exists" }, { status: 404 });
    return NextResponse.json({ status: "none" });
  } catch (error) {
    console.error("UCENO mutual connection update error", error);
    return NextResponse.json({ error: "Could not update mutual connection" }, { status: 503 });
  }
}
