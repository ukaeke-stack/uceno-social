import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function database() {
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS call_invitations (
    id TEXT PRIMARY KEY,
    caller_id TEXT NOT NULL,
    caller_handle TEXT NOT NULL,
    callee_id TEXT NOT NULL,
    callee_handle TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('audio','video')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  return sql;
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    const sql = await database();
    const invitations = await sql`SELECT id, caller_handle AS "callerHandle", callee_handle AS "calleeHandle", mode, status, created_at AS "createdAt"
      FROM call_invitations
      WHERE (callee_id = ${session.id} AND status = 'pending')
         OR (caller_id = ${session.id} AND status IN ('accepted','rejected'))
      ORDER BY created_at DESC LIMIT 10`;
    return NextResponse.json({ invitations });
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
      const found = await sql`SELECT id, handle FROM users WHERE handle = ${parsed.data.targetHandle} LIMIT 1`;
      if (!found.length) return NextResponse.json({ error: "UCENO user not found" }, { status: 404 });
      const target = found[0] as { id: string; handle: string };
      if (String(target.id) === String(session.id)) return NextResponse.json({ error: "You cannot call yourself" }, { status: 400 });
      await sql`UPDATE call_invitations SET status = 'cancelled', updated_at = NOW() WHERE caller_id = ${session.id} AND status = 'pending'`;
      const id = crypto.randomUUID();
      await sql`INSERT INTO call_invitations (id, caller_id, caller_handle, callee_id, callee_handle, mode) VALUES (${id}, ${session.id}, ${session.handle}, ${target.id}, ${target.handle}, ${parsed.data.mode})`;
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
