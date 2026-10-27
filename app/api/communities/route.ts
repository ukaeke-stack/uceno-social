import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
const createSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).default(""),
});

function makeSlug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to discover communities" }, { status: 401 });
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT c.id, c.name, c.slug, c.description, c.created_at AS "createdAt",
        u.display_name AS "creatorName",
        (SELECT COUNT(*)::int FROM community_members cm WHERE cm.community_id = c.id) AS members,
        EXISTS(SELECT 1 FROM community_members mine WHERE mine.community_id = c.id AND mine.user_id = ${session.id}::uuid) AS "isMember"
      FROM communities c JOIN users u ON u.id = c.created_by
      ORDER BY members DESC, c.created_at DESC LIMIT 100
    `;
    return NextResponse.json({ communities: rows });
  } catch (error) {
    console.error("UCENO communities list error", error);
    return NextResponse.json({ error: "Communities are temporarily unavailable. Apply migration 004_communities.sql if it has not been applied." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to create a community" }, { status: 401 });
  try {
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid community" }, { status: 400 });
    const base = makeSlug(input.data.name);
    if (!base) return NextResponse.json({ error: "Choose a name containing letters or numbers" }, { status: 400 });
    const sql = getDb();
    const rows = await sql`
      INSERT INTO communities (name, slug, description, created_by)
      VALUES (${input.data.name}, ${base + "-" + crypto.randomUUID().slice(0, 8)}, ${input.data.description}, ${session.id}::uuid)
      RETURNING id, name, slug, description, created_at AS "createdAt"
    `;
    await sql`INSERT INTO community_members (community_id, user_id, role) VALUES (${rows[0].id}::uuid, ${session.id}::uuid, 'admin') ON CONFLICT DO NOTHING`;
    return NextResponse.json({ community: { ...rows[0], members: 1, isMember: true } }, { status: 201 });
  } catch (error) {
    console.error("UCENO community create error", error);
    return NextResponse.json({ error: "Could not create community" }, { status: 503 });
  }
}
