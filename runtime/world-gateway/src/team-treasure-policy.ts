export interface TeamContribution {
  userId: string;
  points: number;
}
export interface TeamRewardShare {
  userId: string;
  contributionPoints: number;
  amount: bigint;
}

/**
 * Split an Earned Credits reward proportionally to verified contribution.
 * Integer remainder uses the largest-remainder method: highest fractional
 * remainder first, then contribution descending and user ID ascending. This
 * preserves proportional fairness while conserving the complete reward.
 */
export function calculateTeamRewardShares(
  totalReward: bigint,
  contributions: readonly TeamContribution[]
): TeamRewardShare[] {
  if (typeof totalReward !== "bigint" || totalReward < BigInt(0))
    throw new Error("invalid_team_treasure_reward");
  if (!Array.isArray(contributions) || contributions.length < 2 || contributions.length > 20)
    throw new Error("invalid_team_treasure_members");
  const seen = new Set<string>();
  let totalPoints = BigInt(0);
  const members = contributions.map(member => {
    if (!member || typeof member.userId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(member.userId) || seen.has(member.userId) ||
        !Number.isSafeInteger(member.points) || member.points < 0 || member.points > 1_000_000)
      throw new Error("invalid_team_treasure_contribution");
    seen.add(member.userId);
    totalPoints += BigInt(member.points);
    return { userId: member.userId, points: member.points, amount: BigInt(0), remainder: BigInt(0) };
  }).filter(member => member.points > 0);
  if (!members.length || totalPoints === BigInt(0)) throw new Error("team_treasure_has_no_verified_contribution");
  let allocated = BigInt(0);
  for (const member of members) {
    const numerator = totalReward * BigInt(member.points);
    member.amount = numerator / totalPoints;
    member.remainder = numerator % totalPoints;
    allocated += member.amount;
  }
  let remainder = totalReward - allocated;
  const ranked = [...members].sort((a, b) =>
    a.remainder === b.remainder
      ? b.points - a.points || a.userId.localeCompare(b.userId)
      : a.remainder > b.remainder ? -1 : 1);
  for (const member of ranked) {
    if (remainder === BigInt(0)) break;
    member.amount += BigInt(1);
    remainder -= BigInt(1);
  }
  if (remainder !== BigInt(0))
    throw new Error("team_treasure_reward_remainder_invariant_failed");
  return members.sort((a, b) => a.userId.localeCompare(b.userId)).map(member => ({
    userId: member.userId, contributionPoints: member.points, amount: member.amount
  }));
}
