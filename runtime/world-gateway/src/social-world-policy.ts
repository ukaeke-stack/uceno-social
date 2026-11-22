export type SocialRelationship = {
  viewerId: string;
  targetId: string;
  isBlocked: boolean;
  isMutuallyConnected: boolean;
  followsTarget: boolean;
};

export type SocialWorldCapability = "view_public_presence" | "send_message" | "start_call" | "enter_private_home";

export function canUseSocialWorldCapability(
  relationship: SocialRelationship,
  capability: SocialWorldCapability,
  hasHomeInvitation = false
): boolean {
  if (!relationship.viewerId || !relationship.targetId ||
      relationship.viewerId === relationship.targetId || relationship.isBlocked) return false;

  switch (capability) {
    case "view_public_presence":
      return true;
    case "send_message":
      return true; // Messaging is not restricted to mutual follows; normal account privacy still applies.
    case "start_call":
      return relationship.isMutuallyConnected;
    case "enter_private_home":
      return hasHomeInvitation;
  }
}
