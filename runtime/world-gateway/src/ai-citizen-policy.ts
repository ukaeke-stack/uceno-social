export type CitizenAction =
  | "speak"
  | "navigate"
  | "offer_service"
  | "remember"
  | "purchase"
  | "transfer_credits"
  | "send_message"
  | "change_account"
  | "moderate_user";

export type CitizenContext = {
  disclosedAsAi: boolean;
  userConsentedToInteraction: boolean;
  userBlockedCitizen: boolean;
  operatorDisabled: boolean;
  withinWorldBounds: boolean;
  memoryRetentionDays: number;
  action: CitizenAction;
};

export type CitizenDecision =
  | { allowed: true; reason: "permitted_interaction" | "bounded_memory" }
  | { allowed: false; reason: string };

const NEVER_AUTONOMOUS: ReadonlySet<CitizenAction> = new Set([
  "purchase", "transfer_credits", "change_account", "moderate_user"
]);

/**
 * Conservative deterministic gate for AI-citizen capabilities.
 * This is a policy primitive, not an AI runtime or authorization replacement.
 */
export function decideCitizenAction(context: CitizenContext): CitizenDecision {
  if (context.operatorDisabled) return { allowed: false, reason: "citizen_disabled" };
  if (!context.disclosedAsAi) return { allowed: false, reason: "ai_identity_not_disclosed" };
  if (context.userBlockedCitizen) return { allowed: false, reason: "user_blocked_citizen" };
  if (!context.withinWorldBounds) return { allowed: false, reason: "outside_authorized_world_bounds" };
  if (NEVER_AUTONOMOUS.has(context.action))
    return { allowed: false, reason: "human_authorization_required" };
  if (context.action !== "speak" && !context.userConsentedToInteraction)
    return { allowed: false, reason: "interaction_consent_required" };
  if (context.action === "remember") {
    if (!Number.isInteger(context.memoryRetentionDays) ||
        context.memoryRetentionDays < 0 || context.memoryRetentionDays > 30)
      return { allowed: false, reason: "memory_retention_out_of_bounds" };
    return { allowed: true, reason: "bounded_memory" };
  }
  return { allowed: true, reason: "permitted_interaction" };
}
