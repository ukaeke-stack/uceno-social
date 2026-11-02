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

- `WorldAreaContentBinding` installs itself beside the active `WorldGatewayClient` after scene load and creates `WorldContentDelivery` when one is not already present. The delivery component survives with the gateway object.
- Configure `remoteCatalogUrl` to the versioned HTTPS Addressables catalog URL.
  Do not commit signed URLs, credentials, or storage secrets.
- Mark content groups with stable labels such as `world-city-core`,
  `world-city-district-west`, `home-interiors`, `activity-sports`,
  `activity-racing`, and `avatar-cosmetics`.
- Home and event entry now run a client-side content preflight before the gateway
  sends `home_enter` or `event_join`. The player remains in the current area
  while Addressables resolves and downloads the required label. Only after a
  successful preload does the client send the admission request; the server
  remains authoritative and may still reject it.
- A failed download cancels the travel request and leaves the player in the
  current area. The transition overlay reports the failure. Reattempting travel
  invokes the Addressables size/cache check again.
- The post-admission binding remains as a safety net for confirmed location
  changes and cached-content verification. It should not cause another network
  download when the label is already cached.
- Addressables uses Unity's persistent bundle cache. Keep bundle/catalog versions
  immutable and publish a new catalog for content updates; do not overwrite
  already-published bundle files at the same URL.
- Configure a developer-only preload list for selected labels or all test
  labels. Expose that control only in development builds and preferably prompt
  for Wi-Fi; never make manual pre-download a requirement for ordinary players.
- Preflight also covers joining known playable activity sessions. The session's
  server-provided kind maps to `activity-sports`, `activity-racing`,
  `activity-dance`, or `activity-adventure`; the join packet is not sent until
  the corresponding content is ready. Unknown activity kinds retain the
  existing server admission flow and should not be assigned a guessed bundle.
- District streaming now uses operator-authored server rectangles in the same
  X/Z coordinate system as the Unity city. The gateway validates unique IDs,
  non-overlapping bounds, world limits and the
  `world-city-district-<name>` content-label namespace.
- On crossing a district boundary, the server pauses horizontal movement and
  issues a one-time district/content nonce. Unity preloads the server-selected
  Addressables label and acknowledges with that nonce; the gateway allows
  movement only after the matching acknowledgement. Turning back cancels the
  pending transition. The client cannot choose the district, geometry or label.
- Configure matching `WORLD_DISTRICTS` or `WORLD_DISTRICTS_FILE` metadata in
  each gateway instance and publish the matching district labels in the
  platform-specific Addressables catalog. No production geometry, catalog or
  CDN is configured by this source change.
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
