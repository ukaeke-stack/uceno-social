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
  const targets = await sql`SELECT id, handle FROM users WHERE handle = ${input.data.targetHandle} LIMIT 1`;
  if (!targets.length) return NextResponse.json({ error: "UCENO user not found" }, { status: 404 });
  const target = targets[0] as { id: string; handle: string };
  if (String(target.id) === String(session.id)) {
    return NextResponse.json({ error: "You cannot call yourself" }, { status: 400 });
  }

  // A deterministic private room for this pair means neither person needs to
  // belong to a shared chat, group, or community to establish the same call.
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
