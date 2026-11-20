import { randomUUID } from "node:crypto";
import { sanitizeTreasureCluePayload, selectPersonalTreasureRoute } from "./treasure-distribution-policy.js";
import { grantTreasureCollectibles, type CollectibleReward } from "./treasure-collectible-runtime.js";

type PlayerRef = { id: string; worldId: string; x: number; y: number; z: number };
type TargetRef = { id: string; cityId: string; districtId: string };
type Db = { begin<T>(fn: (tx: any) => Promise<T>): Promise<T>; unsafe(query: string, params?: unknown[]): Promise<any[]> };
type Hint = { huntId: string; title: string; sequence: number; clue: unknown };
type Discovery = { handled: boolean; discovered: boolean; completed: boolean; rewardEarnedCredits: string; code?: string; collectibles?: CollectibleReward[]; huntId?: string };

async function ensureRoutes(tx: any, player: PlayerRef, now: number, secret: string): Promise<Hint[]> {
  // Existing assignments are immutable and inserted transactionally. Skip their
  // candidate pools on reconnects and repeat discoveries.
  const hunts = await tx.unsafe(`SELECT id, title FROM virtual_world_treasure_hunts
    WHERE enabled = TRUE AND distribution_mode IN ('personal', 'global')
      AND (world_id IS NULL OR world_id = $1::uuid)
      AND starts_at <= to_timestamp($2) AND ends_at > to_timestamp($2)
      AND NOT EXISTS (SELECT 1 FROM virtual_world_treasure_assignments AS existing
        WHERE existing.hunt_id = virtual_world_treasure_hunts.id AND existing.user_id = $3::uuid)
    ORDER BY starts_at, id LIMIT 20`, [player.worldId, now / 1000, player.id]);
  const assignmentHunts: string[] = [];
  const assignmentUsers: string[] = [];
  const assignmentSequences: number[] = [];
  const assignmentPoints: string[] = [];
  // Load every eligible hunt's authored candidate pool in one query. The
  // previous per-hunt query multiplied database round-trips by active hunts.
  const candidateRows = hunts.length ? await tx.unsafe(`SELECT "huntId", id, sequence,
      "cityId", "districtId", "interactableId"
    FROM (
      SELECT hunt_id AS "huntId", id, sequence, city_id AS "cityId",
        district_id AS "districtId", interactable_id AS "interactableId",
        row_number() OVER (PARTITION BY hunt_id ORDER BY sequence, id) AS hunt_rank
      FROM virtual_world_treasure_spawn_points
      WHERE hunt_id = ANY($1::uuid[]) AND enabled = TRUE
    ) AS ranked
    WHERE hunt_rank <= 10001
    ORDER BY "huntId", sequence, id`, [hunts.map((hunt: any) => hunt.id)]) : [];
  const pointsByHunt = new Map<string, any[]>();
  for (const point of candidateRows) {
    const group = pointsByHunt.get(point.huntId) ?? [];
    if (group.length < 10001) group.push(point);
    pointsByHunt.set(point.huntId, group);
  }
  for (const hunt of hunts) {
    const points = pointsByHunt.get(hunt.id) ?? [];
    // Do not silently accept a truncated candidate pool: doing so would make
    // personal route selection depend on an arbitrary first 10,000 rows.
    if (!points.length || points.length > 10000) continue;
    const clueCount = Math.max(...points.map((p: any) => Number(p.sequence))) + 1;
    if (clueCount < 2 || clueCount > 100) continue;
    const candidatesPerSequence = new Map<number, number>();
    for (const point of points) candidatesPerSequence.set(Number(point.sequence),
      (candidatesPerSequence.get(Number(point.sequence)) ?? 0) + 1);
    // A private route needs at least two real authored alternatives at every step.
    if (Array.from({ length: clueCount }, (_, sequence) =>
      candidatesPerSequence.get(sequence) ?? 0).some(count => count < 2)) continue;
    let route;
    try {
      route = selectPersonalTreasureRoute(hunt.id, player.id, points.map((p: any) => ({
        id: p.id, sequence: Number(p.sequence), cityId: p.cityId,
        districtId: p.districtId, interactableId: p.interactableId
      })), clueCount, secret);
    } catch { continue; }
    for (const assignment of route) {
      assignmentHunts.push(hunt.id);
      assignmentUsers.push(player.id);
      assignmentSequences.push(assignment.sequence);
      assignmentPoints.push(assignment.spawnPointId);
    }
  }
  if (assignmentHunts.length) {
    // Persist every newly derived route in two batched statements rather than
    // issuing one database round-trip per clue step.
    await tx.unsafe(`INSERT INTO virtual_world_treasure_assignments
      (hunt_id, user_id, sequence, spawn_point_id)
      SELECT input.hunt_id, input.user_id, input.sequence, input.spawn_point_id
      FROM unnest($1::uuid[], $2::uuid[], $3::integer[], $4::uuid[])
        AS input(hunt_id, user_id, sequence, spawn_point_id)
      ON CONFLICT (hunt_id, user_id, sequence) DO NOTHING`,
      [assignmentHunts, assignmentUsers, assignmentSequences, assignmentPoints]);
    await tx.unsafe(`INSERT INTO virtual_world_treasure_progress (hunt_id, user_id)
      SELECT hunt_id, $2::uuid FROM unnest($1::uuid[]) AS hunt_ids(hunt_id)
      ON CONFLICT (hunt_id, user_id) DO NOTHING`,
      [[...new Set(assignmentHunts)], player.id]);
  }
  const current = await tx.unsafe(`SELECT hunt.id AS "huntId", hunt.title,
      progress.next_sequence AS sequence, point.clue_payload AS clue
    FROM virtual_world_treasure_progress AS progress
    JOIN virtual_world_treasure_hunts AS hunt ON hunt.id = progress.hunt_id
    JOIN virtual_world_treasure_assignments AS assignment
      ON assignment.hunt_id = progress.hunt_id AND assignment.user_id = progress.user_id
      AND assignment.sequence = progress.next_sequence
    JOIN virtual_world_treasure_spawn_points AS point
      ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
    WHERE progress.user_id = $1::uuid AND progress.completed_at IS NULL
      AND hunt.enabled = TRUE AND hunt.distribution_mode IN ('personal', 'global')
      AND (hunt.world_id IS NULL OR hunt.world_id = $2::uuid)
      AND hunt.starts_at <= to_timestamp($3) AND hunt.ends_at > to_timestamp($3)
    ORDER BY hunt.starts_at, hunt.id LIMIT 20`, [player.id, player.worldId, now / 1000]);
  return current.map((row: any) => ({ huntId: row.huntId, title: row.title,
    sequence: Number(row.sequence), clue: sanitizeTreasureCluePayload(row.clue) }));
}

export async function loadPrivateTreasureHints(
  db: Db, player: PlayerRef, now: number, secret: string
): Promise<Hint[]> {
  if (secret.length < 32) return [];
  return db.begin(async tx => ensureRoutes(tx, player, now, secret));
}

export async function recordPrivateTreasureDiscovery(
  db: Db, player: PlayerRef, target: TargetRef, now: number, secret: string,
  instanceId: string, processId: string, generation: number
): Promise<Discovery> {
  if (secret.length < 32) return { handled: false, discovered: false, completed: false, rewardEarnedCredits: "0" };
  return db.begin(async tx => {
    const owner = await tx.unsafe(`SELECT id FROM virtual_world_instances
      WHERE id = $1::uuid AND owner_process_id = $2::uuid
        AND owner_generation = $3 AND owner_lease_expires_at > clock_timestamp()
      FOR SHARE`, [instanceId, processId, generation]);
    if (!owner.length) return { handled: true, discovered: false, completed: false, rewardEarnedCredits: "0", code: "stale_gateway_owner" };
    await ensureRoutes(tx, player, now, secret);
    const matches = await tx.unsafe(`SELECT hunt.id AS "huntId",
        hunt.distribution_mode AS "distributionMode", hunt.reward_earned_credits AS reward,
        hunt.max_global_winners AS "maxGlobalWinners", hunt.max_reward_claims AS "maxRewardClaims",
        progress.next_sequence AS sequence,
        point.id AS "spawnPointId"
      FROM virtual_world_treasure_assignments AS assignment
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      JOIN virtual_world_treasure_hunts AS hunt ON hunt.id = assignment.hunt_id
      JOIN virtual_world_treasure_progress AS progress
        ON progress.hunt_id = assignment.hunt_id AND progress.user_id = assignment.user_id
        AND progress.next_sequence = assignment.sequence
      WHERE assignment.user_id = $1::uuid AND point.sequence = progress.next_sequence
        AND point.city_id = $2 AND point.district_id = $3 AND point.interactable_id = $4
        AND point.enabled = TRUE
        AND sqrt(power($5 - point.position_x, 2) + power($6 - point.position_y, 2) +
          power($7 - point.position_z, 2)) <= point.interaction_radius
        AND hunt.enabled = TRUE AND hunt.starts_at <= to_timestamp($8)
        AND hunt.ends_at > to_timestamp($8)
      ORDER BY hunt.id LIMIT 2 FOR UPDATE OF hunt, progress`,
      [player.id, target.cityId, target.districtId, target.id, player.x, player.y, player.z, now / 1000]);
    if (!matches.length) return { handled: false, discovered: false, completed: false, rewardEarnedCredits: "0" };
    if (matches.length > 1) return { handled: true, discovered: false, completed: false, rewardEarnedCredits: "0", code: "ambiguous_treasure_assignment" };
    const match = matches[0];
    const totals = await tx.unsafe(`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_assignments WHERE hunt_id = $1::uuid AND user_id = $2::uuid`,
      [match.huntId, player.id]);
    const total = Number(totals[0]?.total ?? 0);
    if (total < 2 || total > 100) return { handled: true, discovered: false, completed: false, rewardEarnedCredits: "0", code: "invalid_private_treasure_route" };
    const inserted = await tx.unsafe(`INSERT INTO virtual_world_treasure_route_discoveries
      (id, hunt_id, user_id, sequence, spawn_point_id, discovered_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, to_timestamp($6))
      ON CONFLICT (hunt_id, user_id, sequence) DO NOTHING RETURNING id`,
      [randomUUID(), match.huntId, player.id, match.sequence, match.spawnPointId, now / 1000]);
    if (!inserted.length) return { handled: true, discovered: false, completed: false, rewardEarnedCredits: "0", code: "treasure_clue_already_discovered" };
    const completed = Number(match.sequence) + 1 === total;
    await tx.unsafe(`UPDATE virtual_world_treasure_progress SET next_sequence = next_sequence + 1,
      completed_at = CASE WHEN $3 THEN to_timestamp($4) ELSE NULL END,
      version = version + 1, updated_at = NOW()
      WHERE hunt_id = $1::uuid AND user_id = $2::uuid`,
      [match.huntId, player.id, completed, now / 1000]);
    if (!completed) return { handled: true, discovered: true, completed: false, rewardEarnedCredits: "0", huntId: match.huntId };
    const isGlobal = match.distributionMode === "global";
    const rewardClaimCap = match.maxRewardClaims === null ? null : Number(match.maxRewardClaims);
    if (isGlobal || rewardClaimCap !== null) {
      const winnerCap = isGlobal && match.maxGlobalWinners !== null
        ? Number(match.maxGlobalWinners) : null;
      if (isGlobal && (winnerCap === null || !Number.isSafeInteger(winnerCap) || winnerCap < 1))
        return { handled: true, discovered: true, completed: true, rewardEarnedCredits: "0", code: "global_treasure_winner_cap_missing", huntId: match.huntId };
      if (rewardClaimCap !== null && (!Number.isSafeInteger(rewardClaimCap) || rewardClaimCap < 1))
        return { handled: true, discovered: true, completed: true, rewardEarnedCredits: "0", code: "treasure_reward_claim_cap_invalid", huntId: match.huntId };
      const caps = [winnerCap, rewardClaimCap].filter((value): value is number => value !== null);
      const cap = Math.min(...caps);
      const claims = await tx.unsafe(`SELECT COUNT(*)::integer AS total
        FROM virtual_world_treasure_global_claims WHERE hunt_id = $1::uuid`, [match.huntId]);
      if (Number(claims[0]?.total ?? 0) >= cap)
        return { handled: true, discovered: true, completed: true, rewardEarnedCredits: "0",
          code: isGlobal ? "global_treasure_claim_limit_reached" : "treasure_reward_claim_limit_reached", huntId: match.huntId };
      await tx.unsafe(`INSERT INTO virtual_world_treasure_global_claims (hunt_id, user_id)
        VALUES ($1::uuid, $2::uuid) ON CONFLICT (hunt_id, user_id) DO NOTHING`, [match.huntId, player.id]);
    }
    const claimed = await tx.unsafe(`UPDATE virtual_world_treasure_progress
      SET reward_issued_at = NOW(), updated_at = NOW()
      WHERE hunt_id = $1::uuid AND user_id = $2::uuid
        AND completed_at IS NOT NULL AND reward_issued_at IS NULL RETURNING hunt_id`,
      [match.huntId, player.id]);
    if (!claimed.length) return { handled: true, discovered: true, completed: true, rewardEarnedCredits: "0", huntId: match.huntId };
    const reward = String(match.reward);
    if (!/^(0|[1-9][0-9]*)$/.test(reward) || reward.length > 19 ||
        (reward.length === 19 && reward > "9223372036854775807"))
      throw new Error("private_treasure_reward_out_of_range");
    if (reward !== "0") await tx.unsafe(`INSERT INTO virtual_world_earned_credit_ledger
      (user_id, ledger_type, currency, amount, idempotency_key, source_type, source_treasure_hunt_id, metadata)
      VALUES ($1::uuid, 'earned', 'earned_credits', $2::bigint, $3, 'treasure_hunt', $4::uuid, $5::jsonb)
      ON CONFLICT (idempotency_key) DO NOTHING`,
      [player.id, reward, "private-treasure:" + match.huntId + ":" + player.id,
        match.huntId, JSON.stringify({ spawnPointId: match.spawnPointId })]);
    const collectibles = await grantTreasureCollectibles(tx, match.huntId, player.id);
    return { handled: true, discovered: true, completed: true, rewardEarnedCredits: reward, collectibles, huntId: match.huntId };
  });
}
