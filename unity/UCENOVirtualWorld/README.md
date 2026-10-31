# UCENO Virtual World — Unity starter

This is the first client-side prototype scaffold. It is not yet a multiplayer game and does not connect to UCENO accounts or production services.

## Create the Unity project

1. Install Unity Hub on a computer (or use a trusted remote Unity build workstation). A phone alone cannot run the full Unity Editor.
2. Install a supported Unity 6 LTS Editor with Android Build Support (Android SDK/NDK and OpenJDK modules) and Web platform build support.
3. Create a **3D Core** project named `UCENOVirtualWorld`.
4. Copy the contents of this folder into the project root, preserving the `Assets` directory.
5. Open the project and allow Unity to import scripts.
6. In the Unity menu, choose **UCENO Virtual World → Create Starter Scene**.
7. Press Play. The prototype creates a simple ground plane, a capsule player, lighting and a third-person camera.

## Prototype controls

- Android touch: drag on the left half of the screen to move; drag on the right half to rotate the view.
- Desktop: WASD/arrow keys to move; mouse movement to rotate the view.
- A physical VR headset is not required.

## Current technical scope

- Offline single-player movement proof of concept.
- Runtime-generated placeholder environment and player.
- No accounts, networking, multiplayer, avatar customization, persistent world data, purchases, advertising, UCENO Credits or moderation integration.
- No Android APK or WebGL build is included in this commit.

## Build targets to configure in Unity

- Android: switch platform in Build Settings and use IL2CPP/ARM64 for release validation.
- Desktop browser: install the Web Build Support module and build for Web.
- Test touch controls on a real Android device; Editor simulation is not sufficient for release approval.

## Important limitations

The source scaffold is not a substitute for an installed Unity Editor. This repository change does not prove that Unity compiles on a remote runner or that an APK can be produced. Unity licensing and build-runner availability must be configured before adding automated Unity builds. Do not put Neon credentials, session secrets, signing keys or service API secrets in this Unity project.
