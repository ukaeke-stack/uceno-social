import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const normalizedHandle = handle.toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalizedHandle)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  try {
    const sql = getDb();
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'person'`;
    const users = await sql`
      SELECT u.id, u.display_name AS "displayName", u.handle, u.account_type AS "accountType", u.bio, u.avatar_url AS "avatarUrl", u.location, u.website, u.created_at AS "joinedAt",
        (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers,
        (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following,
        (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND p.visibility = 'public') AS "postCount"
      FROM users u WHERE u.handle = ${normalizedHandle} AND u.moderation_status = 'active' LIMIT 1
    `;
    if (!users.length) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const session = await readSession();
    if (session && String(session.id) !== String(users[0].id)) {
      const blocked = await sql`SELECT 1 FROM user_blocks WHERE (blocker_id = ${session.id}::uuid AND blocked_id = ${users[0].id}::uuid) OR (blocker_id = ${users[0].id}::uuid AND blocked_id = ${session.id}::uuid) LIMIT 1`;
      if (blocked.length) return NextResponse.json({ error: "This profile is unavailable" }, { status: 404 });
    }
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
    let mutualStatus: "self" | "none" | "accepted" | "incoming_pending" | "outgoing_pending" | "page_account" = session && String(session.id) === String(users[0].id) ? "self" : "none";
    let mutualRequestId: string | null = null;
    if (session && String(session.id) !== String(users[0].id)) {
      const callerRows = await sql`SELECT account_type AS "accountType" FROM users WHERE id = ${session.id}::uuid LIMIT 1`;
      if (callerRows[0]?.accountType === "page") {
        mutualStatus = "page_account";
      } else {
        const mutualRows = await sql`SELECT id, requester_id AS "requesterId", recipient_id AS "recipientId", status
          FROM mutual_connections
          WHERE (requester_id = ${session.id}::uuid AND recipient_id = ${users[0].id}::uuid)
             OR (requester_id = ${users[0].id}::uuid AND recipient_id = ${session.id}::uuid)
          ORDER BY updated_at DESC LIMIT 2`;
        if (mutualRows.some((row: any) => row.status === "accepted")) mutualStatus = "accepted";
        else {
          const incoming = mutualRows.find((row: any) => String(row.requesterId) === String(users[0].id) && String(row.recipientId) === String(session.id) && row.status === "pending");
          const outgoing = mutualRows.find((row: any) => String(row.requesterId) === String(session.id) && String(row.recipientId) === String(users[0].id) && row.status === "pending");
          if (incoming) { mutualStatus = "incoming_pending"; mutualRequestId = String(incoming.id); }
          else if (outgoing) { mutualStatus = "outgoing_pending"; mutualRequestId = String(outgoing.id); }
        }
      }
    }
    let isFollowing = false;
    if (session && session.id !== users[0].id) {
      const follows = await sql`SELECT 1 FROM follows WHERE follower_id = ${session.id}::uuid AND following_id = ${users[0].id}::uuid LIMIT 1`;
      isFollowing = follows.length > 0;
    }

    const posts = await sql`
      SELECT p.id, p.body, p.media_url AS "mediaUrl", p.media_type AS "mediaType", p.created_at AS "createdAt",
        (SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id = p.id) AS likes,
        (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comments
      FROM posts p
      WHERE p.user_id = ${users[0].id}::uuid AND p.visibility = 'public' AND p.moderation_removed_at IS NULL
      ORDER BY p.created_at DESC LIMIT 20
    `;

    return NextResponse.json({ profile: { ...users[0], isFollowing, mutualStatus, mutualRequestId, isOwnProfile: Boolean(session && String(session.id) === String(users[0].id)) }, posts });
  } catch (error) {
    console.error("UCENO profile read error", error);
    return NextResponse.json({ error: "Profile is temporarily unavailable" }, { status: 503 });
  }
}


const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(70),
  bio: z.string().trim().max(280).default(""),
  location: z.string().trim().max(120).default(""),
  website: z.string().trim().max(240).default("").refine(value => !value || /^https:\/\//i.test(value), "Website must start with https://"),
});

export async function PATCH(request: Request, context: { params: Promise<{ handle: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to edit your profile" }, { status: 401 });
  const { handle } = await context.params;
  if (handle.toLowerCase() !== session.handle.toLowerCase()) {
    return NextResponse.json({ error: "You can only edit your own profile" }, { status: 403 });
  }
  const input = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Check your profile details" }, { status: 400 });
  try {
    const sql = getDb();
    const rows = await sql`
      UPDATE users SET display_name = ${input.data.displayName}, bio = ${input.data.bio},
        location = ${input.data.location}, website = ${input.data.website}, updated_at = NOW()
      WHERE id = ${session.id}::uuid
      RETURNING id, display_name AS "displayName", handle, bio, avatar_url AS "avatarUrl", location, website, created_at AS "joinedAt"
    `;
    if (!rows.length) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ profile: rows[0] });
  } catch (error) {
    console.error("UCENO profile update error", error);
    return NextResponse.json({ error: "Profile could not be saved. Ensure migration 007_profile_details.sql has been applied." }, { status: 503 });
  }
}
