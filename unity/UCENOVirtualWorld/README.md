# UCENO Virtual World — Unity starter

This is the Unity city-world client. Source now includes UCENO one-time world-entry authentication, instance assignment, an authenticated WebSocket multiplayer gateway client, authoritative movement snapshots, remote avatars, gestures, seats and server-controlled object interactions. These integrations are not end-to-end verified until migrations and services are deployed, Unity compiles, and two physical devices pass the multiplayer tests.

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

### Unity Build Automation registry artifact handoff

Configure **Advanced Settings → Script Hooks → Post-Build Script** as
`scripts/uba-upload-world-registry.sh`. Keep the existing Pre-Export Method
`UCENO.VirtualWorld.Editor.BuildCommand.PrepareAndroidBuild`. The scene builder
exports the scene interactable registry; the post-build script validates it and
uploads a separate private, non-primary **UCENO World Interactables Registry**
artifact with a SHA-256 checksum before Unity Build Automation completes its
artifact upload.

Add the Unity service-account credentials as private Unity Build Automation target environment variables:
`UCENO_UBA_SERVICE_ACCOUNT_KEY_ID` and `UCENO_UBA_SERVICE_ACCOUNT_SECRET`.
The script reads UBA's built-in `ORG_ID`, `PROJECT_ID`, `BUILD_TARGET`, and
`UCB_BUILD_NUMBER` variables and uses the v2 service-account Basic-auth format.
A legacy Build Automation API key is not accepted by v2. Never add either
credential to GitHub or the repository.

After a successful Dashboard build, download the registry artifact separately
from the APK, verify its checksum, then manually mount it into the gateway and
set `WORLD_INTERACTABLES_FILE`. This is a transfer path, not automatic gateway
deployment. Full instructions: `docs/virtual-world/UNITY_BUILD_AUTOMATION_ARTIFACT_HANDOFF.md`.

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

### Doors and world-object interaction foundation

Add `WorldInteractable` to a real scene object and give it a unique stable ID.
For a door, assign `doorPivot` to the actual door mesh hinge; leaving it empty
prevents rotation rather than rotating the whole building. The scene exporter
includes these marked objects and their world positions in the same JSON map.
Configure the gateway's `WORLD_COLLISION_BOXES_FILE` (or
`WORLD_INTERACTABLES_FILE`) to that map. Unity targets objects with a camera
raycast; desktop uses **E**, and touch devices receive an on-screen action
button. The server checks the object allowlist, interaction type, 4.25-unit
range and request rate, then broadcasts the accepted state to connected players.

The interaction protocol now also supports explicitly marked seats. A newly connected client receives the current authoritative state of every configured interactable, including persisted door/object state and live seat occupancy; it does not have to wait for a future interaction broadcast.
A seat has one server-controlled occupant; another player is rejected while it
is occupied. The seated state is applied to the local avatar only after the
gateway confirms the seat request and is replicated through player snapshots.
Seat occupancy is released when the occupying player's socket disconnects.
The gateway derives seated movement state from its own seat-occupancy map rather
than trusting the client's seated flag. The Unity client clears the local seated
pose on transport loss so reconnect does not leave the avatar stuck sitting.
The current seating pose uses the existing generic seated animation state; it
does not yet align the avatar to a chair-specific sit point or provide IK.

### Persistent doors and usable-object state

Door open/closed state and generic usable-object active/idle state can be
persisted by configuring the gateway's server-only `WORLD_OBJECT_STATE_FILE`
to a writable file on a durable mounted volume. The gateway restores only
state entries whose IDs and kinds still exist in the current scene allowlist;
seat occupancy is deliberately never restored because a disconnected player
must not leave a chair permanently occupied. Writes use a temporary file and
atomic rename. If the configured file cannot be read or written, startup fails
or the interaction is rejected rather than silently claiming persistence.
Without this variable, object state remains in gateway memory and resets on
restart. The volume, backup policy and path permissions must be configured by
the gateway operator; this code does not provision storage.

In the Unity Editor, select the actual imported prop and use
**GameObject → UCENO → Mark Selected as Door / Seat / Usable Object**.
These commands add a marker and unique ID; they do not create fake geometry or
mark every object automatically. For a door, select a correctly positioned
hinge/pivot transform (not the whole building root). For a chair, mark the
chair root or a dedicated seat-point transform. Then run
**UCENO → World → Export Current Scene Collision Map** or rebuild the starter
scene. The exported map must be copied/deployed to the gateway host and loaded
through `WORLD_COLLISION_BOXES_FILE`.

## Generated scene interactables and export status

The starter-scene builder currently authors the following gateway interactables in
its generated plaza area:

- Two seats instantiated from the imported arm-chair prefab.
- One table instantiated from the imported round wooden table prefab.
- One service-door assembly with an explicit hinge pivot. The door leaf, frame
  and handle are currently generated from Unity primitives; this is a functional
  interaction test fixture, **not** an imported architectural door asset.

The builder adds non-trigger targeting colliders and WorldInteractable markers
to these objects. The registry exporter assigns stable scene: IDs from Unity
GlobalObjectId values after the scenes are saved, then checks ID uniqueness,
collider presence, door-pivot validity and exactly-one-district ownership. It
refuses to write an empty registry.

The four generated additive district scenes are loaded before registry export,
so interactables moved into those scenes are included. The gateway registry and
collision map are generated only when the Unity Editor actually runs the scene
builder. Passing repository source checks does **not** mean these scene files
or JSON exports exist.

To perform the actual export, open the project in the pinned Unity Editor and
run **UCENO Virtual World → Build Realistic City Scene** (or run the configured
Unity Build Automation Pre-Export Method
UCENO.VirtualWorld.Editor.BuildCommand.PrepareAndroidBuild). Confirm that
Assets/UCENO/Scenes/UCENO_Starter_World.unity, the four files under
Assets/UCENO/Scenes/Districts/, and
runtime/world-gateway/config/world-interactables.json were generated. Inspect
the registry contents and checksum before uploading it as the separate private
UBA registry artifact. The post-build upload is not a substitute for verifying
that Unity successfully generated the scene and registry.

Object state and seat occupancy currently live in gateway memory unless
WORLD_OBJECT_STATE_FILE is configured on a durable mounted volume. The
current seating pose does not yet align to a chair-specific sit point or use IK.
The service door is a test fixture; imported building doors still need to be
authored against their actual mesh and hinge transforms.

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


## Modular avatar wardrobe authoring

The wardrobe source now supports account-owned inventory and equipped slots, plus runtime replacement of skinned clothing prefabs on the imported Humanoid rig. It does not ship a ready-made clothing catalogue yet.

To add a real garment:
1. Import a properly licensed garment model and rig it to the exact Humanoid skeleton used by the UCENO avatar. Keep the garment's mesh skin weights and bone names intact.
2. Create a prefab with one or more `SkinnedMeshRenderer` components. A plain static mesh or an unweighted mesh is rejected by the runtime equip controller.
3. Place the prefab under `Assets/Resources/Wardrobe/` (or another Resources subfolder) and record its Resources-relative path in an `AvatarWardrobeCatalog` asset at `Assets/Resources/UCENO/AvatarWardrobeCatalog.asset`.
4. Add a matching enabled `avatar_wardrobe_items` database row and grant the item to an account through a trusted server-side fulfilment/admin path. Never grant inventory based on a client request.
5. Test bone remapping, garment clipping, animation deformation and mobile performance before enabling the catalogue row.

The database catalogue starts empty and disabled. Palette tinting is not wardrobe swapping. Account equip persistence is not yet synchronized to remote multiplayer avatars; that requires a separate validated multiplayer snapshot update.
