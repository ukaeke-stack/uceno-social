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
| Homes and spaces | Private homes, ownership/permissions, invitations, furnishing, decoration, persistence | **Implemented in source; runtime unverified.** APIs support home listing/creation, access-controlled retrieval, bounded layout persistence, owner-only invite roster, grant/revoke, and owner-controlled private/invite visibility. The Unity home manager now creates a default five-piece starter furnishing layout from imported CC0 furniture assets, builds a 12-by-10-metre residential interior shell with floor, walls, windows, entry door and warm lighting, and renders saved furniture for owners and invitees. Home creation derives its anchor from a fresh server-side player checkpoint rather than trusting a client transform. Home entry/exit now travels through the WebSocket gateway: the server re-checks published-world access, owner/invite permission, blocks and moderation/membership state, then moves the authoritative player to the home spawn; the gateway constrains movement to server-owned room bounds and returns the player to their prior position on exit/disconnect. The client does not teleport itself. Unity Editor compilation, visual review and device verification remain outstanding. |
| Activities | Sports, racing, adventure, concerts, social gatherings, education, casual multiplayer, cinema and community events | **Spatial event participation and one social activity are implemented in source; runtime unverified.** Event creation/listing/RSVP carries a validated activity type, venue label and world-space location. Hosts can use their current player position as the venue. The gateway re-checks event publication, world access, blocks, event time and a persisted GOING RSVP before authoritatively moving the player to the venue; event exit returns to the previous position. Dance events expose a playable synchronized dance gesture: the server validates and replicates the gesture to nearby clients, and the imported humanoid receives a procedural dance animation. Migration 025 has not yet been applied or integration-tested. Sports, racing, adventure, concerts, cinema, education and activity scoring/state remain outstanding. |
| Economy and commerce | Inventory, marketplace, creator shops, earned/purchased credits, transfers, purchase history, refunds and entitlements | **Backend foundation only.** Separate earned/purchased wallet balances and ledger, browse/listing APIs, idempotent purchase/fulfilment/dispute state machine exist in source. Wallet UI, complete checkout/delivery/refund/dispute resolution, seller settlement and Unity integration remain outstanding; credit types must never be merged. |
| Advertising | Advertiser accounts/campaigns, placement inventory, analytics, real-money or Purchased-Credit payment | **Not implemented in virtual world.** Earned credits excluded as a payment method by current decision. |
| Safety and moderation | Mute, block, report, privacy settings, safe zones, moderation actions, audit trail, age-appropriate controls | **Some social-platform moderation APIs exist.** Unity world enforcement, proximity-voice safety and spatial moderation are not verified. |
| Identity and persistence | Single sign-on, secure world-entry tokens, profiles, avatar persistence, inventory and world-state persistence | **Partial social account foundation; Unity integration and persistent-world service not implemented/verified.** |
| Creator tools | Community world creation, publishing, permissions, moderation, asset validation and monetization | **Not implemented.** |
| Platforms and delivery | Android, computer, later WebXR/VR, accessibility, performance tiers, secure updates and release pipeline | **Android Unity foundation only.** Desktop, WebXR and VR builds and release validation remain outstanding. |

## Current Unity source features

- Runtime residential interior builder creates a furnished starter room shell; saved catalogue furniture is loaded from the home layout for owners and authorized visitors.
- Home and event context entry/exit requests are sent over the authenticated WebSocket; the gateway validates access and owns all destination movement. Home movement is bounded by the server's room anchor and exit returns to the previous world position.
- Event records carry activity type, venue label and world-space coordinates; hosts can set the venue from their current player position and GOING attendees can request a server-authorized venue join.
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


## 2026-11-01 account appearance persistence stage

- Added migration 026 defining one account-scoped avatar appearance row per user, shared across worlds/devices. It stores a bounded JSON palette and version/update metadata.
- Added authenticated GET/PUT world appearance endpoints. Requests use the existing world-scoped bearer session or authenticated web session; appearance is keyed by authenticated account ID, never a client-supplied user ID. Palette input is restricted to five validated hex colors.
- Added Unity account appearance sync client and connected it to the customization HUD. It waits for a valid world session, loads the account palette, applies it to the local avatar, and sends updates after customization. The bearer token remains in memory.
- This is source implementation only. Migration 026 is not confirmed applied, endpoints have not been integration-tested, and Unity Editor compilation/device cross-account synchronization have not been verified.
- **Wardrobe swapping remains not implemented.** Current controls recolour existing material slots only; they do not equip/unequip actual clothing meshes, hair models or accessories. The imported avatar has one generated outfit and no verified interchangeable garment catalogue. Do not describe palette tinting as wardrobe support.


## 2026-11-01 modular wardrobe implementation stage

- Added migration 027 with a disabled-by-default wardrobe catalogue, account-owned inventory, and account-equipped slot records. Equipped rows have a composite foreign key to the user's inventory, preventing equipment of an item the account does not own.
- Added authenticated GET/PUT `/api/worlds/:worldId/wardrobe`. The server derives the account from the world session, returns only enabled owned catalogue items, validates slot compatibility and ownership, and persists equip/unequip selections. No client-supplied user ID is accepted.
- Added a data-driven Unity `AvatarWardrobeCatalog`, a Humanoid skinned-mesh `AvatarWardrobeController` that remaps garment bones onto the live avatar rig, an account inventory/equipment sync client, and an in-world wardrobe HUD.
- The wardrobe HUD is attached by the existing avatar customization component. It presents the account's owned items by slot and supports equip/remove actions when inventory and prefab assets exist.
- **Asset/content blocker:** no interchangeable garment/hair/accessory prefab catalogue has been imported or registered yet. The database catalogue is intentionally empty and disabled by default. A prefab must contain correctly weighted SkinnedMeshRenderers using matching Humanoid bone names and be placed under Resources with a matching catalog entry. Therefore actual wardrobe swapping is not yet end-to-end usable or verified.
- **Multiplayer visual replication remains outstanding:** account equip persistence is not proof that remote clients currently receive and render wardrobe changes. The multiplayer snapshot protocol still needs an explicit validated equipped-item representation and remote avatar application.
- Migration 027 is not applied or integration-tested. Unity Editor compilation, rig compatibility, visual review and two-device tests remain outstanding.
