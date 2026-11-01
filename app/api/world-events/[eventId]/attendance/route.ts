import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ eventId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: Context) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { eventId } = await params;
  if (!UUID.test(eventId)) return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });

  let body: { attendanceStatus?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const attendanceStatus = body.attendanceStatus;
  if (attendanceStatus !== "going" && attendanceStatus !== "interested" && attendanceStatus !== "cancelled")
    return NextResponse.json({ error: "attendanceStatus must be going, interested, or cancelled" }, { status: 400 });

  try {
    const sql = getDb();
    const events = await sql`
      SELECT e.id, e.world_id AS "worldId", e.starts_at AS "startsAt",
             e.ends_at AS "endsAt", e.status AS "eventStatus",
             w.status AS "worldStatus", w.visibility, w.owner_user_id AS "ownerUserId",
             COALESCE(m.status, 'none') AS "membershipStatus"
      FROM virtual_world_events e
      JOIN virtual_worlds w ON w.id = e.world_id
      LEFT JOIN virtual_world_memberships m
        ON m.world_id = w.id AND m.user_id = ${session.id}::uuid
      WHERE e.id = ${eventId}::uuid LIMIT 1
    `;
    const event = events[0];
    if (!event || event.worldStatus !== "published" || event.eventStatus !== "scheduled" ||
        new Date(event.endsAt).getTime() <= Date.now())
      return NextResponse.json({ error: "Event is unavailable" }, { status: 404 });
    if (event.membershipStatus === "banned" || event.membershipStatus === "suspended" ||
        (event.visibility === "private" && event.membershipStatus !== "active" && event.ownerUserId !== session.id))
      return NextResponse.json({ error: "You cannot access this event" }, { status: 403 });

    const rows = await sql`
      INSERT INTO virtual_world_event_attendees (event_id, user_id, attendance_status)
      VALUES (${eventId}::uuid, ${session.id}::uuid, ${attendanceStatus})
      ON CONFLICT (event_id, user_id) DO UPDATE
        SET attendance_status = EXCLUDED.attendance_status
      RETURNING attendance_status AS "attendanceStatus", created_at AS "createdAt"
    `;
    return NextResponse.json({ attendance: rows[0] }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("event_full"))
      return NextResponse.json({ error: "This event has reached capacity" }, { status: 409 });
    if (message.includes("event_not_open"))
      return NextResponse.json({ error: "This event is no longer accepting RSVPs" }, { status: 409 });
    console.error("World event RSVP failed", error);
    return NextResponse.json({ error: "Attendance could not be updated" }, { status: 503 });
  }
}
