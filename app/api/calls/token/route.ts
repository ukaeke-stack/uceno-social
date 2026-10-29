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
  const targets = await sql\`SELECT id, handle FROM users WHERE handle = \${input.data.targetHandle} LIMIT 1\`;
  if (!targets.length) return NextResponse.json({ error: "UCENO user not found" }, { status: 404 });
  const target = targets[0] as { id: string; handle: string };
  if (String(target.id) === String(session.id)) {
    return NextResponse.json({ error: "You cannot call yourself" }, { status: 400 });
  }

  // A LiveKit token is issued only after the recipient has accepted a recent
  // invitation for this exact pair and call mode.
  const accepted = await sql\`SELECT id FROM call_invitations
    WHERE status = 'accepted' AND mode = \${input.data.mode}
      AND created_at > NOW() - INTERVAL '10 minutes'
      AND ((caller_id = \${session.id} AND callee_id = \${target.id})
        OR (caller_id = \${target.id} AND callee_id = \${session.id}))
    ORDER BY updated_at DESC LIMIT 1\`;
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
