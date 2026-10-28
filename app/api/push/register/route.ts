import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to register this device" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const value = body as { token?: unknown; platform?: unknown };
  if (typeof value.token !== "string" || value.token.length < 20 || value.token.length > 4096) {
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });
  }
  const platform = value.platform === "ios" ? "ios" : "android";
  try {
    const sql = getDb();
    await sql`INSERT INTO push_tokens (user_id, token, platform, updated_at)
      VALUES (${session.id}::uuid, ${value.token}, ${platform}, NOW())
      ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform, updated_at = NOW()`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("UCENO push token registration error", error);
    return NextResponse.json({ error: "Push registration is unavailable. Apply db/migrations/006_push_tokens.sql first." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to remove this device" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const token = (body as { token?: unknown })?.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });
  }
  try {
    const sql = getDb();
    await sql`DELETE FROM push_tokens WHERE user_id = ${session.id}::uuid AND token = ${token}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("UCENO push token removal error", error);
    return NextResponse.json({ error: "Could not remove push token" }, { status: 503 });
  }
}
