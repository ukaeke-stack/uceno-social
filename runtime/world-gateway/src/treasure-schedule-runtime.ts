import { randomUUID } from "node:crypto";
import { missionWindowForInstant, type MissionCadence } from "./mission-schedule.js";

type Db = { begin<T>(fn: (tx: any) => Promise<T>): Promise<T>; unsafe(query: string, params?: unknown[]): Promise<any[]> };

export async function materializeScheduledTreasureHunts(db: Db, now: number): Promise<number> {
  if (!Number.isFinite(now)) throw new RangeError("invalid_treasure_schedule_instant");
  const templates = await db.unsafe(`SELECT id, code, title, world_id AS "worldId",
      cadence, time_zone AS "timeZone", active_from AS "activeFrom",
      active_until AS "activeUntil", reward_earned_credits AS reward,
      distribution_mode AS "distributionMode", max_global_winners AS "maxGlobalWinners",
      max_reward_claims AS "maxRewardClaims"
    FROM virtual_world_treasure_hunt_templates
    WHERE enabled = TRUE AND (active_from IS NULL OR active_from <= to_timestamp($1))
      AND (active_until IS NULL OR active_until > to_timestamp($1))
    ORDER BY id LIMIT 200`, [now / 1000]);
  let created = 0;
  for (const template of templates) {
    let startsAt: number;
    let endsAt: number;
    let periodKey: string;
    if (template.cadence === "seasonal") {
      startsAt = new Date(template.activeFrom).getTime();
      endsAt = new Date(template.activeUntil).getTime();
      periodKey = "seasonal-" + new Date(startsAt).toISOString().slice(0, 10);
    } else {
      const window = missionWindowForInstant(now, template.timeZone, template.cadence as MissionCadence);
      startsAt = window.startsAt;
      endsAt = window.endsAt;
      periodKey = window.periodKey;
    }
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt ||
        now < startsAt || now >= endsAt) continue;
    const scheduleKey = template.cadence + ":" + periodKey;
    const suffix = template.cadence + "-" + periodKey.replace(/[^0-9]/g, "");
    const code = template.code + "-" + suffix;
    if (code.length > 64) continue;
    const wasCreated = await db.begin(async tx => {
      const existing = await tx.unsafe(`SELECT id FROM virtual_world_treasure_hunts
        WHERE template_id = $1::uuid AND schedule_key = $2 LIMIT 1`,
        [template.id, scheduleKey]);
      let huntId: string;
      if (existing[0]) huntId = existing[0].id;
      else {
        const inserted = await tx.unsafe(`INSERT INTO virtual_world_treasure_hunts
          (id, code, title, world_id, starts_at, ends_at, reward_earned_credits,
           enabled, distribution_mode, max_global_winners, max_reward_claims,
           template_id, schedule_key)
          VALUES ($1::uuid, $2, $3, $4::uuid, to_timestamp($5), to_timestamp($6),
            $7::bigint, TRUE, $8, $9, $10, $11::uuid, $12)
          ON CONFLICT (template_id, schedule_key) DO NOTHING RETURNING id`,
          [randomUUID(), code, template.title, template.worldId, startsAt / 1000, endsAt / 1000,
            String(template.reward), template.distributionMode, template.maxGlobalWinners,
            template.maxRewardClaims, template.id, scheduleKey]);
        if (inserted[0]) {
          huntId = inserted[0].id;
          created++;
        } else {
          const retry = await tx.unsafe(`SELECT id FROM virtual_world_treasure_hunts
            WHERE template_id = $1::uuid AND schedule_key = $2 LIMIT 1`,
            [template.id, scheduleKey]);
          if (!retry[0]) return false;
          huntId = retry[0].id;
        }
      }
      const points = await tx.unsafe(`SELECT sequence, city_id AS "cityId",
          district_id AS "districtId", interactable_id AS "interactableId",
          position_x AS x, position_y AS y, position_z AS z,
          interaction_radius AS radius, clue_payload AS clue
        FROM virtual_world_treasure_template_spawn_points
        WHERE template_id = $1::uuid AND enabled = TRUE
        ORDER BY sequence, id LIMIT 10000`, [template.id]);
      const counts = new Map<number, number>();
      for (const point of points) counts.set(Number(point.sequence),
        (counts.get(Number(point.sequence)) ?? 0) + 1);
      const clueCount = points.length ? Math.max(...points.map((p: any) => Number(p.sequence))) + 1 : 0;
      if (clueCount < 2 || clueCount > 100 ||
          Array.from({ length: clueCount }, (_, index) => counts.get(index) ?? 0)
            .some(count => count < (template.distributionMode === "team" ? 1 : 2))) return false;
      for (const point of points) {
        await tx.unsafe(`INSERT INTO virtual_world_treasure_spawn_points
          (id, hunt_id, sequence, city_id, district_id, interactable_id,
           position_x, position_y, position_z, interaction_radius, clue_payload, enabled)
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, TRUE)
          ON CONFLICT (hunt_id, sequence, interactable_id) DO NOTHING`,
          [randomUUID(), huntId, point.sequence, point.cityId, point.districtId,
            point.interactableId, point.x, point.y, point.z, point.radius,
            JSON.stringify(point.clue ?? {})]);
      }
      return true;
    });
    if (wasCreated) continue;
  }
  return created;
}
