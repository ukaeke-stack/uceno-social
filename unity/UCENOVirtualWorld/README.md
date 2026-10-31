# UCENO Virtual World — Unity starter

This is the first client-side prototype scaffold. It is not yet a multiplayer game and does not connect to UCENO accounts or production services.

## Pinned Unity version

- Unity **6.3 LTS — 6000.3.27f1**
- Project root: `unity/UCENOVirtualWorld`
- Android target: ARM64 development APK
- The initial prototype uses Unity's legacy `Input` API for keyboard, mouse and touch.

Unity 6.3 LTS is pinned for reproducible builds. Do not upgrade the editor version until the project has been opened and tested with the new version.

## Open locally

1. Install Unity Hub on a computer or use a trusted remote Unity build workstation. A phone alone cannot run the full Unity Editor.
2. Install Unity 6000.3.27f1 with Android Build Support, including Android SDK & NDK Tools and OpenJDK. Install Web Build Support when the Web client stage begins.
3. Open this folder as an existing Unity project.
4. Set **Edit → Project Settings → Player → Other Settings → Configuration → Active Input Handling** to **Both** or **Input Manager (Old)**. Restart the Editor if requested.
5. In the Unity menu, choose **UCENO Virtual World → Create Starter Scene**.
6. Press Play and follow the control instructions below.

## Controls

- Android: drag on the left half of the screen to move; drag on the right half to rotate the camera horizontally and vertically. Two fingers can control movement and camera simultaneously.
- Desktop: WASD/arrow keys to move; mouse movement to rotate the view.
- A VR headset is not required for this prototype.

## Cloud build option A — Unity Build Automation

This is the preferred route if you only have an Android phone and cannot run the Unity Editor locally. Unity's hosted Build Automation can build from the GitHub repository through the Unity Dashboard; it supports Android and Git-based source control. Check the dashboard's usage estimate before starting a build because cloud build minutes and storage can be billable after included allowances.

1. Create/sign in to a Unity ID and open the [Unity Dashboard](https://dashboard.unity.com/).
2. Open **DevOps → Build Automation** and connect the GitHub repository `ukaeke-stack/uceno-social`.
3. Create an Android build configuration with:
   - Branch: `feature/uceno-unity-foundation`
   - Project subfolder: `unity/UCENOVirtualWorld`
   - Unity version: `6000.3.27f1`
   - Target platform: Android
   - Output: APK (development/test build)
4. In **Advanced Settings → Script Hooks → Pre-Export Method**, enter:
   `UCENO.VirtualWorld.Editor.BuildCommand.PrepareAndroidBuild`
   This method creates/registers the starter scene and applies the development package ID, IL2CPP and ARM64 settings before the hosted builder exports the player.
5. Use an automatically generated debug keystore for development testing. Do not upload a production signing key for this prototype.
6. Save the configuration and trigger one build. Download the artifact only after the dashboard reports success.

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

## Current scope and limitations

- Offline single-player movement prototype only.
- Runtime-generated placeholder environment and player.
- No login, world-entry token exchange, networking, multiplayer, moderation checks, avatar customization, persistent world state, inventory, credits, purchases or advertising.
- No Android APK or Web build has been generated yet.
- Source review is not proof of Unity compilation. The cloud build and physical-device checklist must pass before treating the prototype as working.

Do not put Neon credentials, UCENO session secrets, service API keys or production signing keys in this Unity project.
