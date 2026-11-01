# UCENO Virtual World — complete feature register

This register is the scope ledger for the connected UCENO social platform and virtual worlds. Status is evidence-based: a feature is **implemented** only when code exists for the actual behavior; a button, mock screen, placeholder, or architecture decision does not count.

## Product and platform decisions

- Central World Selection Gateway: one account, one gateway, connected destination worlds.
- UCENO City is the first destination; other worlds are separate connected experiences.
- Android and computer are first-class targets. VR is a later target; a VR headset must not be required for setup, management, or ordinary use.
- Multiple connected worlds, hybrid persistent worlds, and community-created worlds are in scope.
- Entertainment categories accepted: sports, racing, adventure, concerts/social, education, and casual multiplayer.
- Full customizable human avatars are required. Optional photo-based likeness is an opt-in feature, not mandatory identity verification.
- Multiplayer target is thousands of concurrent users across distributed world instances; this requires authoritative backend services and load testing.
- Earned UCENO Credits and Purchased UCENO Credits must remain separate balances/ledger types.
- Advertising purchases may use real money or Purchased UCENO Credits. Earned credits are not an advertising payment method under the current decision.

## Feature status

| Area | Required features | Current evidence/status |
|---|---|---|
| Gateway and navigation | Central world-selection gateway, account continuity, destination cards, return-to-gateway flow, world availability/status | **Not implemented in Unity client.** Architecture decision accepted; UCENO City foundation scene exists separately. |
| UCENO City | Natural city environment, roads, sidewalks, buildings, vegetation, street furniture, vehicles, lighting, collision, navigation | **Partial foundation.** Imported CC0 city assets and Editor scene builder exist. Scene builder now exports actual enabled Unity collider bounds for gateway collision; the map handoff and runtime behavior still require Editor/server/device verification. |
| Connected districts | Beach Resort, Entertainment, Sports, Residential, Nature, Business/Conference and other themed districts | **Not implemented as playable connected districts.** |
| Avatar | Real human body, face, hair, clothing, proportions, skin tone, animation, facial expression, gesture, customization, optional photo likeness | **Partial.** One imported Humanoid FBX, procedural locomotion, wave/cheer, and basic seated/rest pose. Full creator, wardrobe, facial expression system, and photo likeness are not implemented. |
| Movement and interaction | Walk, run, jump, sit/stand, swim, emotes, object interaction, doors, vehicles, furniture interaction | **Partial.** Walk/run/jump, wave/cheer, and generic seated animation are in source. A server-authoritative raycast protocol supports configured doors, generic props and single-occupant seats; disconnect releases seat occupancy. Seat markers export a root/facing anchor used to align the avatar on sit. Unity Editor authoring commands can mark real imported props, but the current generated city has no configured door/chair assets yet. Full foot/hand IK, vehicles and swimming remain unimplemented. |
| Social presence | Friends, presence, private/group text chat, proximity voice, public voice, private rooms | **Some social-platform APIs/UI exist outside the Unity world.** Unity avatar/world integration and proximity/public spatial voice are not verified or implemented here. |
| Multiplayer | Shared avatars, synchronized movement, world instances, party/group travel, authoritative simulation, reconnect and presence | **Partial source foundation.** Authenticated Unity WebSocket client and Node gateway implement server-authoritative kinematic movement, remote snapshots, reconnect, checkpoints, bounded per-instance capacity and initial/subsequent interactable-state synchronization for late joiners. Actual deployment, Unity compilation, two-device testing, lag/reconciliation, distributed scaling and spatial voice remain unverified/outstanding. |
| Homes and spaces | Private homes, ownership/permissions, invitations, furnishing, decoration, persistence | **Partial backend + Unity client foundation.** APIs support home listing/creation, access-controlled retrieval, bounded layout persistence, owner-only invite roster, grant/revoke, and owner-controlled private/invite visibility. The generated Unity player now includes a home manager for list/create/open/save, invite permission selection, roster display/revocation, and catalog-backed furnishing placement/loading, item selection, 15-degree rotation and removal with five imported CC0 furniture models (sofa, armchair, round table, bed, cabinet). Server-side layout validation also bounds coordinates, rotation, scale, asset IDs and furniture count. The current generated scene has no furniture catalog entries or residential interior prefab configured, so furnishing placement, actual home entry/visiting, visual interiors, and deployed database permission flows are not yet verified. |
| Activities | Sports, racing, adventure, concerts, social gatherings, education, casual multiplayer, cinema and community events | **Not implemented as playable activities.** Categories are approved scope, not delivered features. |
| Economy and commerce | Inventory, marketplace, creator shops, earned/purchased credits, transfers, purchase history, refunds and entitlements | **Backend foundation only.** Separate earned/purchased wallet balances and ledger, browse/listing APIs, idempotent purchase/fulfilment/dispute state machine exist in source. Wallet UI, complete checkout/delivery/refund/dispute resolution, seller settlement and Unity integration remain outstanding; credit types must never be merged. |
| Advertising | Advertiser accounts/campaigns, placement inventory, analytics, real-money or Purchased-Credit payment | **Not implemented in virtual world.** Earned credits excluded as a payment method by current decision. |
| Safety and moderation | Mute, block, report, privacy settings, safe zones, moderation actions, audit trail, age-appropriate controls | **Some social-platform moderation APIs exist.** Unity world enforcement, proximity-voice safety and spatial moderation are not verified. |
| Identity and persistence | Single sign-on, secure world-entry tokens, profiles, avatar persistence, inventory and world-state persistence | **Partial social account foundation; Unity integration and persistent-world service not implemented/verified.** |
| Creator tools | Community world creation, publishing, permissions, moderation, asset validation and monetization | **Not implemented.** |
| Platforms and delivery | Android, computer, later WebXR/VR, accessibility, performance tiers, secure updates and release pipeline | **Android Unity foundation only.** Desktop, WebXR and VR builds and release validation remain outstanding. |

## Current Unity source features

- Imported human Humanoid avatar prefab and procedural fallback locomotion.
- WASD/touch movement, camera look, sprint, jump, wave and cheer.
- Camera collision and bounded mouse-wheel/pinch zoom.
- Generic seated/rest animation state; server-authoritative seat claim/release and single-occupant enforcement are implemented in source. Chair-specific alignment/IK is not.
- Position/movement HUD and static source validation.
- Editor export of actual scene collider bounds and explicitly marked interactables for the world gateway.
- Unity Editor menu commands to mark selected real props as doors, seats or usable objects and export the current scene collision map.
- Server-validated, range-limited door/object interactions and synchronized seat occupancy. Door and generic object state can be persisted through a configured durable
gateway file; seat occupancy remains transient and is released on disconnect.

## Implementation sequence

1. Stabilize the real city scene and humanoid in Unity Editor; eliminate visual/build defects.
2. Build the central World Selection Gateway and a real City entry/return path. Do not advertise destinations as playable until each has a real scene/service.
3. Expand UCENO City into distinct, navigable districts using imported environment assets and real collision/navigation.
4. Replace the single default avatar with a configurable character pipeline; add proper authored animation clips, facial blendshapes, wardrobe and optional likeness flow.
5. Add real interaction points (seats, doors, objects) and contextual interaction prompts; then swimming and vehicles.
6. Integrate Unity with the existing UCENO account, messaging, friend, notification and moderation APIs.
7. Design and implement authoritative multiplayer, world instances, presence, spatial voice and persistent state; load-test before claiming scale.
8. Add homes, activities, events, creator worlds and the marketplace/economy.
9. Implement advertiser tools and payment enforcement with the two permitted funding sources.
10. Complete desktop, accessibility, optimization, security, release signing and later WebXR/VR.

## Delivery rules

- Keep the Unity work on the development branch and PR until Unity Editor compilation, scene generation, visual review, Android build and physical-device tests pass.
- Automated source checks are not Unity compilation and do not prove visual or runtime behavior.
- Do not create fake multiplayer avatars, inert feature buttons, or destination cards that imply a feature is playable when it is not.
- Update this register whenever a feature is implemented, tested, blocked, or redesigned.
