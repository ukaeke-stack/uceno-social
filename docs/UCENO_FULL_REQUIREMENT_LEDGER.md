# UCENO Full Project Requirement Ledger

Last reconciled: 2026-11-22
Active engineering line: `fix/mission-treasure-policy-validation` / draft PR #46
Repository: `ukaeke-stack/uceno-social`

This ledger distinguishes source implementation from CI, deployment, and device verification. A source file or passing unit test is not evidence of production readiness.

## Latest verified repository state
- Newer PR #46 source changes add a separate stable Addressables key to wardrobe catalog definitions, version-pinned remote wardrobe prefab loading (`<prefabKey>@v<assetVersion>`), server-inventory-driven equip and saved-selection loading, and reference-lifetime handling that releases loaded handles one frame after the last equipped instance is removed. Regression source-contract tests cover the key/version and handle-release rules. These changes are source-level only; latest-head CI, Unity Editor compilation, remote catalog publication and device behavior are not yet verified.
- Avatar social gaze was corrected to preserve the evaluated Humanoid pose and remove the prior gaze offset on clips that do not key the head bone. Regression coverage was added; the Unity animation behavior still requires imported-clip preview and device validation.
- The preceding source head `2e08fe4` passed World Gateway Tests, World Gateway Activity Tests, World Gateway and Unity Client, and content-delivery source checks. The dedicated nine-city imported-art release gate failed because the required imported prefab packs and provenance manifests are absent. Those results do not verify the newer wardrobe commits.
- The nine-city specification is explicitly ten-city coverage: Meridian Prime plus Solstice, Verdant, Nexus, Aurora, Saffron, Monsoon, Eclipse, Origin and Atlas. Each of the nine additional cities requires 12 imported prefabs (5 architecture, 4 environment, 3 landmarks), for 108 imported prefabs total, plus nine city-specific HDRIs. HDRI files exist, but the city prefab packs and source manifests remain missing.
- Wardrobe Addressables uses the immutable address convention `<prefabKey>@v<assetVersion>`; the remote catalog and server inventory must publish exactly matching addresses. No Addressables catalog or bundles have been published.

- PR #46 is open, draft, unmerged. Latest source head: `b690f46faa3ca28dab82f8a22e78dc7500c865b1`; GitHub reports it mergeable. The content-delivery source-contract workflow passed on this exact head (run `45043395844`). All three main workflows subsequently passed on `b690f46`: World Gateway Tests `45043395761`, World Gateway Activity Tests `45043395855`, and World Gateway and Unity Client `45043395776`. The dedicated nine-city art release gate still fails because the imported city prefabs and source manifests do not exist.
- All three PR workflows passed on exact source head `488c91b`: World Gateway Tests run `45040932358`, World Gateway and Unity Client run `45040932372`, and World Gateway Activity Tests run `45040932328`. The Unity source-validation job passed, including six new city provenance regression tests; gateway build, PostgreSQL tests, activity tests and web build passed.
- The separate nine-city imported-art release gate run `45040932373` failed as expected because the nine city-specific imported prefab packs and source manifests are absent. This is a real product blocker, not a test harness issue. Its output identifies missing prefab paths and manifests across the cities.
- The previous full CI pass on `91f901d0964ebb600953868ee17dc3f502b28080` is superseded for source validation by the complete passing workflow set on `488c91b`.
- The latest verified CI does not establish Unity Editor compilation, imported asset quality, scene correctness, Addressables publication, CDN delivery, or Android device behavior.
- Repository inventory inspection on 2026-11-22 confirmed nine city-specific HDRI `.hdr` files and provenance JSON files under `Assets/UCENO/Cities/<city>/Textures/Skybox/`. The nine city folders currently expose only their `Textures` directory; no city `Prefabs` directory or imported city scene assets were present in those folders. HDRI presence is verified; the 108-prefab imported-art requirement remains unmet.
- A source review found that the imported-prefab manifest previously trusted self-declared source URLs and licence labels. The Editor gate now requires each of the 108 eventual prefab records to point to a retained original source archive and retained licence document under that city's `Source/` folder, records SHA-256 digests for both, recomputes the hashes, and checks the licence text contains the declared licence identifier. The static Unity source validator also checks for these controls. No city asset packs were accepted or fabricated; the stricter gate intentionally blocks until authentic evidence and assets are supplied. The standalone provenance verifier now also enforces the exact 5/4/3 architecture/environment/landmark distribution and city-owned prefab paths. Nine regression tests passed on source head `624fac5`. The Unity Editor gate now independently enforces those category-specific folder paths and exact licence-ID casing.

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
- Addressables package 2.7.6 is pinned for the Unity 6000.0-compatible project line. Remote profiles/catalogues/bundles, CDN publication, district collision exports, interactable exports and gateway configuration must match exactly. Addressables source configuration is not proof of published content. The client content-delivery component now rejects non-HTTPS remote catalog URLs and releases completed/failed catalog operation handles, while retaining automatic dependency downloads, retries, progress reporting, bounded resident labels, reference-counted leases and additive-scene unloads. Dedicated source-contract workflow passed on `b690f46`; this is not a Unity runtime or CDN test.
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


## Latest engineering checkpoint — 2026-11-22 (PR #46)
- Head `4133c35b849ff0ee733287c7e6eb9316d11db793`: all four source/runtime workflows completed successfully (content-delivery source checks, World Gateway Tests, World Gateway Activity Tests, and World Gateway/Unity Client). The Unity workflow's `unity-source-validation` is static source validation, not Unity Editor compilation.
- The Nine-City Imported Art Release Gate failed as intended. Its log enumerates missing per-city `source-manifest.json` files and configured architecture, environment and landmark prefab files. Do not silence this gate, create empty manifests, or substitute primitive placeholders; only imported, provenance-backed assets with validated metadata can satisfy it.
- Wardrobe Addressables now retain versioned asset handles while equipped, release superseded handles after deferred object destruction, and track deferred releases for teardown cleanup.
- Follow-up hardening now tracks in-flight Addressables load handles before yielding and releases them if the avatar/controller is destroyed during a remote load. Regression source-contract assertions were added.
- Latest source head after that follow-up: `b677fb613475d43e8145e24dbfa2e3fda52d2676`. CI results for this exact head have not yet appeared; do not inherit the prior head's pass status.
- Wardrobe server GET returns `prefabKey` and `assetVersion` from the catalogue row. Client still requires matching local Unity catalogue entries and actual versioned Addressables keys in the form `<prefabKey>@v<assetVersion>`; catalogue population, published bundles and device loading remain unverified.
- No production migration, deployment, Addressables publication, Unity Editor compilation or APK/device test was performed. PR remains draft and unmerged.

- Follow-up after the `4133c35` CI checkpoint: in-flight wardrobe Addressables handles are now tracked from the moment a load begins and released during controller teardown; the source-contract test asserts this path.
- Further account-isolation hardening: asynchronous wardrobe downloads now accept an apply guard tied to the initiating UCENO user ID. A result completing after an account switch is discarded before it can equip an old user's item on the new user's avatar. The sync client also only persists a successful equip while the initiating account is still active. Source-contract assertions cover these guards.
- These follow-up changes are on current PR head `1d623952664302f843fabd67edc90465592d1319`. No CI run has been returned for this exact head yet; Unity source validation, Editor compilation and device behavior remain unverified.

## Latest engineering checkpoint — 2026-11-22 (continued PR #46)
- Exact head `656c24645aa093249ce7d66317e975e33bdd48da` completed World Gateway Tests, World Gateway Activity Tests, World Gateway and Unity Client, and content-delivery source checks successfully. The nine-city imported-art release gate failed because required imported prefabs and source manifests remain absent. Unity source validation passed, but this is not Unity Editor compilation.
- Follow-up source hardening rejects malformed non-object city provenance manifest roots; a regression test was added.
- Wardrobe sync now rejects saved equipment records whose server slot does not match the owned inventory item's catalog slot. The server remains authoritative for item ownership, slot and asset version.
- Account-generation fencing was added to asynchronous wardrobe callbacks and saves, preventing stale requests from crossing account sessions.
- A further concurrency review found that two remote wardrobe requests for the same slot could finish out of order and let an older selection overwrite the user's latest choice. The controller now tracks a monotonically increasing request generation per slot, invalidates pending requests on direct equip and unequip, and releases downloaded handles for superseded requests. Regression source-contract assertions cover these guards.
- Latest source changes after the `656c246` CI checkpoint are not yet verified by CI. Do not inherit the previous head's pass status. Unity Editor compilation, remote Addressables publication, imported art acceptance and Android device behavior remain unverified.
- No production migrations, deployment, Addressables publication or APK build occurred.
## Follow-up checkpoint — 2026-11-22 (avatar session isolation)
- Wardrobe remote loads now use per-slot request generations. A newer equip or unequip invalidates older in-flight requests, preventing network completion order from overriding the user's most recent selection. Superseded download handles are released; regression source-contract assertions were added.
- Avatar appearance synchronization now fences both account ID and world ID. It resets local palette and pending saves when either changes, and checks the captured session generation after asynchronous load/save requests so stale results cannot be applied to a later account/world session.
- The exact CI checkpoint at `656c246` passed the four main workflows; its nine-city art gate failed because actual imported assets/manifests remain absent. The subsequent commits adding malformed-manifest handling, wardrobe slot/request fencing, appearance session fencing and ledger updates still require their own exact-head CI results.
- Unity Editor compilation, actual imported avatar asset/rig validation, Addressables remote catalog delivery and Android device testing remain unverified. No production operations or APK build occurred.

## Latest engineering checkpoint — 2026-11-22 (wardrobe world-session fencing)
- Exact head `8435a81bbb948c8dc1e528489b80407b63ecd389` completed the World Gateway Activity Tests, UCENO World Gateway Tests, content-delivery source checks, and World Gateway/Unity Client workflows successfully. The Nine-City Imported Art Release Gate failed because actual city prefabs and provenance manifests remain absent. This is the last verified checkpoint before the two commits below.
- Wardrobe synchronization now tracks both the authenticated Social user ID and active world ID. A world or account switch increments the session generation, cancels coroutines, clears pending selections and rendered garments, and reloads the active session's wardrobe.
- Wardrobe GET, equip callbacks, Addressables apply guards and PUT saves now verify the captured account, world and generation after asynchronous boundaries. This prevents a response started in one world session from mutating the avatar or persisting selections after the session changes.
- Added source-contract regression assertions for world-ID checks. Commits: `62715fe5fe996e21524dbc5efc897407f74f8067` and `02e1cc029b3dc69c386cec91e335e32a82295e5e`.
- CI results for exact head `02e1cc029b3dc69c386cec91e335e32a82295e5e` have not yet been returned. Do not treat the prior `8435a81` passes as verification of these follow-up changes.
- No Unity Editor compilation, Addressables publication, Android device test, production migration, deployment or APK build occurred.


## Latest engineering checkpoint — 2026-11-22 (treasure policy input validation)
- Hardened `applyTreasureDiscovery` against malformed runtime inputs: null, primitive and array discovery/progress values now return typed fail-closed errors instead of throwing while dereferencing properties.
- Treasure progress validation now rejects malformed completion timestamps (non-finite, non-positive or non-numeric values) before accepting a completed-state marker.
- Added regression tests for malformed discovery payloads, malformed progress objects and invalid completion timestamps.
- Changes are in commits `ba4779a3fe28869ba344f0107e3f33719aca2069`, `a8f28f5436abdb2736d698abbb43d08cf196a75c`, `c51cc0976fb420374d1b042e5e6da463cce04d94` and `8273613c3bbcc5ffc6d8f82c614de37e4646cc06`. No exact-head CI runs were visible when this checkpoint was recorded; treat these changes as unverified until CI completes.
- Previous exact checkpoint `5362e1ab4277302c78b3ded496c5f66ceeb30268` passed content-delivery source checks, World Gateway Tests, Activity Tests and World Gateway/Unity Client; the nine-city art gate failed due to missing imported city assets/manifests. Those results do not verify these later policy changes.
- No production migrations, deployment, Addressables publication, Unity Editor compilation or APK/device test occurred.
