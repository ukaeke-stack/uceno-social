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

## Unity Editor content-only export (no Android player build)

The Unity Editor now exposes a separate batch-mode entry point:

```bash
Unity -batchmode -quit -projectPath unity/UCENOVirtualWorld -executeMethod UCENO.VirtualWorld.Editor.BuildCommand.ExportWorldContentOnly -logFile -
```

Run this only in an environment with the matching Unity 6000.3 Editor installation and a valid Unity license. It invokes the scene builder, which creates and saves the boot scene plus four additive district scenes, exports the interactable registry and city collision map, then fails unless all seven expected files exist and are non-empty. It does not call `BuildPipeline.BuildPlayer`, switch to Android, or create an APK.

The command is an Editor entry point, not a Unity Build Automation target setting. UBA's existing Android Pre-Export hook still runs as part of an Android player build; do not trigger that target merely to export content. After running the content-only command, archive the generated scene files and gateway JSON outputs from the workspace as a separate, private content artifact. Validate the registry with `scripts/validate-world-interactable-registry.mjs` before any gateway handoff.

The repository includes a separate manual GitHub Actions workflow at `.github/workflows/uceno-unity-content-export.yml`. It uses GameCI's custom `buildMethod` to invoke this Editor method on `StandaloneLinux64`; the custom method is not the default player-build method and does not call `BuildPipeline.BuildPlayer`.

To enable it without exposing credentials:
1. Add the repository Actions variable `UCENO_UNITY_CONTENT_EXPORT_ENABLED` with value `true`.
2. Add the Unity license as the repository Actions secret `UNITY_LICENSE` (and `UNITY_EMAIL` / `UNITY_PASSWORD` only if your GameCI licensing setup requires them). Never commit or paste license contents into source files or chat.
3. Open GitHub Actions → **UCENO Unity Editor Content-Only Export** → Run workflow, selecting `feature/uceno-unity-foundation`.
4. Download the generated `uceno-world-content-only-<run>` artifact only after the workflow succeeds.

The workflow is manual-only and separately gated. It checks the five scene files plus registry and collision-map outputs, compiles the gateway parser, validates the actual registry against the district manifest, computes a SHA-256 checksum, and uploads a 14-day artifact. It does not invoke the Android build workflow, create an APK, upload to Unity Build Automation, or deploy a gateway.

A source-check pass is not evidence that this workflow ran or that exported files exist. The actual export remains unverified until this manual workflow completes successfully.

## Required private target variables

In Unity Dashboard → Build Automation → Configurations → edit the Android target → Advanced Settings → Environment variables, add the Unity service-account credentials:

| Variable | Value |
|---|---|
| `UCENO_UBA_SERVICE_ACCOUNT_KEY_ID` | Service account key ID |
| `UCENO_UBA_SERVICE_ACCOUNT_SECRET` | Service account secret; keep it secret |

Create a Unity service account and grant it the least privilege needed to create and upload Build Automation artifacts. The uploader encodes `keyId:secret` as HTTP Basic credentials for the current v2 API. A legacy Build Automation API key is not accepted by v2. Do not log either credential.

The script uses UBA's built-in `ORG_ID`, `PROJECT_ID`, `BUILD_TARGET`, and `UCB_BUILD_NUMBER` values. Do not copy these into source control. Neither credential is logged.

The post-build script deliberately fails if the registry is absent, empty, malformed, has duplicate IDs, or contains unsupported object kinds. It does not invent markers or silently upload a stale/empty file.

## Manual gateway handoff

1. Run a Unity Build Automation build only after the Editor/scene acceptance gate is satisfied and the build is authorized.
2. In that completed build's artifacts, download **UCENO World Interactables Registry** (not the APK artifact).
3. Verify the downloaded `world-interactables.json` against the included `world-interactables.json.sha256`.
4. Place the verified JSON on the gateway host or its mounted configuration volume.
5. Set the gateway's server-only `WORLD_INTERACTABLES_FILE` to the mounted file path and set `WORLD_REQUIRE_INTERACTABLE_REGISTRY=true`, then restart the gateway instance. The required flag makes startup fail closed if the registry is omitted or empty.
6. Inspect startup logs and run the existing real-process PostgreSQL/WebSocket interaction test against the same registry before exposing the instance.

The transfer is intentionally manual and gated. This change does not deploy a gateway, modify production environment variables, apply migrations, or make the Unity Dashboard artifact URL public. Do not put the UBA API key, database URL, JWT secret, or signed artifact URL in the repository or Unity client.

## Evidence boundary

A passing source check proves only the uploader contract and shell syntax. It does not prove a Unity Build Automation build, artifact upload, registry extraction, deployed gateway load, or physical door/furniture interaction. Those require a real Dashboard build and the handoff steps above.
