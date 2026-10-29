import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { notifyIncomingCall } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function database() {
  const sql = getDb();
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'person'`;
  await sql`CREATE TABLE IF NOT EXISTS call_invitations (
    id TEXT PRIMARY KEY,
    caller_id TEXT NOT NULL,
    caller_handle TEXT NOT NULL,
    callee_id TEXT NOT NULL,
    callee_handle TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('audio','video')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled','missed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
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
  await sql`ALTER TABLE call_invitations DROP CONSTRAINT IF EXISTS call_invitations_status_check`;
  await sql`ALTER TABLE call_invitations ADD CONSTRAINT call_invitations_status_check CHECK (status IN ('pending','accepted','rejected','cancelled','missed'))`;
  return sql;
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    const sql = await database();
    await sql`UPDATE call_invitations SET status = 'missed', updated_at = NOW()
      WHERE status = 'pending' AND created_at < NOW() - INTERVAL '60 seconds'`;
    const invitations = await sql`SELECT id, caller_handle AS "callerHandle", callee_handle AS "calleeHandle", mode, status, created_at AS "createdAt"
      FROM call_invitations
      WHERE (callee_id = ${session.id} AND status = 'pending')
         OR (caller_id = ${session.id} AND status IN ('accepted','rejected'))
      ORDER BY created_at DESC LIMIT 10`;
    const missedCalls = await sql`SELECT id, caller_handle AS "callerHandle", mode, created_at AS "createdAt"
      FROM call_invitations WHERE callee_id = ${session.id} AND status = 'missed'
      ORDER BY created_at DESC LIMIT 20`;
    return NextResponse.json({ invitations, missedCalls });
  } catch {
    return NextResponse.json({ error: "Call invitations are unavailable" }, { status: 503 });
  }
}

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), targetHandle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/), mode: z.enum(["audio","video"]) }),
  z.object({ action: z.enum(["accept","reject","cancel"]), invitationId: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation request" }, { status: 400 });
  try {
    const sql = await database();
    if (parsed.data.action === "create") {
      const found = await sql`SELECT id, handle, account_type AS "accountType" FROM users WHERE handle = ${parsed.data.targetHandle} LIMIT 1`;
      if (!found.length) return NextResponse.json({ error: "UCENO user not found" }, { status: 404 });
      const target = found[0] as { id: string; handle: string; accountType?: string };
      if (String(target.id) === String(session.id)) return NextResponse.json({ error: "You cannot call yourself" }, { status: 400 });
      if (target.accountType === "page") return NextResponse.json({ error: "Pages cannot receive direct personal calls. Call an accepted personal mutual instead." }, { status: 403 });
      const callerRows = await sql`SELECT account_type AS "accountType" FROM users WHERE id = ${session.id}::uuid LIMIT 1`;
      if (callerRows[0]?.accountType === "page") return NextResponse.json({ error: "Pages cannot start direct personal calls." }, { status: 403 });
      const mutual = await sql`SELECT id FROM mutual_connections
        WHERE status = 'accepted'
          AND ((requester_id = ${session.id}::uuid AND recipient_id = ${target.id}::uuid)
            OR (requester_id = ${target.id}::uuid AND recipient_id = ${session.id}::uuid))
        LIMIT 1`;
      if (!mutual.length) return NextResponse.json({ error: "You can call only an accepted mutual connection. Send or accept a mutual request first." }, { status: 403 });
      await sql`UPDATE call_invitations SET status = 'cancelled', updated_at = NOW() WHERE caller_id = ${session.id} AND status = 'pending'`;
      const id = crypto.randomUUID();
      await sql`INSERT INTO call_invitations (id, caller_id, caller_handle, callee_id, callee_handle, mode) VALUES (${id}, ${session.id}, ${session.handle}, ${target.id}, ${target.handle}, ${parsed.data.mode})`;
      // Persist the invitation first; push failure must not prevent the call from
      // appearing in the recipient's in-app incoming-call list.
      try {
        await notifyIncomingCall({
          recipientId: String(target.id),
          callerHandle: session.handle,
          invitationId: id,
          mode: parsed.data.mode,
        });
      } catch (error) {
        console.error("UCENO incoming-call push delivery failed", error);
      }
      return NextResponse.json({ invitationId: id, targetHandle: target.handle });
    }
    const { action, invitationId } = parsed.data;
    let changed;
    if (action === "accept") {
      changed = await sql`UPDATE call_invitations SET status = 'accepted', updated_at = NOW() WHERE id = ${invitationId} AND callee_id = ${session.id} AND status = 'pending' RETURNING id, caller_handle AS "callerHandle", mode`;
    } else if (action === "reject") {
      changed = await sql`UPDATE call_invitations SET status = 'rejected', updated_at = NOW() WHERE id = ${invitationId} AND callee_id = ${session.id} AND status = 'pending' RETURNING id`;
    } else {
      changed = await sql`UPDATE call_invitations SET status = 'cancelled', updated_at = NOW() WHERE id = ${invitationId} AND caller_id = ${session.id} AND status IN ('pending','accepted') RETURNING id`;
    }
    if (!changed.length) return NextResponse.json({ error: "Invitation not found or no longer active" }, { status: 404 });
    return NextResponse.json({ ok: true, invitation: changed[0] });
  } catch {
    return NextResponse.json({ error: "Call invitations are unavailable" }, { status: 503 });
  }
}
