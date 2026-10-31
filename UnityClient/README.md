# UCENO Unity Client Foundation

This folder is the source-controlled starting point for the separate Unity client. It does not change the existing Next.js/Capacitor production application.

## Current scope

- Unity project layout and implementation boundaries.
- A first controllable third-person player prototype.
- Android touch-first input is the target; desktop keyboard/mouse support is included for development.
- No live authentication, multiplayer, billing, or production database connection is included yet.

## Create/open the Unity project

1. Install Unity Hub and a supported Unity 6 LTS editor on a desktop computer.
2. Create a **3D (URP)** project named `UCENOWorld`.
3. Set the project location to this `UnityClient` folder (or create the project there and retain this README).
4. Add Android Build Support (SDK/NDK tools and OpenJDK) through Unity Hub.
5. Add the Web platform build support module for the desktop-browser client.
6. Copy the contents of `Assets/` from this repository into the Unity project's `Assets/` folder if Unity created the project in a separate directory.
7. Open the project and resolve any editor-version prompts before building.

## Initial scene setup

1. Create a scene named `WorldPrototype`.
2. Add a Plane at (0, 0, 0), scale (10, 1, 10).
3. Add a Capsule at (0, 1, 0), add a CharacterController component, and attach `Assets/Scripts/Player/ThirdPersonPlayerController.cs`.
4. Add a Camera and attach `Assets/Scripts/Camera/FollowCamera.cs`; assign the Capsule as its target.
5. Add a directional light. Save the scene as `Assets/Scenes/WorldPrototype.unity`.

The controller supports keyboard movement and mouse look for desktop prototyping. The mobile touch-control UI is a separate next task; do not treat this first controller as a completed phone control scheme.

## Mobile touch input setup

1. Add a Canvas with an EventSystem to the prototype scene.
2. Add two transparent UI Images that cover the left and right halves of the screen; keep Raycast Target enabled.
3. Attach `MobileTouchZone` to each Image.
4. Set the left Image zone mode to `Move` and the right Image zone mode to `Look`.
5. Ensure the player has a CharacterController and the camera has FollowCamera.

The touch input code is present, but the Canvas, images, and EventSystem still need to be assembled and tested in Unity Editor on a real Android device.

## Security boundary

Never place Neon credentials, UCENO session secrets, world-token signing keys, payment keys, or permanent access tokens in Unity assets or builds. Unity must obtain a short-lived, server-issued world access token through the planned one-time handoff API. That API is not implemented yet.

## Current verification status

The scripts are source scaffolding only. They have not been imported or compiled by the Unity Editor, and no Android/WebGL build has been produced.