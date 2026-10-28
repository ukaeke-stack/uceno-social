import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
const handleSchema = z.string().regex(/^[a-z0-9_]{3,24}$/);

export async function POST(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to follow people" }, { status: 401 });
  const { handle } = await context.params;
  const targetHandle = handle.toLowerCase();
  if (!handleSchema.safeParse(targetHandle).success) return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  if (targetHandle === session.handle) return NextResponse.json({ error: "You cannot follow your own account" }, { status: 400 });
  try {
    const sql = getDb();
    const rows = await sql`
      WITH target AS (
        SELECT id FROM users WHERE handle = ${targetHandle} LIMIT 1
      ), removed AS (
        DELETE FROM follows
        WHERE follower_id = ${session.id}::uuid
          AND following_id IN (SELECT id FROM target)
        RETURNING 1
      ), inserted AS (
        INSERT INTO follows (follower_id, following_id)
        SELECT ${session.id}::uuid, id FROM target
        WHERE NOT EXISTS (SELECT 1 FROM removed)
        ON CONFLICT (follower_id, following_id) DO NOTHING
        RETURNING 1
      )
      SELECT EXISTS (SELECT 1 FROM target) AS "userExists",
             (SELECT id FROM target LIMIT 1) AS "targetId",
             EXISTS (SELECT 1 FROM inserted) AS following
    `;
    if (!rows[0]?.userExists) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (rows[0]?.following && rows[0]?.targetId) {
      await createNotification({ recipientId: String(rows[0].targetId), actorId: session.id, type: "follow", message: session.handle + " followed you" });
    }
    return NextResponse.json({ following: Boolean(rows[0].following) });
  } catch (error) {
    console.error("UCENO follow error", error);
    return NextResponse.json({ error: "Could not update follow status" }, { status: 503 });
  }
}
