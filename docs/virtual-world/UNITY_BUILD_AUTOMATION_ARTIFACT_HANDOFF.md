# Unity Build Automation — scene registry artifact handoff

This is the separate artifact path for Unity Dashboard → DevOps → Build Automation. It does not depend on GitHub Actions artifacts.

## Build-target configuration

Use the existing target settings:

- Repository: `ukaeke-stack/uceno-social`
- Branch: `feature/uceno-unity-foundation`
- Unity project subfolder: `unity/UCENOVirtualWorld`
- Unity: `6000.3.27f1` (or `6000.3` stable; not beta)
- Platform: Android
- Output: development APK
- Pre-Export Method: `UCENO.VirtualWorld.Editor.BuildCommand.PrepareAndroidBuild`
- Post-Build Script: `scripts/uba-upload-world-registry.sh`

The pre-export method generates the city scene and exports the explicit interactable registry. The post-build script runs after the Unity Editor build and before UBA uploads artifacts. It validates the JSON, creates a SHA-256 checksum, and registers/uploads a second, private, non-primary artifact named **UCENO World Interactables Registry**. The normal APK remains the primary artifact.

## Required private target variables

In Unity Dashboard → Build Automation → Configurations → edit the Android target → Advanced Settings → Environment variables, add the Unity service-account credentials:

| Variable | Value |
|---|---|
| `UCENO_UBA_SERVICE_ACCOUNT_KEY_ID` | Service account key ID |
| `UCENO_UBA_SERVICE_ACCOUNT_SECRET` | Service account secret; keep it secret |

Create a Unity service account and grant it the least privilege needed to create and upload Build Automation artifacts. The uploader encodes `keyId:secret` as HTTP Basic credentials for the current v2 API. A legacy Build Automation API key is not accepted by v2. Do not log either credential.

The script uses UBA's built-in `ORG_ID`, `PROJECT_ID`, `BUILD_TARGET`, and `UCB_BUILD_NUMBER` values. Do not copy these into source control. The API key is never logged.

The post-build script deliberately fails if the registry is absent, empty, malformed, has duplicate IDs, or contains unsupported object kinds. It does not invent markers or silently upload a stale/empty file.

## Manual gateway handoff

1. Run a Unity Build Automation build only after the Editor/scene acceptance gate is satisfied and the build is authorized.
2. In that completed build's artifacts, download **UCENO World Interactables Registry** (not the APK artifact).
3. Verify the downloaded `world-interactables.json` against the included `world-interactables.json.sha256`.
4. Place the verified JSON on the gateway host or its mounted configuration volume.
5. Set the gateway's server-only `WORLD_INTERACTABLES_FILE` to the mounted file path, then restart the gateway instance.
6. Inspect startup logs and run the existing real-process PostgreSQL/WebSocket interaction test against the same registry before exposing the instance.

The transfer is intentionally manual and gated. This change does not deploy a gateway, modify production environment variables, apply migrations, or make the Unity Dashboard artifact URL public. Do not put the UBA API key, database URL, JWT secret, or signed artifact URL in the repository or Unity client.

## Evidence boundary

A passing source check proves only the uploader contract and shell syntax. It does not prove a Unity Build Automation build, artifact upload, registry extraction, deployed gateway load, or physical door/furniture interaction. Those require a real Dashboard build and the handoff steps above.
