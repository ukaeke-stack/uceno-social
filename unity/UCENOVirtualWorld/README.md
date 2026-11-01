# UCENO Virtual World — Unity starter

This is the first offline single-player city-world client. It is not yet a multiplayer game and does not connect to UCENO accounts or production services.

## Pinned Unity version

- Unity **6.3 LTS — 6000.3.27f1**. If Build Automation does not list that exact patch, choose **6000.3 stable**, not **6000.3 beta**.
- Project root: `unity/UCENOVirtualWorld`
- Android target: ARM64 development APK
- The initial prototype uses Unity's legacy `Input` API for keyboard, mouse and touch.

Unity 6.3 LTS is pinned for reproducible builds. Do not upgrade the editor version until the project has been opened and tested with the new version.

## Open locally

1. Install Unity Hub on a computer or use a trusted remote Unity build workstation. A phone alone cannot run the full Unity Editor.
2. Install Unity 6000.3.27f1 with Android Build Support, including Android SDK & NDK Tools and OpenJDK. If only version channels are listed, use 6000.3 stable, not beta. Install Web Build Support when the Web client stage begins.
3. Open this folder as an existing Unity project.
4. Set **Edit → Project Settings → Player → Other Settings → Configuration → Active Input Handling** to **Both** or **Input Manager (Old)**. Restart the Editor if requested.
5. In the Unity menu, choose **UCENO Virtual World → Build Realistic City Scene**. This imports the bundled free models, creates reusable prefabs and builds the playable city scene.
6. Press Play and follow the control instructions below.

## Controls

- Android: drag on the left half of the screen to move; drag on the right half to rotate the camera horizontally and vertically. Hold the **RUN** control to sprint. Two fingers can control movement and camera simultaneously.
- Desktop: WASD/arrow keys to move; hold **Shift** to run; mouse movement to rotate the view.
- A VR headset is not required for this prototype.

## Cloud build option A — Unity Build Automation

This is the preferred route if you only have an Android phone and cannot run the Unity Editor locally. Unity's hosted Build Automation can build from the GitHub repository through the Unity Dashboard; it supports Android and Git-based source control. Check the dashboard's usage estimate before starting a build because cloud build minutes and storage can be billable after included allowances.

1. Create/sign in to a Unity ID and open the [Unity Dashboard](https://dashboard.unity.com/).
2. Open **DevOps → Build Automation** and connect the GitHub repository `ukaeke-stack/uceno-social`.
3. Create an Android build configuration with:
   - Branch: `feature/uceno-unity-foundation`
   - Project subfolder: `unity/UCENOVirtualWorld`
   - Unity version: `6000.3.27f1` or `6000.3` stable if the exact patch is not listed; do not choose beta.
   - Target platform: Android
   - Output: APK (development/test build)
4. In **Advanced Settings → Script Hooks → Pre-Export Method**, enter:
   `UCENO.VirtualWorld.Editor.BuildCommand.PrepareAndroidBuild`
   This method creates/registers the starter scene and applies the development package ID, IL2CPP and ARM64 settings before the hosted builder exports the player.
5. Use an automatically generated debug keystore for development testing. Do not upload a production signing key for this prototype.
6. Save the configuration, but do not trigger a build yet. The Unity Editor import/compile and visual checks must be completed first. An APK build will be requested only after those checks pass and the user authorizes it.

## Cloud build option B — GitHub Actions

The repository also includes `.github/workflows/uceno-unity-android.yml` using GameCI. This alternative needs a Unity Personal license file and GitHub secrets; it is less convenient if you have no computer available to activate/export the license.

Add these GitHub Actions repository secrets:

- `UNITY_LICENSE`: contents of the Unity Personal `.ulf` license file.
- `UNITY_EMAIL`: Unity account email.
- `UNITY_PASSWORD`: Unity account password.

Also add this repository Actions variable:

- `UCENO_UNITY_CI_ENABLED` = `true`

Until the variable is set to `true`, pushes to this feature branch skip the Unity build job. Once the secrets and variable are saved, a new commit to `feature/uceno-unity-foundation` starts the build. The manual workflow-dispatch option becomes available after the workflow is merged into the repository's default branch.

Never paste license files, account passwords, keystores or other secrets into source files, issues, pull requests or ChatGPT messages.

## Free asset import pipeline

The free-asset pipeline generates a rigged Unity Humanoid character using Ara 3D
Gen and downloads selected CC0 city, street and nature models from Poly Haven.
Imported files are kept separate from gameplay code so professional replacements
can be added later without rewriting player movement, camera control or
interaction logic.

- Character source: `Assets/UCENO/Characters/Imported/`
- Environment models: `Assets/UCENO/Environment/Imported/Models/`
- PBR road, pavement and grass maps: `Assets/UCENO/Environment/Imported/Textures/`
- City HDRI: `Assets/UCENO/Environment/Imported/HDRI/`

The exact sources, licences and replacement rules are recorded in
`Assets/UCENO/Documentation/FREE_ASSET_MANIFEST.md`. The Poly Haven API is used
only during development-time import; the shipped client does not call it.

The Editor scene builder now assembles the imported models into reusable
prefabs, adds collision, PBR road/ground materials, the city HDRI, lighting,
a rigged Humanoid avatar and an idle/walk/run blend tree. The player movement
and camera remain separate from the model hierarchy, so later professional
assets can replace the free models without rewriting those systems.

### Authoritative collision geometry handoff

After the scene is generated, the Editor builder scans the actual enabled,
non-trigger Unity colliders (excluding the player) and exports their world-space
bounds to `runtime/world-gateway/data/uceno-city-collision-boxes.json`.
The gateway accepts this generated map through the server-only
`WORLD_COLLISION_BOXES_FILE` environment variable. Point that variable at the
exported JSON file in the gateway deployment and restart the instance. The
existing `WORLD_COLLISION_BOXES` JSON environment variable remains available
for small/manual test maps.

The export uses axis-aligned world bounds, so rotated/irregular meshes are
conservative approximations. This is a first collision bridge, not a full
triangle-mesh or navmesh simulation. The gateway refuses malformed boxes and
caps the map at 500 colliders. Re-export after changing the Unity scene; the
gateway does not automatically read files from the Unity project or synchronize
scene edits while running.

This scene has not yet been opened and compiled in the Unity Editor after the
asset import. Unity compilation, rendering review and physical Android testing
are still required. Asset-import workflows do not run a Unity build and do not
generate an APK.

## Current scope and limitations

- Offline single-player movement prototype only.
- The runtime primitive environment and cube/sphere avatar have been removed. The Editor builder now requires the imported real assets and fails rather than falling back to placeholders.
- No login, world-entry token exchange, networking, multiplayer, moderation checks, avatar customization, persistent world state, inventory, credits, purchases or advertising.
- No Android APK or Web build has been generated yet.
- Source review is not proof of Unity compilation. The cloud build and physical-device checklist must pass before treating the prototype as working.

Do not put Neon credentials, UCENO session secrets, service API keys or production signing keys in this Unity project.
