import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const idSchema = z.string().uuid();

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to join communities" }, { status: 401 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid community id" }, { status: 400 });
  try {
    const sql = getDb();
    const exists = await sql`SELECT id FROM communities WHERE id = ${id}::uuid LIMIT 1`;
    if (!exists.length) return NextResponse.json({ error: "Community not found" }, { status: 404 });
    const membership = await sql`SELECT role FROM community_members WHERE community_id = ${id}::uuid AND user_id = ${session.id}::uuid LIMIT 1`;
    if (membership.length) {
      await sql`DELETE FROM community_members WHERE community_id = ${id}::uuid AND user_id = ${session.id}::uuid`;
      const count = await sql`SELECT COUNT(*)::int AS members FROM community_members WHERE community_id = ${id}::uuid`;
      return NextResponse.json({ isMember: false, members: count[0].members });
    }
    await sql`INSERT INTO community_members (community_id, user_id) VALUES (${id}::uuid, ${session.id}::uuid) ON CONFLICT DO NOTHING`;
    const count = await sql`SELECT COUNT(*)::int AS members FROM community_members WHERE community_id = ${id}::uuid`;
    return NextResponse.json({ isMember: true, members: count[0].members });
  } catch (error) {
    console.error("UCENO community membership error", error);
    return NextResponse.json({ error: "Could not update community membership" }, { status: 503 });
  }
}
