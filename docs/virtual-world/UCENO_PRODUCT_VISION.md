# UCENO Virtual World — advanced product vision

## Product definition

UCENO is intended to become a connected, persistent digital society combining social networking, immersive 3D worlds, games and activities, entertainment, homes, commerce, creator tools and AI-powered world services. It must be usable on Android and computers without requiring a VR headset. VR/WebXR is a later access mode, not the foundation.

This is a product vision and delivery register, not a claim that these capabilities are already implemented.

## Competitive capability synthesis

- VRChat: expressive avatars, user-created worlds, social presence and live interaction.
- Meta Horizon Worlds: accessible social experiences, multiplayer activities and creator experiences.
- Somnium Space: persistent spaces, property and virtual economy concepts.
- Resonite: powerful creation, collaboration and interactive object systems.
- Second Life: long-lived communities, homes, businesses, events and user-driven commerce.

UCENO should combine the strongest relevant capabilities while avoiding a feature-count contest. The differentiator is that social identity, persistent places, real-time interaction, creator commerce and intelligent world behavior work as one system.

## UCENO differentiators

1. **Living AI society:** optional AI citizens with distinct roles, schedules, personalities, bounded memory and transparent AI identity. Roles include guides, receptionists, shop assistants, event staff and service workers. AI citizens must not impersonate real users.
2. **Connected persistent districts:** city, residential, beach/resort, nature, sports, entertainment, education and business districts, each with real scenes/services and server-backed persistence.
3. **Place-linked social network:** posts, stories, event announcements and business pages can link to an actual in-world location, venue or scheduled event.
4. **Realistic digital identity:** customizable human avatars, facial/voice animation, wardrobe, gestures, portable profile, reputation and achievements. Photo likeness is optional and requires explicit consent.
5. **Homes and lifestyle:** furnished homes, privacy modes, server-authorized entry, guest permissions, decoration, furniture persistence and shared activities.
6. **Playable experiences:** sports, racing, adventure, dance, cinema, concerts, workshops, education and casual multiplayer, each with real interaction rules, state and completion criteria.
7. **User-owned businesses:** stores, restaurants, hotels, services, creator shops, staffing, inventory, customer interactions and analytics.
8. **Separated virtual economy:** earned and purchased credits remain distinct. Real-money payments are provider-verified. Escrow, refunds and seller settlement remain disabled until their complete workflows are independently implemented and tested.
9. **Creator studio:** accessible building tools, asset validation, permissions, publishing, versioning, moderation and monetization.
10. **Intelligent world systems:** dynamic weather/time, ambient activity, event scheduling, safe navigation, world state and AI assistance.
11. **Global communication:** spatial voice, opt-in translation, captions, friend presence, group travel and shared activities.
12. **Trust and governance:** privacy controls, blocking, reporting, safe zones, moderation, appeals, age-appropriate controls and auditable administrative actions.
13. **Cross-device continuity:** one account and synchronized profile, friends, home, permissions, purchases and achievements across Android, desktop and later VR/WebXR.
14. **Scalable world simulation:** authoritative movement and interactions, instance allocation, interest management, persistent checkpoints, regional deployment, monitoring and load testing.

## Architecture principles

- Existing UCENO Social identity and account system remains the single identity source.
- Unity is the 3D client; the backend is authoritative for access, movement, ownership, event participation and economy.
- Do not trust client-supplied transforms, ownership, balances, event attendance or permissions.
- Use separate world instances and bounded regions; never promise unlimited concurrency.
- Stream optimized assets and provide device-quality tiers for low-memory Android devices.
- Build real playable content before exposing a destination as available.
- AI features must be permission-scoped, clearly identified and subject to safety/moderation.
- Never store payment secrets in source control.
- Keep marketplace escrow disabled and Paystack live configuration deferred until the user explicitly authorizes the payment-configuration stage.

## Delivery sequence and acceptance gates

### Current milestone: homes and spatial events
- Furnished residential interior shell with imported catalogue furniture.
- Server-authoritative home entry/exit and guest visiting permissions.
- Spatial event locations, server-authoritative event joining and return flow.
- Database migration and integration tests.
- Unity Editor compilation and scene visual inspection.
- Android build and physical-device testing only after the user requests the build stage.

### Next: playable activity framework
- Activity definitions, entry/exit, server-owned activity state, scoring/results where relevant.
- First playable activities should be small, testable vertical slices rather than decorative buttons.
- No activity is called playable until two clients can participate and server validation is tested.

### World and avatar expansion
- Real connected districts and gateway navigation.
- Avatar customization, authored animation, facial expression and wardrobe.
- Vehicles, transport, object interactions, world navigation and accessible controls.

### Social and creator ecosystem
- Unity integration with existing friends, feeds, messaging, events and moderation.
- Creator building/publishing, user-generated experiences and collaborative editing.
- Spatial voice, translation, captions and live events.

### AI and economy
- AI citizen roles and personal assistant.
- Business operations, inventory, marketplace and creator earnings.
- Payment verification, refund/dispute flows and seller settlement before escrow is ever enabled.

### Platform expansion
- Desktop optimization and release.
- VR/WebXR after the mobile/computer world is stable.
- Distributed capacity tests, security review, accessibility, observability and operational readiness.

## Latest visual foundation implementation record

The Unity Editor scene builder now composes the imported starter assets into a
civic garden square, pedestrian crossing and marked parking bay. These features
reuse the project's existing imported materials and environment prefabs.

A runtime `AvatarAppearanceProfile` component now supports per-avatar skin,
hair, top, trousers and shoe tint palettes using renderer material property
blocks. This avoids creating material instances or recolouring other players'
avatars. Unknown material slots are intentionally left unchanged.

Status: **Implemented in source**. The scene must be regenerated in Unity for
the district layout to appear. Appearance customization currently recolours
recognised material slots; it does not yet provide mesh/wardrobe swaps, face
morphs, hair selection, body-shape editing or a saved account-backed wardrobe.
An `AvatarSocialExpressionDriver` is now attached to the generated humanoid
prefab. It adds subtle idle head motion, an optional gaze target API and
automatic blinking when the imported face mesh exposes compatible blink
blendshapes. Models without facial blendshapes still receive head motion; they
do not gain a fabricated face rig. This is source-level functionality, not a
claim of visually verified facial animation.

Unity Editor compilation, visual inspection and physical-device performance
testing remain outstanding. The starter district is not yet a finished
photorealistic city.

## Evidence-based status rules

Every capability must be marked as one of:
- **Planned:** product requirement only.
- **Implemented in source:** code exists, but may not compile or work at runtime.
- **Automated-tested:** tests pass in CI or local automation.
- **Editor-verified:** Unity Editor compilation and scene inspection pass.
- **Device-verified:** installed and exercised on physical devices.
- **Production-verified:** deployed database/services and production-like end-to-end checks pass.

Source presence is never equivalent to runtime verification.
