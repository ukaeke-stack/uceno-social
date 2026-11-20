import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readWorldClientSession } from "@/lib/world-client-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ worldId: string }> };
const KEYS = ["skin", "hair", "top", "trousers", "shoes"] as const;
type Appearance = Record<(typeof KEYS)[number], string>;

function validAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === KEYS.length &&
    KEYS.every((key) => typeof item[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(item[key] as string));
}

export async function GET(request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const sql = getDb();
    const rows = await sql`SELECT appearance, version, updated_at AS "updatedAt"
      FROM user_avatar_appearances WHERE user_id = ${session.id}::uuid LIMIT 1`;
    return NextResponse.json({ appearance: rows[0]?.appearance ?? null,
      version: rows[0]?.version ?? 0, updatedAt: rows[0]?.updatedAt ?? null },
      { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Avatar appearance load failed", error);
    return NextResponse.json({ error: "Appearance is unavailable" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !validAppearance((body as Record<string, unknown>).appearance))
    return NextResponse.json({ error: "Invalid appearance palette" }, { status: 400 });
  try {
    const sql = getDb();
    const rows = await sql`INSERT INTO user_avatar_appearances (user_id, appearance, version, updated_at)
      VALUES (${session.id}::uuid, ${JSON.stringify((body as {appearance: Appearance}).appearance)}::jsonb, 1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        appearance = EXCLUDED.appearance,
        version = user_avatar_appearances.version + 1,
        updated_at = NOW()
      RETURNING version, updated_at AS "updatedAt"`;
    return NextResponse.json({ saved: true, ...rows[0] },
      { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Avatar appearance save failed", error);
    return NextResponse.json({ error: "Appearance could not be saved" }, { status: 503 });
  }
}
