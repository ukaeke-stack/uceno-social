# UCENO Virtual World — remote content delivery

## Architecture

The Android APK remains the primary test client and contains only the boot scene,
authentication/session code, core movement/runtime code, UI, and the minimum
content required to enter the world. Large world regions, optional interiors,
activities, high-detail variants, and later cosmetic packs are delivered through
Unity Addressables.

The browser client is a separate compatible client target. It must use the same
UCENO Social identity, world APIs, gateway admission rules, moderation and social
services; it does not reuse an Android APK.

## Runtime behavior

- Add `WorldContentDelivery` to the persistent world bootstrap object.
- Configure `remoteCatalogUrl` to the versioned HTTPS Addressables catalog URL.
  Do not commit signed URLs, credentials, or storage secrets.
- Mark content groups with stable labels such as `world-city-core`,
  `world-city-district-west`, `home-interiors`, `activity-sports`,
  `activity-racing`, and `avatar-cosmetics`.
- Before entering an area, call `EnsureContent(label, callback)`. The area
  transition must wait for success and show the UI driven by
  `ProgressChanged` and `StatusChanged`; on failure, offer retry and remain
  in the prior safe area.
- Addressables uses Unity's persistent bundle cache. Keep bundle/catalog versions
  immutable and publish a new catalog for content updates; do not overwrite
  already-published bundle files at the same URL.
- Configure a developer-only preload list for selected labels or all test
  labels. Expose that control only in development builds and preferably prompt
  for Wi-Fi; never make manual pre-download a requirement for ordinary players.
- Keep content delivery separate from gameplay authorization. The server still
  decides whether a user may enter a world, home, event, or activity.

## Publishing pipeline

1. Create Addressables groups for boot/core and separately downloadable content.
2. Set the Android and Web content build paths/load paths to a versioned HTTPS
   object-storage/CDN location.
3. Build Addressables content and publish the catalog plus bundles atomically.
4. Deploy the matching catalog URL/configuration to the client build.
5. Verify catalog and bundle hashes, HTTPS access, cache reuse, interrupted
   downloads, retry, low-storage failure, and rollback to the previous catalog.
6. Keep platform-specific bundles separate; Android bundles cannot be assumed
   compatible with WebGL bundles.

No CDN/storage provider, production URL, Addressables group layout, or build
profile has been provisioned by this source change. Those deployment details
must be configured before a live content download can succeed.

## Size and quality policy

Do not reduce geometry, texture quality, avatar quality, or world features merely
to shrink the APK. Use platform-appropriate LODs and texture variants where
needed, but keep high-quality source assets and deliver optional content remotely.
The first install should remain small; content loads automatically on demand and
is cached for subsequent visits. Provide a development preload mode for broad
coverage testing over Wi-Fi.
