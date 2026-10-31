# UCENO Virtual World — Unity starter

This is the first client-side prototype scaffold. It is not yet a multiplayer game and does not connect to UCENO accounts or production services.

## Pinned Unity version

- Unity **6.3 LTS — 6000.3.27f1**
- Project root: `unity/UCENOVirtualWorld`
- Android target: ARM64 development APK through the Unity Editor build pipeline
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

## Android cloud build

The repository includes a manually triggered GitHub Actions workflow at `.github/workflows/uceno-unity-android.yml`.

Before running it, add these GitHub Actions repository secrets under **Settings → Secrets and variables → Actions**:

- `UNITY_LICENSE`: the contents of your Unity Personal license file (`.ulf`).
- `UNITY_EMAIL`: the email address for the Unity account that owns that license.
- `UNITY_PASSWORD`: the Unity account password.

Create and activate a Unity Personal license through Unity Hub on a computer first. Never paste license files, account passwords, keystores or other secrets into source files, issues, pull requests or ChatGPT messages.

Then open **Actions → UCENO Unity Android Development Build → Run workflow**, select this feature branch and run it. A successful run uploads `UCENO-Virtual-World-dev.apk` as a 14-day workflow artifact. This is a development build, not a store-ready release. The workflow has not been run until the required secrets are configured.

## Current scope and limitations

- Offline single-player movement prototype only.
- Runtime-generated placeholder environment and player.
- No login, world-entry token exchange, networking, multiplayer, moderation checks, avatar customization, persistent world state, inventory, credits, purchases or advertising.
- No Android APK or Web build is included in the source commits.
- Source review is not proof of Unity compilation. The cloud build and physical-device checklist must pass before treating the prototype as working.

Do not put Neon credentials, UCENO session secrets, service API keys or production signing keys in this Unity project.
