export type TreasureRequestBudget = {
  windowStartedAt: number;
  requestCount: number;
};

export function consumeTreasureRequestBudget(
  budget: TreasureRequestBudget,
  now: number,
  limit = 8,
  windowMs = 10_000
): boolean {
  if (!Number.isFinite(now) || !Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isFinite(windowMs) || windowMs < 1) return false;
  // A backwards wall-clock jump must not grant a fresh burst. Fail closed
  // until time catches up; otherwise clock rollback can bypass the rate limit.
  if (!Number.isFinite(budget.windowStartedAt) || !Number.isSafeInteger(budget.requestCount) ||
      budget.requestCount < 0 || now < budget.windowStartedAt) return false;
  if (now - budget.windowStartedAt >= windowMs) {
    budget.windowStartedAt = now;
    budget.requestCount = 0;
  }
  if (budget.requestCount >= limit) return false;
  budget.requestCount++;
  return true;
}
