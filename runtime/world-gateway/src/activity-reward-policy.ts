/**
 * Deterministic policy for issuing gameplay-only Earned Credits.
 *
 * This is a domain guard, not a payment or database integration. Callers must
 * supply a result loaded from the authoritative gateway/database path; never
 * construct this input from a client reward claim. Cash rewards and Purchased
 * Credits are intentionally outside this module.
 */
export interface VerifiedActivityResult {
  source: "authoritative_gateway";
  resultId: string;
  sessionId: string;
  userId: string;
  activityKind: "checkpoint_race" | "dance" | "sports" | "adventure";
  status: "finished" | "dnf" | "left";
  placement: number | null;
  recordedAt: number;
}

export interface EarnedCreditRule {
  baseCredits: number;
  placementBonus: Readonly<Record<number, number>>;
  maximumCreditsPerResult: number;
}

export interface EarnedCreditGrant {
  ledgerType: "earned";
  currency: "earned_credits";
  amount: number;
  idempotencyKey: string;
  sourceResultId: string;
  userId: string;
  sessionId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function calculateEarnedCreditGrant(
  result: VerifiedActivityResult,
  rule: EarnedCreditRule
): { ok: true; grant: EarnedCreditGrant } | { ok: false; code: string } {
  if (!result || result.source !== "authoritative_gateway") return { ok: false, code: "unverified_activity_result" };
  if (![result.resultId, result.sessionId, result.userId].every(value => typeof value === "string" && UUID.test(value)))
    return { ok: false, code: "invalid_activity_identity" };
  if (!["checkpoint_race", "dance", "sports", "adventure"].includes(result.activityKind))
    return { ok: false, code: "unsupported_activity_kind" };
  if (result.status !== "finished") return { ok: false, code: "activity_not_completed" };
  if (!Number.isFinite(result.recordedAt) || result.recordedAt <= 0)
    return { ok: false, code: "invalid_result_timestamp" };
  if (!Number.isInteger(rule.baseCredits) || rule.baseCredits < 0 ||
      !Number.isInteger(rule.maximumCreditsPerResult) || rule.maximumCreditsPerResult < 0 ||
      rule.baseCredits > rule.maximumCreditsPerResult)
    return { ok: false, code: "invalid_reward_rule" };

  let bonus = 0;
  if (result.placement !== null) {
    if (!Number.isInteger(result.placement) || result.placement < 1)
      return { ok: false, code: "invalid_placement" };
    bonus = rule.placementBonus[result.placement] ?? 0;
  }
  if (!Number.isInteger(bonus) || bonus < 0) return { ok: false, code: "invalid_placement_bonus" };

  const amount = Math.min(rule.maximumCreditsPerResult, rule.baseCredits + bonus);
  if (amount <= 0) return { ok: false, code: "no_reward_due" };

  return {
    ok: true,
    grant: {
      ledgerType: "earned",
      currency: "earned_credits",
      amount,
      idempotencyKey: `activity-result:${result.resultId}:earned-credits`,
      sourceResultId: result.resultId,
      userId: result.userId,
      sessionId: result.sessionId
    }
  };
}
