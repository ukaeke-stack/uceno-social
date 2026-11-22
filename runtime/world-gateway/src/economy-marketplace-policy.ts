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

/** Validates a proposed ledger mutation before a transaction writes it. */
export function validateCreditMutation(input: CreditMutation): CreditDecision {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    return { allowed: false, reason: "amount_must_be_positive_safe_integer" };
  if (!/^[A-Za-z0-9:_-]{12,128}$/.test(input.idempotencyKey))
    return { allowed: false, reason: "invalid_idempotency_key" };
  if (!input.serverAuthorized)
    return { allowed: false, reason: "server_authorization_required" };

  if (input.reason === "activity_reward" && input.bucket !== "earned")
    return { allowed: false, reason: "activity_rewards_must_be_earned_credits" };
  if (input.reason === "top_up" && input.bucket !== "purchased")
    return { allowed: false, reason: "top_ups_must_be_purchased_credits" };
  if (input.reason === "top_up" && input.providerVerified !== true)
    return { allowed: false, reason: "provider_transaction_not_verified" };
  if (input.reason === "marketplace_purchase" && input.bucket !== "purchased")
    return { allowed: false, reason: "marketplace_requires_purchased_credits" };
  if (input.reason === "refund" && input.bucket !== "purchased")
    return { allowed: false, reason: "refund_must_restore_purchased_credits" };
  return { allowed: true, bucket: input.bucket, amount: input.amount };
}

export type MarketplaceReleaseGates = {
  escrowEnabled: boolean;
  sellerSettlementImplemented: boolean;
  refundFlowImplemented: boolean;
  disputeResolutionImplemented: boolean;
  deliveryVerificationImplemented: boolean;
};

export function canReleaseMarketplaceCheckout(gates: MarketplaceReleaseGates): boolean {
  return gates.escrowEnabled &&
    gates.sellerSettlementImplemented &&
    gates.refundFlowImplemented &&
    gates.disputeResolutionImplemented &&
    gates.deliveryVerificationImplemented;
}
