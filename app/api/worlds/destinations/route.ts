import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import cityCatalog from "../../../../runtime/world-gateway/config/world-cities.json";

export const runtime = "nodejs";
type CityDefinition = (typeof cityCatalog.cities)[number];

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const sql = getDb();
    const worlds = await sql`
      SELECT w.id, w.city_id AS "cityId", w.slug, w.name, w.description,
             w.visibility, w.status, w.region,
             COALESCE(SUM(CASE WHEN i.status = 'ready' AND i.heartbeat_at > NOW() - INTERVAL '30 seconds'
               THEN i.current_players ELSE 0 END), 0)::int AS "livePlayers",
             EXISTS (
               SELECT 1 FROM virtual_world_memberships mine
               WHERE mine.world_id = w.id AND mine.user_id = ${session.id}::uuid
                 AND mine.status = 'active'
             ) AS "isMember",
             (SELECT COUNT(*)::int FROM virtual_world_events e
               WHERE e.world_id = w.id AND e.status = 'scheduled' AND e.ends_at > NOW()) AS "upcomingEvents"
      FROM virtual_worlds w
      LEFT JOIN virtual_world_instances i ON i.world_id = w.id
      LEFT JOIN virtual_world_memberships m ON m.world_id = w.id AND m.user_id = ${session.id}::uuid
      WHERE w.status = 'published'
        AND (w.visibility = 'public' OR w.owner_user_id = ${session.id}::uuid
          OR (w.visibility = 'private' AND m.status = 'active'))
        AND COALESCE(m.status, 'none') NOT IN ('banned','suspended')
        AND NOT EXISTS (SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ${session.id}::uuid AND b.blocked_id = w.owner_user_id)
             OR (b.blocker_id = w.owner_user_id AND b.blocked_id = ${session.id}::uuid))
      GROUP BY w.id
      ORDER BY w.city_id, w.name
    `;
    const homeRows = await sql`
      SELECT h.id, h.name, h.world_id AS "worldId", w.city_id AS "cityId",
             h.visibility, h.updated_at AS "updatedAt"
      FROM virtual_homes h
      JOIN virtual_worlds w ON w.id = h.world_id
      LEFT JOIN virtual_home_members hm ON hm.home_id = h.id AND hm.user_id = ${session.id}::uuid
      WHERE (h.owner_user_id = ${session.id}::uuid OR hm.user_id IS NOT NULL)
        AND w.status = 'published'
        AND NOT EXISTS (SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = h.owner_user_id AND b.blocked_id = ${session.id}::uuid)
             OR (b.blocker_id = ${session.id}::uuid AND b.blocked_id = h.owner_user_id))
      ORDER BY h.updated_at DESC LIMIT 50
    `;
    const cityWorlds = new Map<string, typeof worlds>();
    for (const world of worlds) {
      const list = cityWorlds.get(world.cityId) ?? [];
      list.push(world);
      cityWorlds.set(world.cityId, list);
    }
    const cities = (cityCatalog.cities as CityDefinition[]).map(city => {
      const entries = cityWorlds.get(city.id) ?? [];
      return {
        id: city.id, name: city.name, identity: city.identity,
        climate: city.climate, architecture: city.architecture,
        contentLabel: city.contentLabel,
        districts: city.districts.map(d => ({ id: d.id, name: d.name, role: d.role })),
        landmarks: city.landmarks.map(l => ({ id: l.id, name: l.name, kind: l.kind, districtId: l.districtId })),
        worlds: entries,
        available: entries.length > 0,
        livePlayers: entries.reduce((n, w) => n + Number(w.livePlayers || 0), 0),
        upcomingEvents: entries.reduce((n, w) => n + Number(w.upcomingEvents || 0), 0)
      };
    });
    return NextResponse.json({ cities, homes: homeRows }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("World destination catalogue failed", error);
    return NextResponse.json({ error: "World destinations are temporarily unavailable" }, { status: 503 });
  }
}
