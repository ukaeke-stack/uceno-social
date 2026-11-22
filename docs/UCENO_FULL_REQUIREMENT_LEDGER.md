# UCENO Full Project Requirement Ledger

Last reconciled: 2026-11-22
Active engineering line: `fix/mission-treasure-policy-validation` / draft PR #46
Repository: `ukaeke-stack/uceno-social`

This ledger distinguishes source implementation from CI, deployment, and device verification. A source file or passing unit test is not evidence of production readiness.

## Latest verified repository state
- PR #46 is open, draft, unmerged, and currently mergeable. Current head: `27fdc0ab4b57d4180967e84914fd4c0ee8e565c0` (documentation-only ledger update after the last CI-verified source head).
- All three PR workflows passed on exact source head `91f901d0964ebb600953868ee17dc3f502b28080` (2026-11-22): World Gateway Tests run `45036981801`, World Gateway and Unity Client run `45036981812`, and World Gateway Activity Tests run `45036981781`.
- Verified coverage on `91f901d` includes gateway builds/policy/session tests, PostgreSQL fencing and real-process failover tests, activity TypeScript compile/tests, Unity source validation and root web build. The later `27fdc0a` ledger-only commit has no new workflow evidence; do not describe it as CI-verified.
- The latest verified CI does not establish Unity Editor compilation, imported asset quality, scene correctness, Addressables publication, CDN delivery, or Android device behavior.
- Repository inventory inspection on 2026-11-22 confirmed nine city-specific HDRI `.hdr` files and provenance JSON files under `Assets/UCENO/Cities/<city>/Textures/Skybox/`. The nine city folders currently expose only their `Textures` directory; no city `Prefabs` directory or imported city scene assets were present in those folders. HDRI presence is verified; the 108-prefab imported-art requirement remains unmet.
- A source review of `ImportedCityAssetPackGate.cs` found that imported prefab records currently validate a self-declared source name, HTTPS URL, attribution and allowlisted licence string, but do not verify a retained original source download or local licence-text evidence. A manifest can therefore assert a licence without the gate proving the source package or licence document is present. This is a provenance-control gap to close before accepting any city pack; no assets were accepted or fabricated during this review.

## Release constraints
- Keep PR #46 draft, open, and unmerged until its full review and release gates pass.
- Do not apply migrations 037–043 to production without separate review and approval.
- Keep scheduled hunts disabled until schema, assignment secret, reviewed authored content, and runtime gates are satisfied.
- Do not enable marketplace escrow, seller settlement, refunds, live Paystack, ad charging, or ad serving.
- Do not invent seller payout rules or issue Purchased Credits without server-side provider verification.
- Do not start Unity export, Addressables publishing, deployment, or APK build as a substitute for missing Editor/device validation.
- Never add secrets to Git; do not recreate or replace existing Unity Build Automation credentials.

## Economy and marketplace
| Requirement | Current classification | Remaining proof/work |
|---|---|---|
| Separate Earned and Purchased Credits | Source foundation exists in earlier world migrations and reward ledger | Reconcile every write path and verify DB constraints/integration |
| Append-only Earned Credits ledger | Source foundation and activity reward allocation exist | Dedicated accounting invariants, reversals/adjustments policy, audit review |
| Mission and treasure reward issuance | Source implemented in PR #46 | Production schema not applied; maintain latest-head CI |
| Team contribution allocation and reward caps | Source and PostgreSQL integration coverage in PR #46 | Production migration and real runtime verification |
| Collectible inventory and finite supply | Source and concurrency tests in PR #46 | Production migration and real runtime verification |
| Marketplace listings and Purchased Credit pricing | Earlier source foundation | Seller fulfilment, settlement, refunds, dispute resolution and full UI remain incomplete |
| Escrow purchase state machine | Earlier SQL foundation | Keep disabled; verify full fulfilment/dispute lifecycle before activation |
| Paystack multi-currency top-ups | Provider metadata/issuance foundation only | Initialization, signature verification, webhook replay handling, reconciliation, refunds, secrets and end-to-end tests |
| Advertising marketplace | Campaign draft/review foundation only | Billing, budget debit, delivery, frequency controls, fraud and reporting |
| Seller payouts | Not implemented | Define compliant payout policy before coding |

## AI citizens
- Not verified as implemented: citizen identity/personality profiles, schedules, navigation, perception, memory retention, dialogue, local services, social awareness, moderation escalation, simulation budgets and population scaling.
- Required safeguards: disclose AI identity; no impersonation of real users; no autonomous payments, purchases, credit transfers, account actions or moderation sanctions; bounded memory with retention/deletion controls; rate and compute budgets; abuse reporting and operator shutdown.
- Required verification: deterministic policy tests, prompt-injection/data-boundary tests, load tests, and in-world behavior review.

## Safety, privacy and governance
- Existing gateway admission checks include account moderation, world visibility/membership, owner blocks and session/instance authority checks in source.
- Remaining: end-to-end block/report coverage across text, voice, homes, events, AI citizens and marketplace; moderation audit trails; privacy controls; age-appropriate defaults; anti-harassment controls; appeals; operator tooling; retention/deletion/export; abuse-rate and incident tests.
- Fail closed on missing authorization or moderation state. Never trust client-supplied identity, ownership, currency balances, permissions or moderation outcomes.

## UCENO Social integration
- Existing social account and world entry/session integration is partially represented in source.
- Remaining: verify one canonical account identity (no second registration), account linking/recovery, profile/avatar synchronization, block/mute/report propagation, friend/follow visibility rules, messaging/call policy consistency, notification routing, consent boundaries and account deletion propagation.
- Calling policy remains governed by UCENO Social's mutual-connection rule; world presence must not silently grant call permission.

## Virtual world and nine/ten-city content
- The current gateway configuration describes a ten-city catalogue; reconcile this against the approved product requirement and city list before treating city coverage as complete.
- HDRI provenance checks and partial architecture acquisition are source/artifact evidence only.
- The city art gate still requires complete imported prefabs, reviewed manifests, LODs, textured materials, collision, scene generation and visual acceptance for every city.
- Addressables package 2.7.6 is pinned for the Unity 6000.0-compatible project line. Remote profiles/catalogues/bundles, CDN publication, district collision exports, interactable exports and gateway configuration must match exactly. Addressables source configuration is not proof of published content.
- AI citizens, homes, commerce, activities, spatial voice, avatars, creator tools and governance must be tested in actual scenes, not only source contracts.

## Multiplayer and activities
- PR #46 includes PostgreSQL-backed fencing, takeover, stale-generation rejection, treasure concurrency, reward conservation and finite-supply tests.
- Latest verified head `d4b693385a9cbba3d944bf8e28a9a589a91d25ca` passed all three PR workflows on 2026-11-22. This verification supersedes earlier historical CI notes.
- Failover tests exercise local gateway OS processes against PostgreSQL; this is CI integration coverage, not production multi-host validation.
- Still required: deployed multi-host runtime validation, live voice, real city registry, Unity Editor compilation, Addressables publication, Android two-device testing and recovery tests against deployed infrastructure.

## Release and operational verification
- Production migrations/deployment: not performed for the current work.
- Unity Editor compilation and visual review: not verified.
- Addressables publication/CDN: not verified.
- Android APK and physical-device acceptance: not performed.
- Keep each item above open until evidence is recorded against the exact commit, migration set, environment and test device.
