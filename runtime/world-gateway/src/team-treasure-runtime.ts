import { randomUUID } from "node:crypto";
import { calculateTeamRewardShares } from "./team-treasure-policy.js";
import { selectPersonalTreasureRoute, sanitizeTreasureCluePayload } from "./treasure-distribution-policy.js";
import { grantTreasureCollectiblesToUsers, type CollectibleReward } from "./treasure-collectible-runtime.js";

type Db = {
  begin<T>(fn: (tx: any) => Promise<T>): Promise<T>;
};
type Player = { id: string; worldId: string; x: number; y: number; z: number };
type Target = { id: string; cityId: string; districtId: string };
type TeamResult = { ok: boolean; code?: string; teamId?: string; status?: string; members?: number; maxMembers?: number };
type Hint = { teamId: string; huntId: string; title: string; sequence: number; clue: Record<string, string | number> };
type Discovery = { handled: boolean; discovered: boolean; completed: boolean; rewardEarnedCredits: string; code?: string; huntId?: string; teamId?: string; collectibles?: CollectibleReward[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEAM_MEMBERS = 20;

function validSecret(secret: string): boolean {
  return typeof secret === "string" && Buffer.byteLength(secret, "utf8") >= 32;
}

async function loadTeamRoute(tx: any, huntId: string, teamId: string, secret: string) {
  const points = await tx.unsafe(`SELECT id, sequence, city_id AS "cityId",
      district_id AS "districtId", interactable_id AS "interactableId"
    FROM virtual_world_treasure_spawn_points
    WHERE hunt_id = $1::uuid AND enabled = TRUE
    ORDER BY sequence, id LIMIT 10001`, [huntId]);
  // Fetch one sentinel row beyond the supported pool size so oversized
  // authored content is rejected rather than silently truncated.
  if (!points.length || points.length > 10000) return false;
  const count = Math.max(...points.map((point: any) => Number(point.sequence))) + 1;
  if (count < 2 || count > 100) return false;
  const route = selectPersonalTreasureRoute(huntId, teamId, points.map((point: any) => ({
    id: point.id, sequence: Number(point.sequence), cityId: point.cityId,
    districtId: point.districtId, interactableId: point.interactableId
  })), count, secret);
  await tx.unsafe(`INSERT INTO virtual_world_treasure_team_assignments
    (hunt_id, team_id, sequence, spawn_point_id)
    SELECT $1::uuid, $2::uuid, input.sequence, input.spawn_point_id
    FROM unnest($3::integer[], $4::uuid[]) AS input(sequence, spawn_point_id)
    ON CONFLICT (team_id, sequence) DO NOTHING`,
    [huntId, teamId, route.map(step => step.sequence), route.map(step => step.spawnPointId)]);
  await tx.unsafe(`INSERT INTO virtual_world_treasure_team_progress (hunt_id, team_id)
    VALUES ($1::uuid, $2::uuid) ON CONFLICT (team_id) DO NOTHING`, [huntId, teamId]);
  return true;
}

export async function createTreasureTeam(
  db: Db, huntId: string, userId: string, worldId: string, requestedMaxMembers: number,
  now: number, secret: string
): Promise<TeamResult> {
  if (!UUID.test(huntId) || !UUID.test(userId) || !UUID.test(worldId) || !Number.isFinite(now))
    return { ok: false, code: "invalid_team_identity" };
  if (!validSecret(secret)) return { ok: false, code: "treasure_assignment_secret_unavailable" };
  if (!Number.isSafeInteger(requestedMaxMembers) || requestedMaxMembers < 2 ||
      requestedMaxMembers > MAX_TEAM_MEMBERS) return { ok: false, code: "invalid_team_capacity" };

  return db.begin(async tx => {
    const hunts = await tx.unsafe(`SELECT id FROM virtual_world_treasure_hunts
      WHERE id = $1::uuid AND enabled = TRUE AND distribution_mode = 'team'
        AND (world_id IS NULL OR world_id = $2::uuid)
        AND starts_at <= to_timestamp($3) AND ends_at > to_timestamp($3)
      FOR SHARE`, [huntId, worldId, now / 1000]);
    if (!hunts.length) return { ok: false, code: "team_hunt_unavailable" };
    const existing = await tx.unsafe(`SELECT team.id, team.status
      FROM virtual_world_treasure_team_members AS member
      JOIN virtual_world_treasure_teams AS team ON team.id = member.team_id
      WHERE member.hunt_id = $1::uuid AND member.user_id = $2::uuid LIMIT 1`,
      [huntId, userId]);
    if (existing.length) return { ok: false, code: "already_in_treasure_team", teamId: existing[0].id, status: existing[0].status };

    const teamId = randomUUID();
    await tx.unsafe(`INSERT INTO virtual_world_treasure_teams
      (id, hunt_id, owner_user_id, status, max_members)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'forming', $4)`,
      [teamId, huntId, userId, requestedMaxMembers]);
    const memberInserted = await tx.unsafe(`INSERT INTO virtual_world_treasure_team_members
      (hunt_id, team_id, user_id) VALUES ($1::uuid, $2::uuid, $3::uuid)
      ON CONFLICT (hunt_id, user_id) DO NOTHING RETURNING user_id`,
      [huntId, teamId, userId]);
    if (!memberInserted.length) {
      // Another concurrent create request for this same player won the unique
      // (hunt_id, user_id) claim. Remove this empty team and return its winner.
      await tx.unsafe(`DELETE FROM virtual_world_treasure_teams WHERE id = $1::uuid`, [teamId]);
      const raced = await tx.unsafe(`SELECT team.id, team.status
        FROM virtual_world_treasure_team_members AS member
        JOIN virtual_world_treasure_teams AS team ON team.id = member.team_id
        WHERE member.hunt_id = $1::uuid AND member.user_id = $2::uuid LIMIT 1`,
        [huntId, userId]);
      return { ok: false, code: "already_in_treasure_team",
        ...(raced[0] ? { teamId: raced[0].id, status: raced[0].status } : {}) };
    }
    if (!await loadTeamRoute(tx, huntId, teamId, secret))
      throw new Error("team_treasure_authored_route_unavailable");
    return { ok: true, teamId, status: "forming", members: 1, maxMembers: requestedMaxMembers };
  });
}

export async function joinTreasureTeam(
  db: Db, teamId: string, userId: string, worldId: string, now: number
): Promise<TeamResult> {
  if (!UUID.test(teamId) || !UUID.test(userId) || !UUID.test(worldId) || !Number.isFinite(now))
    return { ok: false, code: "invalid_team_identity" };
  return db.begin(async tx => {
    const rows = await tx.unsafe(`SELECT team.id, team.hunt_id AS "huntId",
        team.status, team.max_members AS "maxMembers", hunt.enabled,
        hunt.distribution_mode AS "distributionMode",
        hunt.starts_at AS "startsAt", hunt.ends_at AS "endsAt"
      FROM virtual_world_treasure_teams AS team
      JOIN virtual_world_treasure_hunts AS hunt ON hunt.id = team.hunt_id
      WHERE team.id = $1::uuid AND (hunt.world_id IS NULL OR hunt.world_id = $2::uuid)
      FOR UPDATE OF team FOR SHARE OF hunt`, [teamId, worldId]);
    if (!rows.length) return { ok: false, code: "team_not_found" };
    const team = rows[0];
    if (team.enabled !== true || team.distributionMode !== "team" || new Date(team.startsAt).getTime() > now ||
        new Date(team.endsAt).getTime() <= now || !["forming", "active"].includes(team.status))
      return { ok: false, code: "team_not_joinable" };
    const member = await tx.unsafe(`SELECT 1 FROM virtual_world_treasure_team_members
      WHERE team_id = $1::uuid AND user_id = $2::uuid`, [teamId, userId]);
    if (member.length) return { ok: true, teamId, status: team.status, code: "already_member" };
    const countRows = await tx.unsafe(`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_team_members WHERE team_id = $1::uuid`, [teamId]);
    const count = Number(countRows[0]?.total ?? 0);
    if (count >= Number(team.maxMembers)) return { ok: false, code: "team_full" };
    const insertedMember = await tx.unsafe(`INSERT INTO virtual_world_treasure_team_members
      (hunt_id, team_id, user_id) VALUES ($1::uuid, $2::uuid, $3::uuid)
      ON CONFLICT (hunt_id, user_id) DO NOTHING RETURNING user_id`,
      [team.huntId, teamId, userId]);
    if (!insertedMember.length)
      return { ok: false, code: "already_in_another_team_for_hunt" };
    const nextCount = count + 1;
    const status = nextCount >= 2 ? "active" : "forming";
    await tx.unsafe(`UPDATE virtual_world_treasure_teams SET status = $2
      WHERE id = $1::uuid AND status IN ('forming', 'active')`, [teamId, status]);
    return { ok: true, teamId, status, members: nextCount, maxMembers: Number(team.maxMembers) };
  });
}

export async function loadTeamTreasureHints(
  db: Db, player: Player, now: number
): Promise<Hint[]> {
  return db.begin(async tx => {
    const rows = await tx.unsafe(`SELECT team.id AS "teamId", hunt.id AS "huntId",
        hunt.title, progress.next_sequence AS sequence, point.clue_payload AS clue
      FROM virtual_world_treasure_team_members AS member
      JOIN virtual_world_treasure_teams AS team ON team.id = member.team_id
      JOIN virtual_world_treasure_hunts AS hunt ON hunt.id = team.hunt_id
      JOIN virtual_world_treasure_team_progress AS progress ON progress.team_id = team.id
      JOIN virtual_world_treasure_team_assignments AS assignment
        ON assignment.team_id = team.id AND assignment.sequence = progress.next_sequence
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      WHERE member.user_id = $1::uuid AND team.status = 'active' AND hunt.distribution_mode = 'team'
        AND (hunt.world_id IS NULL OR hunt.world_id = $3::uuid)
        AND hunt.enabled = TRUE AND hunt.starts_at <= to_timestamp($2)
        AND hunt.ends_at > to_timestamp($2) AND progress.completed_at IS NULL
      ORDER BY hunt.starts_at, team.id LIMIT 20`, [player.id, now / 1000, player.worldId]);
    return rows.map((row: any) => ({ teamId: row.teamId, huntId: row.huntId,
      title: row.title, sequence: Number(row.sequence),
      clue: sanitizeTreasureCluePayload(row.clue) }));
  });
}

export async function recordTeamTreasureDiscovery(
  db: Db, player: Player, target: Target, now: number, secret: string,
  instanceId: string, processId: string, generation: number
): Promise<Discovery> {
  if (!validSecret(secret)) return { handled: false, discovered: false, completed: false, rewardEarnedCredits: "0" };
  return db.begin(async tx => {
    const owner = await tx.unsafe(`SELECT id FROM virtual_world_instances
      WHERE id = $1::uuid AND owner_process_id = $2::uuid
        AND owner_generation = $3 AND owner_lease_expires_at > clock_timestamp()
      FOR SHARE`, [instanceId, processId, generation]);
    if (!owner.length) return { handled: true, discovered: false, completed: false, rewardEarnedCredits: "0", code: "stale_gateway_owner" };

    const matches = await tx.unsafe(`SELECT hunt.id AS "huntId", team.id AS "teamId",
        team.owner_user_id AS "ownerUserId", hunt.reward_earned_credits AS reward,
        hunt.max_reward_claims AS "maxRewardClaims", progress.next_sequence AS sequence,
        point.id AS "spawnPointId", team.status
      FROM virtual_world_treasure_team_members AS member
      JOIN virtual_world_treasure_teams AS team ON team.id = member.team_id
      JOIN virtual_world_treasure_team_progress AS progress ON progress.team_id = team.id
      JOIN virtual_world_treasure_team_assignments AS assignment
        ON assignment.team_id = team.id AND assignment.sequence = progress.next_sequence
      JOIN virtual_world_treasure_spawn_points AS point
        ON point.hunt_id = assignment.hunt_id AND point.id = assignment.spawn_point_id
      JOIN virtual_world_treasure_hunts AS hunt ON hunt.id = team.hunt_id
      WHERE member.user_id = $1::uuid AND team.status = 'active' AND hunt.distribution_mode = 'team'
        AND point.sequence = progress.next_sequence AND point.city_id = $2
        AND point.district_id = $3 AND point.interactable_id = $4 AND point.enabled = TRUE
        AND sqrt(power($5 - point.position_x, 2) + power($6 - point.position_y, 2) +
          power($7 - point.position_z, 2)) <= point.interaction_radius
        AND hunt.enabled = TRUE AND (hunt.world_id IS NULL OR hunt.world_id = $9::uuid)
        AND hunt.starts_at <= to_timestamp($8) AND hunt.ends_at > to_timestamp($8)
      ORDER BY team.id LIMIT 2 FOR UPDATE OF team, progress FOR SHARE OF hunt`,
      [player.id, target.cityId, target.districtId, target.id, player.x, player.y, player.z, now / 1000, player.worldId]);
    if (!matches.length) return { handled: false, discovered: false, completed: false, rewardEarnedCredits: "0" };
    if (matches.length > 1) return { handled: true, discovered: false, completed: false, rewardEarnedCredits: "0", code: "ambiguous_team_treasure_assignment" };
    const match = matches[0];
    const totalRows = await tx.unsafe(`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_team_assignments WHERE team_id = $1::uuid`, [match.teamId]);
    const total = Number(totalRows[0]?.total ?? 0);
    if (total < 2 || total > 100) return { handled: true, discovered: false, completed: false, rewardEarnedCredits: "0", code: "invalid_team_treasure_route" };

    const inserted = await tx.unsafe(`INSERT INTO virtual_world_treasure_team_discoveries
      (id, hunt_id, team_id, sequence, spawn_point_id, discovered_by, discovered_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, to_timestamp($7))
      ON CONFLICT (team_id, sequence) DO NOTHING RETURNING id`,
      [randomUUID(), match.huntId, match.teamId, match.sequence, match.spawnPointId, player.id, now / 1000]);
    if (!inserted.length) return { handled: true, discovered: false, completed: false, rewardEarnedCredits: "0", code: "team_treasure_clue_already_discovered" };

    await tx.unsafe(`UPDATE virtual_world_treasure_team_members
      SET contribution_points = LEAST(1000000, contribution_points + 1)
      WHERE team_id = $1::uuid AND user_id = $2::uuid`, [match.teamId, player.id]);
    const completed = Number(match.sequence) + 1 === total;
    await tx.unsafe(`UPDATE virtual_world_treasure_team_progress SET next_sequence = next_sequence + 1,
      completed_at = CASE WHEN $2 THEN to_timestamp($3) ELSE NULL END,
      version = version + 1, updated_at = NOW() WHERE team_id = $1::uuid`,
      [match.teamId, completed, now / 1000]);
    if (!completed) return { handled: true, discovered: true, completed: false, rewardEarnedCredits: "0", huntId: match.huntId, teamId: match.teamId };

    await tx.unsafe(`UPDATE virtual_world_treasure_teams SET status = 'completed'
      WHERE id = $1::uuid AND status = 'active'`, [match.teamId]);
    // Ordinary clue discoveries share the hunt row lock. Serialize only the
    // final claim-cap section so independent teams can progress concurrently
    // without allowing two completions to consume the same remaining slot.
    await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [match.huntId]);
    const claims = await tx.unsafe(`SELECT COUNT(*)::integer AS total
      FROM virtual_world_treasure_global_claims WHERE hunt_id = $1::uuid`, [match.huntId]);
    const cap = match.maxRewardClaims === null ? null : Number(match.maxRewardClaims);
    if (cap !== null && (!Number.isSafeInteger(cap) || cap < 1))
      return { handled: true, discovered: true, completed: true, rewardEarnedCredits: "0", code: "team_treasure_claim_cap_invalid", huntId: match.huntId, teamId: match.teamId };
    if (cap !== null && Number(claims[0]?.total ?? 0) >= cap)
      return { handled: true, discovered: true, completed: true, rewardEarnedCredits: "0", code: "team_treasure_claim_limit_reached", huntId: match.huntId, teamId: match.teamId };
    await tx.unsafe(`INSERT INTO virtual_world_treasure_global_claims (hunt_id, user_id)
      VALUES ($1::uuid, $2::uuid) ON CONFLICT (hunt_id, user_id) DO NOTHING`,
      [match.huntId, match.ownerUserId]);

    const rewardText = String(match.reward);
    if (!/^(0|[1-9][0-9]*)$/.test(rewardText) || rewardText.length > 19 ||
        (rewardText.length === 19 && rewardText > "9223372036854775807"))
      throw new Error("team_treasure_reward_out_of_range");
    const memberRows = await tx.unsafe(`SELECT user_id AS "userId", contribution_points AS points
      FROM virtual_world_treasure_team_members WHERE team_id = $1::uuid
      ORDER BY user_id FOR UPDATE`, [match.teamId]);
    const shares = calculateTeamRewardShares(BigInt(rewardText), memberRows.map((row: any) => ({
      userId: row.userId, points: Number(row.points)
    })));
    const playerShare = shares.find(share => share.userId === player.id)?.amount ?? BigInt(0);
    for (const share of shares) {
      await tx.unsafe(`INSERT INTO virtual_world_treasure_team_reward_allocations
        (team_id, user_id, contribution_points, amount)
        VALUES ($1::uuid, $2::uuid, $3, $4::bigint)
        ON CONFLICT (team_id, user_id) DO NOTHING`,
        [match.teamId, share.userId, share.contributionPoints, share.amount.toString()]);
      if (share.amount > BigInt(0)) await tx.unsafe(`INSERT INTO virtual_world_earned_credit_ledger
        (user_id, ledger_type, currency, amount, idempotency_key, source_type, source_treasure_hunt_id, metadata)
        VALUES ($1::uuid, 'earned', 'earned_credits', $2::bigint, $3, 'treasure_hunt', $4::uuid, $5::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING`,
        [share.userId, share.amount.toString(), "team-treasure:" + match.teamId + ":" + share.userId,
          match.huntId, JSON.stringify({ teamId: match.teamId, contributionPoints: share.contributionPoints })]);
    }
    const teamMembers = await tx.unsafe(`SELECT user_id AS "userId" FROM virtual_world_treasure_team_members
      WHERE team_id = $1::uuid ORDER BY user_id`, [match.teamId]);
    const collectibleRewards = await grantTreasureCollectiblesToUsers(
      tx, match.huntId, teamMembers.map((member: any) => member.userId)
    );
    const collectibles: CollectibleReward[] = collectibleRewards.get(player.id) ?? [];
    return { handled: true, discovered: true, completed: true, rewardEarnedCredits: playerShare.toString(), collectibles, huntId: match.huntId, teamId: match.teamId };
  });
}
