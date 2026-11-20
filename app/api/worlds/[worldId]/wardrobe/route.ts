import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readWorldClientSession } from "@/lib/world-client-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ worldId: string }> };
const SLOTS = ["hair", "top", "outerwear", "bottom", "shoes", "accessory"] as const;
type Slot = typeof SLOTS[number];

function validEquipment(value: unknown): value is Partial<Record<Slot, string | null>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length > 0 && entries.length <= SLOTS.length &&
    entries.every(([slot, id]) => SLOTS.includes(slot as Slot) &&
      (id === null || (typeof id === "string" && /^[a-z0-9][a-z0-9_-]{1,63}$/.test(id))));
}

export async function GET(request: NextRequest, { params }: Context) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const sql = getDb();
    const [inventory, equipped] = await Promise.all([
      sql`SELECT i.item_id AS "itemId", c.display_name AS "displayName",
        c.slot, c.prefab_key AS "prefabKey", c.asset_version AS "assetVersion"
        FROM user_avatar_wardrobe_inventory i
        JOIN avatar_wardrobe_items c ON c.item_id = i.item_id
        WHERE i.user_id = ${session.id}::uuid AND c.enabled = TRUE
        ORDER BY c.slot, c.display_name`,
      sql`SELECT e.slot, e.item_id AS "itemId"
        FROM user_avatar_wardrobe_equipped e
        JOIN avatar_wardrobe_items c ON c.item_id = e.item_id AND c.enabled = TRUE
        WHERE e.user_id = ${session.id}::uuid ORDER BY e.slot`
    ]);
    return NextResponse.json({ inventory, equipped },
      { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Avatar wardrobe load failed", error);
    return NextResponse.json({ error: "Wardrobe is unavailable" }, { status: 503 });
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
      !validEquipment((body as Record<string, unknown>).equipped))
    return NextResponse.json({ error: "Invalid wardrobe selection" }, { status: 400 });

  try {
    const sql = getDb();
    const requested = (body as { equipped: Partial<Record<Slot, string | null>> }).equipped;
    const result = await sql`
      WITH requested AS (
        SELECT key AS slot, value AS item_id
        FROM jsonb_each_text(${JSON.stringify(requested)}::jsonb)
      ),
      invalid AS (
        SELECT r.slot FROM requested r
        WHERE r.item_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM user_avatar_wardrobe_inventory i
          JOIN avatar_wardrobe_items c ON c.item_id = i.item_id
          WHERE i.user_id = ${session.id}::uuid
            AND i.item_id = r.item_id AND c.slot = r.slot AND c.enabled = TRUE
        )
      ),
      removed AS (
        DELETE FROM user_avatar_wardrobe_equipped e
        USING requested r
        WHERE e.user_id = ${session.id}::uuid AND e.slot = r.slot
          AND r.item_id IS NULL AND NOT EXISTS (SELECT 1 FROM invalid)
        RETURNING e.slot
      ),
      saved AS (
        INSERT INTO user_avatar_wardrobe_equipped (user_id, slot, item_id, equipped_at)
        SELECT ${session.id}::uuid, r.slot, r.item_id, NOW()
        FROM requested r WHERE r.item_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM invalid)
        ON CONFLICT (user_id, slot) DO UPDATE
          SET item_id = EXCLUDED.item_id, equipped_at = NOW()
        RETURNING slot, item_id
      )
      SELECT (SELECT COUNT(*)::int FROM invalid) AS "invalidCount",
        COALESCE((SELECT json_agg(json_build_object('slot', slot, 'itemId', item_id)) FROM saved), '[]'::json) AS equipped
    `;
    if (result[0]?.invalidCount > 0)
      return NextResponse.json({ error: "One or more items are not owned, enabled or valid for that slot" }, { status: 409 });
    return NextResponse.json({ saved: true, equipped: result[0]?.equipped ?? [] },
      { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Avatar wardrobe save failed", error);
    return NextResponse.json({ error: "Wardrobe selection could not be saved" }, { status: 503 });
  }
}
