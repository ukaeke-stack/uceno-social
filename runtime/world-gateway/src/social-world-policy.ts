export type SocialRelationship = {
  viewerId: string;
  targetId: string;
  isBlocked: boolean;
  isMutuallyConnected: boolean;
  followsTarget: boolean;
};

export type SocialWorldCapability = "view_public_presence" | "send_message" | "start_call" | "enter_private_home";

const VALID_CAPABILITIES: ReadonlySet<string> = new Set([
  "view_public_presence", "send_message", "start_call", "enter_private_home"
]);

/**
 * Deterministic capability policy. The caller must construct relationship
 * state from authenticated server-side records, never client claims.
 */
export function canUseSocialWorldCapability(
  relationship: SocialRelationship,
  capability: SocialWorldCapability,
  hasHomeInvitation = false
): boolean {
  if (!relationship || typeof relationship !== "object") return false;
  if (typeof relationship.viewerId !== "string" || !relationship.viewerId.trim() ||
      typeof relationship.targetId !== "string" || !relationship.targetId.trim() ||
      relationship.viewerId === relationship.targetId) return false;
  if (typeof relationship.isBlocked !== "boolean" ||
      typeof relationship.isMutuallyConnected !== "boolean" ||
      typeof relationship.followsTarget !== "boolean" ||
      typeof hasHomeInvitation !== "boolean") return false;
  if (typeof capability !== "string" || !VALID_CAPABILITIES.has(capability)) return false;
  if (relationship.isBlocked) return false;

  switch (capability) {
    case "view_public_presence":
      return true;
    case "send_message":
      return true; // Messaging is not restricted to mutual follows; normal account privacy still applies.
    case "start_call":
      return relationship.isMutuallyConnected;
    case "enter_private_home":
      return hasHomeInvitation;
    default:
      return false;
  }
}
