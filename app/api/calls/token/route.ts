import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const schema = z.object({
  room: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  mode: z.enum(["audio", "video"]).default("video"),
});

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to start a call" }, { status: 401 });
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "Calling is not configured yet. The administrator must configure LiveKit." }, { status: 503 });
  }
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Enter a valid call room and mode" }, { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    video: { roomJoin: true, room: input.data.room, canPublish: true, canSubscribe: true, canPublishData: true },
    metadata: JSON.stringify({ mode: input.data.mode }),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(apiKey)
    .setSubject(session.handle)
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 60 * 60)
    .sign(new TextEncoder().encode(apiSecret));
  return NextResponse.json({ token, url, room: input.data.room, mode: input.data.mode, expiresIn: 3600 });
}
