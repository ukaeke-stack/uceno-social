export type CreditBucket = "earned" | "purchased";
export type LedgerReason = "activity_reward" | "top_up" | "marketplace_purchase" | "refund" | "adjustment";

export type CreditMutation = {
  bucket: CreditBucket;
  reason: LedgerReason;
  amount: number;
  idempotencyKey: string;
  providerVerified?: boolean;
  serverAuthorized?: boolean;
};

export type CreditDecision =
  | { allowed: true; bucket: CreditBucket; amount: number }
  | { allowed: false; reason: string };

const buckets = new Set<unknown>(["earned", "purchased"]);
const reasons = new Set<unknown>(["activity_reward", "top_up", "marketplace_purchase", "refund", "adjustment"]);

/** Runtime validation is required because API/JSON input is not protected by TypeScript types. */
export function validateCreditMutation(input: unknown): CreditDecision {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { allowed: false, reason: "invalid_mutation" };

  const value = input as Record<string, unknown>;
  if (!buckets.has(value.bucket))
    return { allowed: false, reason: "invalid_credit_bucket" };
  if (!reasons.has(value.reason))
    return { allowed: false, reason: "invalid_ledger_reason" };
  if (value.providerVerified !== undefined && typeof value.providerVerified !== "boolean")
    return { allowed: false, reason: "invalid_provider_verification_flag" };
  if (value.serverAuthorized !== undefined && typeof value.serverAuthorized !== "boolean")
    return { allowed: false, reason: "invalid_server_authorization_flag" };
  if (!Number.isSafeInteger(value.amount) || (value.amount as number) <= 0)
    return { allowed: false, reason: "amount_must_be_positive_safe_integer" };
  if (typeof value.idempotencyKey !== "string" || !/^[A-Za-z0-9:_-]{12,128}$/.test(value.idempotencyKey))
    return { allowed: false, reason: "invalid_idempotency_key" };
  if (value.serverAuthorized !== true)
    return { allowed: false, reason: "server_authorization_required" };

  if (value.reason === "activity_reward" && value.bucket !== "earned")
    return { allowed: false, reason: "activity_rewards_must_be_earned_credits" };
  if (value.reason === "top_up" && value.bucket !== "purchased")
    return { allowed: false, reason: "top_ups_must_be_purchased_credits" };
  if (value.reason === "top_up" && value.providerVerified !== true)
    return { allowed: false, reason: "provider_transaction_not_verified" };
  if (value.reason === "marketplace_purchase" && value.bucket !== "purchased")
    return { allowed: false, reason: "marketplace_requires_purchased_credits" };
  if (value.reason === "refund" && value.bucket !== "purchased")
    return { allowed: false, reason: "refund_must_restore_purchased_credits" };

  return { allowed: true, bucket: value.bucket as CreditBucket, amount: value.amount as number };
}

export type MarketplaceReleaseGates = {
  escrowEnabled: boolean;
  sellerSettlementImplemented: boolean;
  refundFlowImplemented: boolean;
  disputeResolutionImplemented: boolean;
  deliveryVerificationImplemented: boolean;
};

/** Checkout is fail-closed for malformed or incomplete release-gate data. */
export function canReleaseMarketplaceCheckout(gates: unknown): boolean {
  if (!gates || typeof gates !== "object" || Array.isArray(gates)) return false;
  const value = gates as Record<string, unknown>;
  const required = [
    "escrowEnabled",
    "sellerSettlementImplemented",
    "refundFlowImplemented",
    "disputeResolutionImplemented",
    "deliveryVerificationImplemented"
  ];
  return required.every((key) => value[key] === true);
}
