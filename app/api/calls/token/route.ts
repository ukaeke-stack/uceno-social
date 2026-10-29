import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const schema = z.object({
  targetHandle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/),
  mode: z.enum(["audio", "video"]).default("video"),
});

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to call another user" }, { status: 401 });
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "Calling is not configured yet. The administrator must configure LiveKit." }, { status: 503 });
  }
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Enter a valid UCENO username and call mode" }, { status: 400 });
  const sql = getDb();
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'person'`;
  const targets = await sql`SELECT id, handle, account_type AS "accountType" FROM users WHERE handle = ${input.data.targetHandle} LIMIT 1`;
  if (!targets.length) return NextResponse.json({ error: "UCENO user not found" }, { status: 404 });
  const target = targets[0] as { id: string; handle: string; accountType?: string };
  if (String(target.id) === String(session.id)) {
    return NextResponse.json({ error: "You cannot call yourself" }, { status: 400 });
  }
  if (target.accountType === "page") return NextResponse.json({ error: "Pages cannot receive direct personal calls." }, { status: 403 });
  const callerRows = await sql`SELECT account_type AS "accountType" FROM users WHERE id = ${session.id}::uuid LIMIT 1`;
  if (callerRows[0]?.accountType === "page") return NextResponse.json({ error: "Pages cannot start direct personal calls." }, { status: 403 });
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
  const mutual = await sql`SELECT id FROM mutual_connections
    WHERE status = 'accepted'
      AND ((requester_id = ${session.id}::uuid AND recipient_id = ${target.id}::uuid)
        OR (requester_id = ${target.id}::uuid AND recipient_id = ${session.id}::uuid))
    LIMIT 1`;
  if (!mutual.length) return NextResponse.json({ error: "Calling is available only between accepted mutual connections." }, { status: 403 });

  // Only issue a LiveKit token after the recipient accepts a recent invitation
  // for this exact pair and call mode.
  const accepted = await sql`SELECT id FROM call_invitations
    WHERE status = 'accepted' AND mode = ${input.data.mode}
      AND created_at > NOW() - INTERVAL '10 minutes'
      AND ((caller_id = ${session.id} AND callee_id = ${target.id})
        OR (caller_id = ${target.id} AND callee_id = ${session.id}))
    ORDER BY updated_at DESC LIMIT 1`;
  if (!accepted.length) {
    return NextResponse.json({ error: "The other person must answer your call before the connection can start." }, { status: 403 });
  }

  const participants = [String(session.id), String(target.id)].sort();
  const roomName = "direct-" + participants.join("-");
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    video: { roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true },
    metadata: JSON.stringify({ mode: input.data.mode, targetHandle: target.handle }),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(apiKey)
    .setSubject(session.handle)
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 60 * 60)
    .sign(new TextEncoder().encode(apiSecret));
  return NextResponse.json({ token, url, room: roomName, targetHandle: target.handle, mode: input.data.mode, expiresIn: 3600 });
}
