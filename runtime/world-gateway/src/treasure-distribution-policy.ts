import { createHmac } from "node:crypto";

export type TreasureDistributionMode = "personal" | "team" | "global";
export interface TreasureSpawnCandidate {
  id: string;
  sequence: number;
  cityId: string;
  districtId: string;
  interactableId: string;
}
export interface PersonalTreasureAssignment {
  sequence: number;
  spawnPointId: string;
}

/**
 * Selects one authored spawn candidate per sequence using a server-only secret.
 * The same player receives a stable route on retries, while different players
 * receive independently ordered candidates. Persist the returned assignments;
 * never send the candidate pool or another player's route to a client.
 */
export function selectPersonalTreasureRoute(
  huntId: string,
  userId: string,
  candidates: readonly TreasureSpawnCandidate[],
  clueCount: number,
  assignmentSecret: string
): PersonalTreasureAssignment[] {
  if (!/^[0-9a-f-]{36}$/i.test(huntId) || !/^[0-9a-f-]{36}$/i.test(userId))
    throw new Error("invalid_treasure_assignment_identity");
  if (assignmentSecret.length < 32) throw new Error("treasure_assignment_secret_too_short");
  if (!Number.isInteger(clueCount) || clueCount < 2 || clueCount > 100)
    throw new Error("invalid_treasure_clue_count");
  if (!Array.isArray(candidates) || candidates.length < clueCount || candidates.length > 10000)
    throw new Error("invalid_treasure_spawn_candidates");

  const groups = new Map<number, TreasureSpawnCandidate[]>();
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || !Number.isInteger(candidate.sequence) ||
        candidate.sequence < 0 || candidate.sequence >= clueCount ||
        typeof candidate.id !== "string" || !/^[0-9a-f-]{36}$/i.test(candidate.id) ||
        typeof candidate.cityId !== "string" || !candidate.cityId ||
        typeof candidate.districtId !== "string" || !candidate.districtId ||
        typeof candidate.interactableId !== "string" || !candidate.interactableId ||
        seen.has(candidate.id))
      throw new Error("invalid_treasure_spawn_candidate");
    seen.add(candidate.id);
    const group = groups.get(candidate.sequence) ?? [];
    group.push(candidate);
    groups.set(candidate.sequence, group);
  }
  const result: PersonalTreasureAssignment[] = [];
  const selectedInteractables = new Set<string>();
  for (let sequence = 0; sequence < clueCount; sequence++) {
    const group = groups.get(sequence) ?? [];
    if (!group.length) throw new Error("treasure_spawn_sequence_unavailable");
    const digest = createHmac("sha256", assignmentSecret)
      .update(huntId + ":" + userId + ":" + sequence).digest();
    const offset = digest.readUInt32BE(0) % group.length;
    let candidate = group[offset]!;
    // Avoid assigning the same interactable twice in a single route when
    // alternative authored candidates exist. Candidate IDs are not enough:
    // distinct spawn-point rows can refer to the same in-world interactable.
    for (let step = 0; step < group.length && selectedInteractables.has(candidate.interactableId); step++)
      candidate = group[(offset + step + 1) % group.length]!;
    selectedInteractables.add(candidate.interactableId);
    result.push({ sequence, spawnPointId: candidate.id });
  }
  return result;
}

export interface TreasureRewardPlan {
  mode: TreasureDistributionMode;
  rewardEarnedCredits: bigint;
  maxGlobalWinners: number | null;
  maxRewardClaims: number | null;
}
export function validateTreasureRewardPlan(plan: TreasureRewardPlan): boolean {
  if (!plan || !["personal", "team", "global"].includes(plan.mode) ||
      typeof plan.rewardEarnedCredits !== "bigint" || plan.rewardEarnedCredits < 0n ||
      (plan.maxGlobalWinners !== null && (!Number.isSafeInteger(plan.maxGlobalWinners) ||
        plan.maxGlobalWinners < 1 || plan.maxGlobalWinners > 1_000_000)) ||
      (plan.maxRewardClaims !== null && (!Number.isSafeInteger(plan.maxRewardClaims) ||
        plan.maxRewardClaims < 1 || plan.maxRewardClaims > 1_000_000))) return false;
  if (plan.mode === "global" && plan.maxGlobalWinners === null) return false;
  return true;
}

/** Return only player-facing clue fields. Never serialize spawn coordinates,
 * interactable IDs, internal assignment IDs, or arbitrary authored JSON. */
export function sanitizeTreasureCluePayload(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const output: Record<string, string | number> = {};
  for (const key of ["title", "hint", "description", "mediaAssetId", "clueType"] as const) {
    const item = source[key];
    if (typeof item !== "string" || item.length === 0) continue;
    const max = key === "description" ? 800 : key === "hint" ? 500 : 120;
    if (item.length <= max && !Array.from(item).some(character => character.charCodeAt(0) < 32)) output[key] = item;
  }
  if (Number.isInteger(source.difficulty) && Number(source.difficulty) >= 1 &&
      Number(source.difficulty) <= 5) output.difficulty = Number(source.difficulty);
  return output;
}
