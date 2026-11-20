import { randomUUID } from "node:crypto";
import { missionWindowForInstant, type MissionCadence } from "./mission-schedule.js";

type Db = { begin<T>(fn: (tx: any) => Promise<T>): Promise<T>; unsafe(query: string, params?: unknown[]): Promise<any[]> };

function resolveWindow(template: any, now: number): { startsAt: number; endsAt: number; periodKey: string } | null {
  if (template.cadence === "seasonal") {
    const startsAt = new Date(template.activeFrom).getTime();
    const endsAt = new Date(template.activeUntil).getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt ||
        now < startsAt || now >= endsAt) return null;
    return { startsAt, endsAt, periodKey: "seasonal-" + new Date(startsAt).toISOString().slice(0, 10) };
  }
  try {
    const window = missionWindowForInstant(now, template.timeZone, template.cadence as MissionCadence);
    return { startsAt: window.startsAt, endsAt: window.endsAt, periodKey: window.periodKey };
  } catch {
    return null;
  }
}

function isQualifiedSpawnPoint(point: any): boolean {
  if (!point || !Number.isInteger(point.sequence) || point.sequence < 0 || point.sequence > 99)
    return false;
  if (typeof point.cityId !== "string" || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(point.cityId))
    return false;
  if (typeof point.districtId !== "string" || point.districtId.length < 1 ||
      point.districtId.length > 80 || typeof point.interactableId !== "string" ||
      point.interactableId.length < 1 || point.interactableId.length > 128)
    return false;
  for (const coordinate of [point.x, point.y, point.z]) {
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate) ||
        coordinate < -10000 || coordinate > 10000) return false;
  }
  if (typeof point.radius !== "number" || !Number.isFinite(point.radius) ||
      point.radius < 0.5 || point.radius > 8) return false;
  if (!point.clue || typeof point.clue !== "object" || Array.isArray(point.clue))
    return false;
  try {
    return Buffer.byteLength(JSON.stringify(point.clue), "utf8") <= 16384;
  } catch {
    return false;
  }
}

function hasQualifiedSpawnPool(points: any[], mode: string): boolean {
  if (!Array.isArray(points) || points.length < 2 || points.length > 10000 ||
      !points.every(isQualifiedSpawnPoint)) return false;
  const clueCount = Math.max(...points.map((point: any) => Number(point.sequence))) + 1;
  if (!Number.isInteger(clueCount) || clueCount < 2 || clueCount > 100) return false;
  const counts = new Map<number, number>();
  const seenInteractables = new Set<string>();
  for (const point of points) {
    // Match the runtime route selector: interactable IDs are globally unique
    // within a hunt, even when duplicate rows claim different district metadata.
    // Otherwise a scheduled route can pass validation but fail at assignment.
    const identity = point.interactableId;
    if (seenInteractables.has(identity)) return false;
    seenInteractables.add(identity);
    counts.set(Number(point.sequence), (counts.get(Number(point.sequence)) ?? 0) + 1);
  }
  const minimum = mode === "team" ? 1 : 2;
  return Array.from({ length: clueCount }, (_, sequence) => counts.get(sequence) ?? 0)
    .every(count => count >= minimum);
}

/** Materialize configured recurring hunts idempotently. No template or location is invented. */
export async function materializeScheduledTreasureHunts(db: Db, now: number): Promise<number> {
  if (!Number.isFinite(now)) throw new RangeError("invalid_treasure_schedule_instant");
  const templates = await db.unsafe(`SELECT id, code, title, world_id AS "worldId",
      cadence, time_zone AS "timeZone", active_from AS "activeFrom",
      active_until AS "activeUntil"
    FROM virtual_world_treasure_hunt_templates
    WHERE enabled = TRUE AND (active_from IS NULL OR active_from <= to_timestamp($1))
      AND (active_until IS NULL OR active_until > to_timestamp($1))
    ORDER BY id LIMIT 200`, [now / 1000]);
  let created = 0;
  for (const template of templates) {
    // Cheap outer eligibility check; the locked row is revalidated below.
    if (!resolveWindow(template, now)) continue;
    const result = await db.begin(async tx => {
      const lock = await tx.unsafe(`SELECT pg_try_advisory_xact_lock(hashtext('uceno_treasure_schedule_materializer')) AS locked`);
      if (lock[0]?.locked !== true) return false;
      const current = await tx.unsafe(`SELECT id, code, title, world_id AS "worldId",
          cadence, time_zone AS "timeZone", active_from AS "activeFrom",
          active_until AS "activeUntil", reward_earned_credits AS reward,
          distribution_mode AS "distributionMode", max_global_winners AS "maxGlobalWinners",
          max_reward_claims AS "maxRewardClaims"
        FROM virtual_world_treasure_hunt_templates
        WHERE id = $1::uuid AND enabled = TRUE
        FOR SHARE`, [template.id]);
      if (!current[0]) return false;
      // Recompute from the locked, current template. The outer scan is only a
      // candidate list; operators may edit cadence, timezone, title or dates
      // between that scan and this transaction.
      const currentWindow = resolveWindow(current[0], now);
      if (!currentWindow) return false;
      const currentScheduleKey = current[0].cadence + ":" + currentWindow.periodKey;
      const currentCode = current[0].code + "-" + current[0].cadence + "-" +
        currentWindow.periodKey.replace(/[^0-9]/g, "");
      if (currentCode.length > 64) return false;
      const points = await tx.unsafe(`SELECT sequence, city_id AS "cityId",
          district_id AS "districtId", interactable_id AS "interactableId",
          position_x AS x, position_y AS y, position_z AS z,
          interaction_radius AS radius, clue_payload AS clue
        FROM virtual_world_treasure_template_spawn_points
        WHERE template_id = $1::uuid AND enabled = TRUE
        ORDER BY sequence, id LIMIT 10001`, [template.id]);
      if (!hasQualifiedSpawnPool(points, current[0].distributionMode)) return false;
      const existing = await tx.unsafe(`SELECT id FROM virtual_world_treasure_hunts
        WHERE template_id = $1::uuid AND schedule_key = $2 LIMIT 1`,
        [template.id, currentScheduleKey]);
      let huntId: string;
      let insertedNew = false;
      if (existing[0]) huntId = existing[0].id;
      else {
        const inserted = await tx.unsafe(`INSERT INTO virtual_world_treasure_hunts
          (id, code, title, world_id, starts_at, ends_at, reward_earned_credits,
           enabled, distribution_mode, max_global_winners, max_reward_claims,
           template_id, schedule_key)
          VALUES ($1::uuid, $2, $3, $4::uuid, to_timestamp($5), to_timestamp($6),
            $7::bigint, TRUE, $8, $9, $10, $11::uuid, $12)
          ON CONFLICT (template_id, schedule_key) DO NOTHING RETURNING id`,
          [randomUUID(), currentCode, current[0].title, current[0].worldId, currentWindow.startsAt / 1000,
            currentWindow.endsAt / 1000, String(current[0].reward), current[0].distributionMode,
            current[0].maxGlobalWinners, current[0].maxRewardClaims, template.id, currentScheduleKey]);
        if (inserted[0]) {
          huntId = inserted[0].id;
          insertedNew = true;
        } else {
          const retry = await tx.unsafe(`SELECT id FROM virtual_world_treasure_hunts
            WHERE template_id = $1::uuid AND schedule_key = $2 LIMIT 1`,
            [template.id, currentScheduleKey]);
          if (!retry[0]) return false;
          huntId = retry[0].id;
        }
      }
      if (points.length) {
        // One set-based insert per scheduled hunt avoids a database round-trip
        // for every authored clue location (up to 10,000 per template).
        await tx.unsafe(`INSERT INTO virtual_world_treasure_spawn_points
          (id, hunt_id, sequence, city_id, district_id, interactable_id,
           position_x, position_y, position_z, interaction_radius, clue_payload, enabled)
          SELECT input.id, $1::uuid, input.sequence, input.city_id, input.district_id,
            input.interactable_id, input.x, input.y, input.z, input.radius,
            input.clue_payload::jsonb, TRUE
          FROM unnest($2::uuid[], $3::integer[], $4::text[], $5::text[], $6::text[],
            $7::double precision[], $8::double precision[], $9::double precision[],
            $10::double precision[], $11::jsonb[])
          AS input(id, sequence, city_id, district_id, interactable_id,
            x, y, z, radius, clue_payload)
          ON CONFLICT (hunt_id, sequence, interactable_id) DO NOTHING`,
          [huntId, points.map(() => randomUUID()), points.map((point: any) => Number(point.sequence)),
            points.map((point: any) => String(point.cityId)), points.map((point: any) => String(point.districtId)),
            points.map((point: any) => String(point.interactableId)), points.map((point: any) => Number(point.x)),
            points.map((point: any) => Number(point.y)), points.map((point: any) => Number(point.z)),
            points.map((point: any) => Number(point.radius)),
            points.map((point: any) => JSON.stringify(point.clue ?? {}))]);
      }
      return insertedNew;
    });
    if (result) created++;
  }
  return created;
}
