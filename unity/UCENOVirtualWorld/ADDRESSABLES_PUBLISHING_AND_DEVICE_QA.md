# UCENO Virtual World — Addressables publishing and Android verification

This is the release procedure for remote world-area content. It does not authorize a production deployment, migration, or APK release.

## Delivery contract

- The Android APK contains the bootstrap scene, authentication/session flow, world gateway client, minimal shared-world fallback, and the Addressables runtime.
- Large city districts, home interiors, event venues, and other optional areas are delivered as Addressables content. Do not place the complete world catalogue in the APK.
- The gateway remains authoritative for district admission. The client downloads the exact `contentLabel` supplied by the authenticated gateway and acknowledges readiness only after the additive scene is resident.
- Addressables owns the persistent bundle cache. Runtime code must acquire a residency lease before using a content label and release that lease when leaving the area.
- A download or scene-load failure must leave the player in the safe core fallback; it must not fabricate a successful district admission.
- Catalog and bundle endpoints must use HTTPS. Never embed bearer tokens, database credentials, signing credentials, or private storage keys in Addressables settings or catalog URLs.

## Authoring and publishing sequence

1. Open `unity/UCENOVirtualWorld` in the project's pinned Unity 6000.3 Editor and allow Package Manager to resolve the checked-in manifest and lock file.
2. Confirm Addressables is installed and the intended Addressables Settings asset is present. Do not create a second settings asset or silently change the active profile.
3. Keep the bootstrap scene and essential fallback assets in the local build. Mark downloadable district scenes as Addressable and assign each district the exact stable content label expected by the gateway's authored city/district export. The scene address may differ from that label.
4. Keep labels deterministic and unique. Do not derive labels from display names. Every district label must resolve to exactly one Addressables scene location; labels that resolve to zero or multiple scenes are rejected by the client. A published label is an API contract between the reviewed world export, gateway admission response, and Unity content catalogue.
5. Configure the active build profile with an HTTPS remote build/load path. Use a versioned release prefix for each published content set; never overwrite bundles already referenced by a live catalog.
6. Build Addressables for Android using the same Unity version, scripting backend, target architecture, and compression settings intended for the Android player.
7. Upload the generated catalog, catalog hash, and bundles together to the configured remote content origin. Preserve the generated relative paths. Verify the catalog and every referenced bundle return successful HTTPS responses before publishing the player.
8. Publish the matching Android player only after the remote catalogue is reachable. Keep the previous catalogue and bundles available for rollback until the new player/content pair is verified.
9. Record the Unity version, Addressables package version, profile name, content build timestamp, catalogue hash, and artifact location in the release record. Do not commit generated bundle binaries or credentials to Git.

## Android verification matrix

Run these checks on a physical Android device; source validation alone is not a substitute.

- **Fresh install / first launch:** APK installs, authentication succeeds, bootstrap scene opens, and core fallback is playable without downloading every district.
- **First area visit:** entering an authorized district reports progress, downloads only that label's dependencies, loads the additive scene, and acknowledges readiness after the scene is resident.
- **Warm revisit:** leaving releases the scene lease; re-entering reuses cached bundles and does not download the same content again.
- **Area transition:** moving from district A to B keeps A resident until B is admitted and loaded, then releases A. No duplicate lease or orphaned additive scene remains.
- **Interrupted download:** disable network during a download, restore it, retry, and confirm bounded retries, clear status, and no false-ready acknowledgement.
- **Catalog update:** install against catalog N, publish catalog N+1 under a versioned path, relaunch, and confirm the client discovers the new content without invalidating the old cache prematurely.
- **Missing/invalid label:** unknown labels fail closed and preserve the core fallback.
- **Memory pressure:** visit and leave several large areas; verify the resident-label cap is respected and released assets are reclaimed.
- **Application lifecycle:** background/foreground and process termination during download or scene load do not strand a server-side district admission or leak a loaded scene on the next session.
- **Offline restart:** previously cached content remains usable when its catalog and bundle cache are still valid; uncached areas show a recoverable failure.

## Release gates

- Unity Editor compilation and Android player build complete with no errors.
- Addressables Android content build completes and the published catalog/bundles are externally reachable over HTTPS.
- The Android verification matrix passes on the target device and records the device model, Android version, Unity version, catalog hash, and test outcome.
- Gateway export validation confirms every referenced district label resolves to exactly one intended Addressables entry; no placeholder city or district content is permitted.
- No production migration, scheduled-hunt enablement, deployment, PR merge, or APK distribution is implied by passing these checks. Those remain separate, explicitly approved release actions.
