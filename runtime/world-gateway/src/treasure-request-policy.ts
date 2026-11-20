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
  if (!Number.isFinite(budget.windowStartedAt) || now < budget.windowStartedAt ||
      now - budget.windowStartedAt >= windowMs) {
    budget.windowStartedAt = now;
    budget.requestCount = 0;
  }
  if (!Number.isSafeInteger(budget.requestCount) || budget.requestCount < 0) {
    budget.requestCount = 0;
  }
  if (budget.requestCount >= limit) return false;
  budget.requestCount++;
  return true;
}
